const bcrypt = require('bcryptjs');
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

function normalizeOfferIdentifier(identifier) {
  if (typeof identifier === 'number') {
    if (Number.isSafeInteger(identifier) && identifier > 0) return identifier;
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }

  const normalized = typeof identifier === 'string' ? identifier.trim() : '';
  if (!normalized || normalized.length > 80) {
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  return normalized.toUpperCase();
}

function offerIdentifierWhere(identifier) {
  const normalized = normalizeOfferIdentifier(identifier);
  return typeof normalized === 'number'
    ? { id: normalized }
    : { reference: normalized };
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
    return { grossAmount, commissionAmount: 0, payoutAmount };
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
  if (!payment) return null;
  return {
    id: payment.id,
    offerId: payment.offerId,
    farmerId: payment.farmerId,
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
    purpose: payment.purpose,
    status: payment.status,
    originatorConversationId: payment.originatorConversationId ?? null,
    conversationId: payment.conversationId ?? null,
    transactionId: payment.transactionId ?? null,
    resultCode: payment.resultCode ?? null,
    resultDescription: payment.resultDescription ?? null,
    requestedAt: payment.requestedAt,
    submittedAt: payment.submittedAt ?? null,
    completedAt: payment.completedAt ?? null,
    failedAt: payment.failedAt ?? null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
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

function uniqueConstraint(error) {
  return error?.code === 'P2002';
}

async function findExistingPayment(client, { offerId, purpose, reference }) {
  const byReference = await client.payment.findUnique({ where: { reference } });
  if (byReference) {
    if (byReference.offerId !== offerId || byReference.purpose !== purpose) {
      throw new PaymentServiceError(
        409,
        'Payment reference is already used by another payout',
        'PAYMENT_REFERENCE_CONFLICT'
      );
    }
    return byReference;
  }

  const byOffer = await client.payment.findFirst({ where: { offerId, purpose } });
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
  const existing = await findExistingPayment(prisma, { offerId, purpose, reference });
  if (existing) return existing;
  throw new PaymentServiceError(409, 'Payout could not be created safely', 'PAYOUT_CREATE_CONFLICT');
}

async function createPaymentLedger({ offer, purpose, reference, amount }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await findExistingPayment(tx, {
        offerId: offer.id,
        purpose,
        reference,
      });
      if (existing) return { payment: existing, created: false };

      const payment = await tx.payment.create({
        data: {
          offerId: offer.id,
          farmerId: offer.farmerId,
          cooperativeId: offer.cooperativeId,
          amount,
          method: 'daraja_b2c',
          reference,
          purpose,
          status: 'pending',
          requestedAt: new Date(),
        },
      });
      return { payment, created: true };
    });
  } catch (err) {
    if (!uniqueConstraint(err)) throw err;
    const payment = await resolveCreateConflict({
      offerId: offer.id,
      purpose,
      reference,
    });
    return { payment, created: false };
  }
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
    logger.warn('Payout failure SMS failed', { paymentId: payment.id });
  }
}

async function initiatePayoutForOffer({ offer, reference, farmer: suppliedFarmer }) {
  if (!Number.isSafeInteger(offer?.id) || offer.id <= 0) {
    throw new PaymentServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  const normalizedReference = normalizeReference(reference);
  const purpose = purposeForOffer(offer);
  const existing = await findExistingPayment(prisma, {
    offerId: offer.id,
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
  const ledger = await createPaymentLedger({
    offer,
    purpose,
    reference: normalizedReference,
    amount: amounts.payoutAmount,
  });
  if (!ledger.created) {
    return {
      payment: sanitizePayment(ledger.payment),
      amounts,
      created: false,
      idempotent: true,
    };
  }

  const created = ledger.payment;
  try {
    const provider = await darajaService.requestB2CPayout({
      amount: amounts.payoutAmount,
      partyB: farmer.mpesaNumber,
      reference: normalizedReference,
      remarks: `NectarTrace ${purpose} ${normalizedReference}`,
    });
    const submittedAt = new Date();
    const transition = await prisma.payment.updateMany({
      where: { id: created.id, status: 'pending' },
      data: {
        status: 'submitted',
        originatorConversationId: provider.originatorConversationId || null,
        conversationId: provider.conversationId || null,
        submittedAt,
      },
    });
    const submitted = await prisma.payment.findUnique({ where: { id: created.id } });
    if (transition.count !== 1 && submitted?.status === 'pending') {
      throw new Error('Payment ledger transition failed');
    }
    if (!submitted) throw new Error('Payment ledger disappeared');
    return {
      payment: sanitizePayment(submitted),
      amounts,
      created: true,
      idempotent: false,
    };
  } catch (err) {
    // A provider exception is ambiguous, so this ledger is closed for manual reconciliation.
    const failedAt = new Date();
    let failed = null;
    try {
      await prisma.payment.updateMany({
        where: { id: created.id, status: 'pending' },
        data: {
          status: 'failed',
          resultDescription: SAFE_PROVIDER_FAILURE,
          failedAt,
          completedAt: failedAt,
        },
      });
      failed = await prisma.payment.findUnique({ where: { id: created.id } });
    } catch (transitionError) {
      logger.error('Payment failure transition failed', { paymentId: created.id });
    }
    if (failed?.status === 'failed') {
      await sendFailureSms(farmer, failed, SAFE_PROVIDER_FAILURE);
    }
    logger.warn('Daraja B2C request failed', { paymentId: created.id });
    throw new PaymentServiceError(
      502,
      'Payout submission failed; manual reconciliation is required',
      'DARAJA_SUBMISSION_FAILED',
      sanitizePayment(failed || created)
    );
  }
}

async function initiatePayout({ offerIdentifier, user, reference }) {
  const normalizedIdentifier = normalizeOfferIdentifier(offerIdentifier);
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
  const normalizedIdentifier = normalizeOfferIdentifier(offerIdentifier);
  const grossAmount = Number(saleAmount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new PaymentServiceError(
      400,
      'saleAmount must be a positive finite number',
      'INVALID_SALE_AMOUNT'
    );
  }

  const { offer: loadedOffer } = await offerService.loadManagedOffer(normalizedIdentifier, user);
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
    const update = await prisma.offer.updateMany({
      where: {
        id: loadedOffer.id,
        tradeType: 'consignment',
        status: 'verified',
        saleAmount: null,
      },
      data: { saleAmount: grossAmount },
    });
    const current = await prisma.offer.findUnique({ where: { id: loadedOffer.id } });
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
    saleRecorded = update.count === 1;
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
      logger.warn('Consignment sale SMS failed', { offerId: offer.id });
    }
  }

  const payout = await initiatePayoutForOffer({
    offer,
    reference: normalizedReference,
    farmer,
  });
  return { ...payout, amounts, saleRecorded };
}

async function confirmPaymentDetails({ offerIdentifier, farmerId, pin, now = new Date() }) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new PaymentServiceError(400, 'A 4-digit PIN is required', 'PIN_REQUIRED');
  }
  const where = { ...offerIdentifierWhere(offerIdentifier), farmerId };
  const offer = await prisma.offer.findFirst({ where });
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

  const result = await prisma.offer.updateMany({
    where: { id: offer.id, farmerId, status: { not: 'paid' } },
    data: { paymentDetailsConfirmedAt: now },
  });
  if (result.count !== 1) {
    throw new PaymentServiceError(409, 'Offer changed before confirmation', 'OFFER_CONFLICT');
  }
  return { offerId: offer.id, paymentDetailsConfirmedAt: now };
}

