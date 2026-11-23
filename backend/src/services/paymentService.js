const bcrypt = require('bcryptjs');
const Payment = require('../models/Payment');
const Offer = require('../models/Offer');
const prisma = require('../config/db');
const darajaService = require('./darajaService');
const offerService = require('./offerService');
const smsService = require('./smsService');
const logger = require('../utils/logger');

const SAFE_PROVIDER_FAILURE = 'Provider request outcome is unknown; manual reconciliation is required';

class PaymentServiceError extends Error {
  constructor(status, message, code, payment = null) {
    super(message);
    this.name = 'PaymentServiceError';
    this.status = status;
    this.code = code;
    this.payment = payment;
  }
}

function toPlain(document) {
  if (!document) return null;
  if (typeof document.toObject === 'function') {
    return document.toObject({ virtuals: false, versionKey: false });
  }
  return { ...document };
}

function documentId(document) {
  return document?._id ?? document?.id;
}

function identifierFilter(identifier) {
  const normalized = typeof identifier === 'string' ? identifier.trim() : '';
  if (!normalized || normalized.length > 80) {
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  if (/^[a-f\d]{24}$/i.test(normalized)) return { _id: normalized };
  return { reference: normalized.toUpperCase() };
}

function offerDocumentFilter(offer) {
  const id = documentId(offer);
  if (id) return { _id: id };
  if (offer?.reference) return { reference: offer.reference };
  throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
}

function normalizeReference(value) {
  const reference = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!reference || reference.length > 80 || !/^[A-Z0-9][A-Z0-9._:-]*$/.test(reference)) {
    throw new PaymentServiceError(
      400,
      'reference is required and may contain letters, numbers, dot, underscore, colon, or hyphen',
      'INVALID_PAYMENT_REFERENCE'
    );
  }
  return reference;
}

function sameIdentifier(left, right) {
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && String(left) === String(right);
}

function purposeForOffer(offer) {
  if (offer.tradeType === 'direct') return 'direct_purchase';
  if (offer.tradeType === 'consignment') return 'consignment';
  throw new PaymentServiceError(409, 'Offer trade type is invalid', 'INVALID_TRADE_TYPE');
}

function positiveFinite(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new PaymentServiceError(409, `${name} must be positive`, 'PAYOUT_NOT_READY');
  }
  return parsed;
}

function calculatePayoutAmounts(offer) {
  if (offer.tradeType === 'direct') {
    const weighedKg = positiveFinite(offer.weighedKg, 'weighedKg');
    const agreedPricePerKg = positiveFinite(offer.agreedPricePerKg, 'agreedPricePerKg');
    const grossAmount = weighedKg * agreedPricePerKg;
    const payoutAmount = Math.round(grossAmount);
    if (!Number.isSafeInteger(payoutAmount) || payoutAmount <= 0) {
      throw new PaymentServiceError(409, 'Calculated payout is invalid', 'INVALID_PAYOUT_AMOUNT');
    }
    return {
      grossAmount,
      commissionAmount: 0,
      payoutAmount,
    };
  }

  if (offer.tradeType === 'consignment') {
    const grossAmount = positiveFinite(offer.saleAmount, 'saleAmount');
    const commissionPercent = Number(offer.commissionPercent);
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      throw new PaymentServiceError(
        409,
        'Commission snapshot is invalid',
        'INVALID_COMMISSION_SNAPSHOT'
      );
    }
    const commissionAmount = grossAmount * commissionPercent / 100;
    const payoutAmount = Math.round(grossAmount - commissionAmount);
    if (!Number.isSafeInteger(payoutAmount) || payoutAmount <= 0) {
      throw new PaymentServiceError(409, 'Calculated payout is invalid', 'INVALID_PAYOUT_AMOUNT');
    }
    return { grossAmount, commissionAmount, payoutAmount };
  }

  throw new PaymentServiceError(409, 'Offer trade type is invalid', 'INVALID_TRADE_TYPE');
}

function sanitizePayment(payment) {
  const source = toPlain(payment);
  if (!source) return null;
  return {
    id: String(documentId(source)),
    offerId: String(source.offerId),
    farmerId: source.farmerId,
    amount: source.amount,
    method: source.method,
    reference: source.reference,
    purpose: source.purpose,
    status: source.status,
    originatorConversationId: source.originatorConversationId ?? null,
    conversationId: source.conversationId ?? null,
    transactionId: source.transactionId ?? null,
    resultCode: source.resultCode ?? null,
    resultDescription: source.resultDescription ?? null,
    requestedAt: source.requestedAt,
    submittedAt: source.submittedAt ?? null,
    completedAt: source.completedAt ?? null,
    failedAt: source.failedAt ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function loadFarmer(farmerId, { includePin = false } = {}) {
  return prisma.user.findUnique({
    where: { id: farmerId },
    select: {
      id: true,
      role: true,
      phone: true,
      farmerVerifiedAt: true,
      mpesaNumber: true,
      ...(includePin ? { ussdPinHash: true } : {}),
    },
  });
}

function assertEligible(offer, farmer) {
  if (offer.status !== 'verified') {
    throw new PaymentServiceError(
      409,
      'Only verified offers can be paid',
      'OFFER_NOT_VERIFIED'
    );
  }
  if (!farmer || farmer.role !== 'FARMER' || !farmer.farmerVerifiedAt) {
    throw new PaymentServiceError(
      409,
      'The farmer must be verified before payout',
      'FARMER_NOT_VERIFIED'
    );
  }
  if (!offer.paymentDetailsConfirmedAt) {
    throw new PaymentServiceError(
      409,
      'The farmer must confirm payout details before payout',
      'PAYMENT_DETAILS_NOT_CONFIRMED'
    );
  }
  if (!farmer.mpesaNumber) {
    throw new PaymentServiceError(409, 'The farmer has no M-Pesa number', 'MPESA_NUMBER_REQUIRED');
  }
  try {
    darajaService.normalizePartyB(farmer.mpesaNumber);
  } catch (err) {
    throw new PaymentServiceError(409, 'The farmer M-Pesa number is invalid', 'INVALID_MPESA_NUMBER');
  }
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.code === '11000';
}

async function findExistingPayment({ offerId, purpose, reference }) {
  const byReference = await Payment.findOne({ reference });
  if (byReference) {
    const existing = toPlain(byReference);
    if (!sameIdentifier(existing.offerId, offerId) || existing.purpose !== purpose) {
      throw new PaymentServiceError(
        409,
        'Payment reference is already used by another payout',
        'PAYMENT_REFERENCE_CONFLICT'
      );
    }
    return byReference;
  }

  const byOffer = await Payment.findOne({ offerId, purpose });
  if (byOffer) {
    throw new PaymentServiceError(
      409,
      'A payout ledger already exists for this offer and purpose',
      'PAYOUT_ALREADY_EXISTS'
    );
  }
  return null;
}

async function resolveCreateConflict({ offerId, purpose, reference }) {
  const byReference = await Payment.findOne({ reference });
  if (byReference) {
    const existing = toPlain(byReference);
    if (sameIdentifier(existing.offerId, offerId) && existing.purpose === purpose) {
      return byReference;
    }
    throw new PaymentServiceError(
      409,
      'Payment reference is already used by another payout',
      'PAYMENT_REFERENCE_CONFLICT'
    );
  }
  const byOffer = await Payment.findOne({ offerId, purpose });
  if (byOffer) {
    throw new PaymentServiceError(
      409,
      'A payout ledger already exists for this offer and purpose',
      'PAYOUT_ALREADY_EXISTS'
    );
  }
  throw new PaymentServiceError(409, 'Payout could not be created safely', 'PAYOUT_CREATE_CONFLICT');
}

async function sendFailureSms(farmer, payment, description) {
  if (!farmer?.phone) return;
  try {
    await smsService.sendPayoutFailure(farmer.phone, {
      reference: payment.reference,
      amount: payment.amount,
      description,
    });
  } catch (err) {
    logger.warn('Payout failure SMS failed', { paymentId: String(documentId(payment)) });
  }
}

async function initiatePayoutForOffer({ offer, reference, farmer: suppliedFarmer }) {
  const offerId = documentId(offer);
  if (!offerId) {
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  const normalizedReference = normalizeReference(reference);
  const purpose = purposeForOffer(offer);
  const existing = await findExistingPayment({
    offerId,
    purpose,
    reference: normalizedReference,
  });
  if (existing) {
    return {
      payment: sanitizePayment(existing),
      amounts: calculatePayoutAmounts(offer),
      created: false,
      idempotent: true,
    };
  }

  const farmer = suppliedFarmer || await loadFarmer(offer.farmerId);
  assertEligible(offer, farmer);
  const amounts = calculatePayoutAmounts(offer);
  let created;
  try {
    created = await Payment.create({
      offerId,
      farmerId: offer.farmerId,
      amount: amounts.payoutAmount,
      method: 'daraja_b2c',
      reference: normalizedReference,
      purpose,
      status: 'pending',
      requestedAt: new Date(),
    });
  } catch (err) {
    if (!duplicateKey(err)) throw err;
    const concurrent = await resolveCreateConflict({
      offerId,
      purpose,
      reference: normalizedReference,
    });
    return {
      payment: sanitizePayment(concurrent),
      amounts,
      created: false,
      idempotent: true,
    };
  }

  try {
    const provider = await darajaService.requestB2CPayout({
      amount: amounts.payoutAmount,
      partyB: farmer.mpesaNumber,
      reference: normalizedReference,
      remarks: `NectarTrace ${purpose} ${normalizedReference}`,
    });
    const submittedAt = new Date();
    const submitted = await Payment.findOneAndUpdate({
      _id: documentId(created),
      status: 'pending',
    }, {
      $set: {
        status: 'submitted',
        originatorConversationId: provider.originatorConversationId || null,
        conversationId: provider.conversationId || null,
        submittedAt,
      },
    }, { new: true, runValidators: true });

    if (!submitted) {
      const current = await Payment.findOne({ reference: normalizedReference });
      if (current && toPlain(current).status !== 'pending') {
        return {
          payment: sanitizePayment(current),
          amounts,
          created: true,
          idempotent: false,
        };
      }
      throw new Error('Payment ledger transition failed');
    }
    return {
      payment: sanitizePayment(submitted),
      amounts,
      created: true,
      idempotent: false,
    };
  } catch (err) {
    // Provider exceptions are ambiguous. Automatic retries are intentionally disabled;
    // manual reconciliation is future work.
    const failedAt = new Date();
    let failed = null;
    try {
      failed = await Payment.findOneAndUpdate({
        _id: documentId(created),
        status: 'pending',
      }, {
        $set: {
          status: 'failed',
          resultDescription: SAFE_PROVIDER_FAILURE,
          failedAt,
          completedAt: failedAt,
        },
      }, { new: true, runValidators: true });
    } catch (transitionError) {
      logger.error('Payment failure transition failed', { paymentId: String(documentId(created)) });
    }
    if (failed) await sendFailureSms(farmer, toPlain(failed), SAFE_PROVIDER_FAILURE);
    logger.warn('Daraja B2C request failed', { paymentId: String(documentId(created)) });
    const safePayment = sanitizePayment(failed || created);
    throw new PaymentServiceError(
      502,
      'Payout submission failed; manual reconciliation is required',
      'DARAJA_SUBMISSION_FAILED',
      safePayment
    );
  }
}

async function initiatePayout({ offerIdentifier, user, reference }) {
  const normalizedIdentifier = typeof offerIdentifier === 'string'
    ? offerIdentifier.trim()
    : String(offerIdentifier || '');
  identifierFilter(normalizedIdentifier);
  const { offer } = await offerService.loadManagedOffer(normalizedIdentifier, user);
  return initiatePayoutForOffer({ offer, reference });
}

async function recordConsignmentSaleAndPayout({
  offerIdentifier,
  user,
  saleAmount,
  reference,
}) {
  const normalizedReference = normalizeReference(reference);
  const grossAmount = Number(saleAmount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new PaymentServiceError(
      400,
      'saleAmount must be a positive finite number',
      'INVALID_SALE_AMOUNT'
    );
  }

  const { offer: loadedOffer } = await offerService.loadManagedOffer(offerIdentifier, user);
  if (loadedOffer.tradeType !== 'consignment') {
    throw new PaymentServiceError(
      409,
      'Only consignment offers can record a sale',
      'NOT_A_CONSIGNMENT_OFFER'
    );
  }
  if (!['verified', 'paid'].includes(loadedOffer.status)) {
    throw new PaymentServiceError(
      409,
      'Only verified consignment offers can record a sale',
      'OFFER_NOT_VERIFIED'
    );
  }

  const farmer = await loadFarmer(loadedOffer.farmerId);
  if (!farmer?.phone) {
    throw new PaymentServiceError(409, 'The farmer has no SMS phone number', 'FARMER_PHONE_REQUIRED');
  }

  let offer = loadedOffer;
  let saleRecorded = false;
  if (loadedOffer.saleAmount !== null && loadedOffer.saleAmount !== undefined) {
    if (Number(loadedOffer.saleAmount) !== grossAmount) {
      throw new PaymentServiceError(
        409,
        'saleAmount has already been recorded and cannot be changed',
        'SALE_ALREADY_RECORDED'
      );
    }
  } else {
    const updated = await Offer.findOneAndUpdate({
      ...offerDocumentFilter(loadedOffer),
      tradeType: 'consignment',
      status: 'verified',
      $or: [
        { saleAmount: null },
        { saleAmount: { $exists: false } },
      ],
    }, {
      $set: { saleAmount: grossAmount },
    }, { new: true, runValidators: true });

    if (updated) {
      offer = toPlain(updated);
      saleRecorded = true;
    } else {
      const current = toPlain(await Offer.findOne(identifierFilter(offerIdentifier)));
      if (!current || current.tradeType !== 'consignment') {
        throw new PaymentServiceError(409, 'Offer changed before sale recording', 'OFFER_CONFLICT');
      }
      if (Number(current.saleAmount) !== grossAmount) {
        throw new PaymentServiceError(
          409,
          'saleAmount has already been recorded and cannot be changed',
          'SALE_ALREADY_RECORDED'
        );
      }
      offer = current;
    }
  }

  const amounts = calculatePayoutAmounts(offer);
  if (saleRecorded) {
    try {
      await smsService.sendConsignmentSale(farmer.phone, {
        reference: offer.reference,
        saleAmount: amounts.grossAmount,
        commissionAmount: amounts.commissionAmount,
        payoutAmount: amounts.payoutAmount,
      });
    } catch (err) {
      logger.warn('Consignment sale SMS failed', { offerId: String(documentId(offer)) });
    }
  }

  const payout = await initiatePayoutForOffer({
    offer,
    reference: normalizedReference,
    farmer,
  });
  return {
    ...payout,
    amounts,
    saleRecorded,
  };
}

async function confirmPaymentDetails({ offerIdentifier, farmerId, pin, now = new Date() }) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new PaymentServiceError(400, 'A 4-digit PIN is required', 'PIN_REQUIRED');
  }
  const filter = { ...identifierFilter(offerIdentifier), farmerId };
  const offer = toPlain(await Offer.findOne(filter));
  if (!offer) {
    throw new PaymentServiceError(404, 'Offer not found', 'OFFER_NOT_FOUND');
  }
  if (offer.status === 'paid') {
    throw new PaymentServiceError(409, 'Paid offers cannot be reconfirmed', 'OFFER_ALREADY_PAID');
  }

  const farmer = await loadFarmer(farmerId, { includePin: true });
  if (!farmer || farmer.role !== 'FARMER') {
    throw new PaymentServiceError(404, 'Farmer not found', 'FARMER_NOT_FOUND');
  }
  if (!farmer.mpesaNumber) {
    throw new PaymentServiceError(409, 'Set an M-Pesa number before confirming', 'MPESA_NUMBER_REQUIRED');
  }
  if (!farmer.ussdPinHash) {
    throw new PaymentServiceError(409, 'A USSD PIN is required', 'USSD_PIN_NOT_SET');
  }

  let matches = false;
  try {
    matches = await bcrypt.compare(pin, farmer.ussdPinHash);
  } catch (err) {
    matches = false;
  }
  if (!matches) {
    throw new PaymentServiceError(401, 'PIN is incorrect', 'INVALID_PIN');
  }

  const confirmed = await Offer.findOneAndUpdate({
    ...filter,
    status: { $ne: 'paid' },
  }, {
    $set: { paymentDetailsConfirmedAt: now },
  }, { new: true, runValidators: true });
  if (!confirmed) {
    throw new PaymentServiceError(409, 'Offer changed before confirmation', 'OFFER_CONFLICT');
  }
  return {
    offerId: String(documentId(confirmed)),
    paymentDetailsConfirmedAt: toPlain(confirmed).paymentDetailsConfirmedAt,
  };
}

async function invalidatePaymentDetailsForFarmer(farmerId) {
  return Offer.updateMany({
    farmerId,
    status: { $ne: 'paid' },
    paymentDetailsConfirmedAt: { $ne: null },
  }, {
    $set: { paymentDetailsConfirmedAt: null },
  }, { runValidators: true });
}

async function getOfferPayment({ offerIdentifier, user }) {
  let offer;
  if (user.role === 'FARMER') {
    offer = toPlain(await Offer.findOne({
      ...identifierFilter(offerIdentifier),
      farmerId: user.id,
    }));
    if (!offer) {
      throw new PaymentServiceError(404, 'Offer not found', 'OFFER_NOT_FOUND');
    }
  } else {
    ({ offer } = await offerService.loadManagedOffer(offerIdentifier, user));
  }

  const payment = await Payment.findOne({ offerId: documentId(offer) });
  if (!payment) {
    throw new PaymentServiceError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  }
  return sanitizePayment(payment);
}

function callbackRoot(payload) {
  return payload?.Body?.Result
    || payload?.Result
    || payload?.Body?.stkCallback
    || payload
    || {};
}

function callbackText(value, maxLength = 200) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function callbackItems(container, itemKey) {
  const items = container?.[itemKey];
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function itemValue(items, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const item of items) {
    if (wanted.has(String(item?.Key || '').toLowerCase())) return item?.Value ?? null;
  }
  return null;
}

function parseCallback(payload) {
  const root = callbackRoot(payload);
  const referenceItems = callbackItems(root.ReferenceData, 'ReferenceItem');
  const resultItems = callbackItems(root.ResultParameters, 'ResultParameter');
  const rawReference = root.reference
    ?? root.Reference
    ?? itemValue(referenceItems, ['Reference', 'Occasion', 'PaymentReference']);
  let reference = null;
  if (rawReference !== null && rawReference !== undefined) {
    try {
      reference = normalizeReference(String(rawReference));
    } catch (err) {
      reference = null;
    }
  }
  const rawCode = root.ResultCode ?? root.resultCode;
  const parsedCode = rawCode === null || rawCode === undefined || rawCode === ''
    ? null
    : Number(rawCode);
  return {
    originatorConversationId: callbackText(
      root.OriginatorConversationID ?? root.originatorConversationId
    ),
    conversationId: callbackText(root.ConversationID ?? root.conversationId),
    transactionId: callbackText(
      root.TransactionID
      ?? root.transactionId
      ?? itemValue(resultItems, ['TransactionReceipt', 'TransactionID'])
    ),
    reference,
    resultCode: Number.isFinite(parsedCode) ? parsedCode : null,
    resultDescription: callbackText(
      root.ResultDesc ?? root.ResultDescription ?? root.resultDescription,
      500
    ),
  };
}

async function findCallbackPayment(data) {
  const alternatives = [];
  if (data.originatorConversationId) {
    alternatives.push({ originatorConversationId: data.originatorConversationId });
  }
  if (data.conversationId) alternatives.push({ conversationId: data.conversationId });
  if (data.reference) alternatives.push({ reference: data.reference });
  if (alternatives.length === 0) return null;
  return Payment.findOne({ $or: alternatives });
}

function callbackUpdate(data, status, now) {
  const set = {
    status,
    completedAt: now,
    ...(data.originatorConversationId && {
      originatorConversationId: data.originatorConversationId,
    }),
    ...(data.conversationId && { conversationId: data.conversationId }),
    ...(data.transactionId && { transactionId: data.transactionId }),
    ...(data.resultCode !== null && { resultCode: data.resultCode }),
    ...(data.resultDescription && { resultDescription: data.resultDescription }),
  };
  if (status === 'failed' || status === 'timeout') set.failedAt = now;
  return { $set: set };
}

async function markOfferPaid(payment, now) {
  await Offer.updateOne({
    _id: payment.offerId,
    status: 'verified',
  }, {
    $set: { status: 'paid', paidAt: now },
  }, { runValidators: true });
}

async function sendCallbackSms(payment, status, description) {
  const farmer = await loadFarmer(payment.farmerId);
  if (!farmer?.phone) return;
  try {
    if (status === 'succeeded') {
      await smsService.sendPayoutSuccess(farmer.phone, {
        reference: payment.reference,
        amount: payment.amount,
        transactionId: payment.transactionId,
      });
    } else {
      await smsService.sendPayoutFailure(farmer.phone, {
        reference: payment.reference,
        amount: payment.amount,
        description,
      });
    }
  } catch (err) {
    logger.warn('Payout callback SMS failed', { paymentId: String(documentId(payment)) });
  }
}

async function processDarajaCallback({ payload, type, now = new Date() }) {
  const data = parseCallback(payload);
  const found = await findCallbackPayment(data);
  if (!found) return { matched: false, changed: false };

  const current = toPlain(found);
  let status;
  if (type === 'timeout') {
    status = 'timeout';
  } else {
    status = String(data.resultCode) === '0' ? 'succeeded' : 'failed';
  }
  const description = data.resultDescription
    || (status === 'timeout' ? 'Daraja payout timed out' : 'Daraja payout failed');
  data.resultDescription = description;

  const transitioned = await Payment.findOneAndUpdate({
    _id: documentId(current),
    status: { $in: ['pending', 'submitted'] },
  }, callbackUpdate(data, status, now), { new: true, runValidators: true });
  if (!transitioned) {
    return {
      matched: true,
      changed: false,
      status: current.status,
    };
  }

  const payment = toPlain(transitioned);
  if (status === 'succeeded') await markOfferPaid(payment, now);
  await sendCallbackSms(payment, status, description);
  return { matched: true, changed: true, status };
}

module.exports = {
  PaymentServiceError,
  SAFE_PROVIDER_FAILURE,
  calculatePayoutAmounts,
  confirmPaymentDetails,
  getOfferPayment,
  initiatePayout,
  invalidatePaymentDetailsForFarmer,
  normalizeReference,
  parseCallback,
  processDarajaCallback,
  recordConsignmentSaleAndPayout,
  sanitizePayment,
};