async function invalidatePaymentDetailsForFarmer(farmerId) {
  return prisma.offer.updateMany({
    where: {
      farmerId,
      status: { not: 'paid' },
      paymentDetailsConfirmedAt: { not: null },
    },
    data: { paymentDetailsConfirmedAt: null },
  });
}

async function getOfferPayment({ offerIdentifier, user }) {
  let offer;
  const normalizedIdentifier = normalizeOfferIdentifier(offerIdentifier);
  if (user.role === 'FARMER') {
    offer = await prisma.offer.findFirst({
      where: {
        ...offerIdentifierWhere(normalizedIdentifier),
        farmerId: user.id,
      },
    });
    if (!offer) {
      throw new PaymentServiceError(404, 'Offer not found', 'OFFER_NOT_FOUND');
    }
  } else {
    ({ offer } = await offerService.loadManagedOffer(normalizedIdentifier, user));
  }

  const payment = await prisma.payment.findFirst({ where: { offerId: offer.id } });
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
  return prisma.payment.findFirst({ where: { OR: alternatives } });
}

function callbackData(data, status, now) {
  return {
    status,
    completedAt: now,
    ...(data.originatorConversationId && {
      originatorConversationId: data.originatorConversationId,
    }),
    ...(data.conversationId && { conversationId: data.conversationId }),
    ...(data.transactionId && { transactionId: data.transactionId }),
    ...(data.resultCode !== null && { resultCode: data.resultCode }),
    ...(data.resultDescription && { resultDescription: data.resultDescription }),
    ...((status === 'failed' || status === 'timeout') && { failedAt: now }),
  };
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
    logger.warn('Payout callback SMS failed', { paymentId: payment.id });
  }
}

async function processDarajaCallback({ payload, type, now = new Date() }) {
  const data = parseCallback(payload);
  const found = await findCallbackPayment(data);
  if (!found) return { matched: false, changed: false };

  const status = type === 'timeout'
    ? 'timeout'
    : (String(data.resultCode) === '0' ? 'succeeded' : 'failed');
  const description = data.resultDescription
    || (status === 'timeout' ? 'Daraja payout timed out' : 'Daraja payout failed');
  data.resultDescription = description;

  const transition = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.updateMany({
      where: { id: found.id, status: { in: ['pending', 'submitted'] } },
      data: callbackData(data, status, now),
    });
    const payment = await tx.payment.findUnique({ where: { id: found.id } });
    if (result.count !== 1) return { changed: false, payment };
    if (status === 'succeeded') {
      await tx.offer.updateMany({
        where: { id: payment.offerId, status: 'verified' },
        data: { status: 'paid', paidAt: now },
      });
    }
    return { changed: true, payment };
  });

  if (!transition.changed) {
    return {
      matched: true,
      changed: false,
      status: transition.payment?.status ?? found.status,
    };
  }
  await sendCallbackSms(transition.payment, status, description);
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
  normalizeOfferIdentifier,
  normalizeReference,
  parseCallback,
  processDarajaCallback,
  recordConsignmentSaleAndPayout,
  sanitizePayment,
};
