const logger = require('../utils/logger');
const offerService = require('../services/offerService');
const paymentService = require('../services/paymentService');
const smsService = require('../services/smsService');

function parsePositiveInteger(value, name) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
    throw new offerService.OfferServiceError(400, `${name} must be a positive integer`, 'INVALID_PARAMETER');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new offerService.OfferServiceError(400, `${name} must be a positive integer`, 'INVALID_PARAMETER');
  }
  return parsed;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null) return undefined;
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return NaN;
  return Number(value);
}

function parseOfferIdentifier(value) {
  const identifier = typeof value === 'string' ? value.trim() : '';
  if (!identifier || identifier.length > 80) {
    throw new offerService.OfferServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  return identifier;
}

function parseStatus(value) {
  if (value === undefined) return undefined;
  if (!offerService.OFFER_STATUSES.includes(value)) {
    throw new offerService.OfferServiceError(
      400,
      `status must be one of: ${offerService.OFFER_STATUSES.join(', ')}`,
      'INVALID_OFFER_STATUS'
    );
  }
  return value;
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page, 'page');
  const limit = query.limit === undefined ? 20 : parsePositiveInteger(query.limit, 'limit');
  if (limit > 100) {
    throw new offerService.OfferServiceError(400, 'limit must not exceed 100', 'INVALID_PARAMETER');
  }
  return { page, limit };
}

function pagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function handleControllerError(err, res, next) {
  if (err instanceof paymentService.PaymentServiceError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.payment && { data: { payment: err.payment } }),
    });
  }
  if (err instanceof offerService.OfferServiceError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid offer data' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ success: false, message: 'Offer already exists' });
  }
  return next(err);
}

async function enrichManagedOffer(offer) {
  const [enriched] = await offerService.enrichOffers([offer], { includeFarmer: true });
  return enriched;
}

async function requireSmsRecipient(offer) {
  const enriched = await enrichManagedOffer(offer);
  if (!enriched.farmer?.phone) {
    throw new offerService.OfferServiceError(
      409,
      'The farmer has no SMS phone number',
      'FARMER_PHONE_REQUIRED'
    );
  }
  return enriched.farmer.phone;
}

async function sendStatusSms(send, offer, status) {
  try {
    await send();
  } catch (err) {
    logger.warn('Offer status SMS failed', { offerId: offer.id, status });
  }
}

async function listOffers(req, res, next) {
  try {
    const cooperativeId = req.query.cooperativeId === undefined
      ? undefined
      : parsePositiveInteger(req.query.cooperativeId, 'cooperativeId');
    const status = parseStatus(req.query.status);
    const { page, limit } = parsePagination(req.query);
    const result = await offerService.listIncomingOffers({
      user: req.user,
      cooperativeId,
      status,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result.offers,
      count: result.offers.length,
      pagination: pagination(page, limit, result.total),
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function listMyOffers(req, res, next) {
  try {
    const status = parseStatus(req.query.status);
    const { page, limit } = parsePagination(req.query);
    const result = await offerService.listFarmerOffers({
      farmerId: req.user.id,
      status,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result.offers,
      count: result.offers.length,
      pagination: pagination(page, limit, result.total),
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function getMyOffer(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const offer = await offerService.getFarmerOffer(identifier, req.user.id);
    return res.json({ success: true, data: offer });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function acceptOffer(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const { offer } = await offerService.loadManagedOffer(identifier, req.user);
    const phone = await requireSmsRecipient(offer);
    const agreedPricePerKg = parseOptionalNumber(req.body.agreedPricePerKg);
    const updated = await offerService.acceptOffer(offer, agreedPricePerKg);
    const enriched = await enrichManagedOffer(updated);

    await sendStatusSms(
      () => smsService.sendOfferAccepted(phone, {
        reference: updated.reference,
        tradeType: updated.tradeType,
        agreedPricePerKg: updated.agreedPricePerKg,
        commissionPercent: updated.commissionPercent,
      }),
      enriched,
      'accepted'
    );

    return res.json({
      success: true,
      message: 'Offer accepted',
      data: enriched,
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function rejectOffer(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const { offer } = await offerService.loadManagedOffer(identifier, req.user);
    const phone = await requireSmsRecipient(offer);
    const rejectionReason = req.body.reason ?? req.body.rejectionReason;
    const updated = await offerService.rejectOffer(offer, rejectionReason);
    const enriched = await enrichManagedOffer(updated);

    await sendStatusSms(
      () => smsService.sendOfferRejected(phone, {
        reference: updated.reference,
        rejectionReason: updated.rejectionReason,
      }),
      enriched,
      'rejected'
    );

    return res.json({
      success: true,
      message: 'Offer rejected',
      data: enriched,
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function recordDelivery(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const { offer } = await offerService.loadManagedOffer(identifier, req.user);
    const updated = await offerService.recordDelivery(offer, {
      weighedKg: parseOptionalNumber(req.body.weighedKg),
      moisturePercent: parseOptionalNumber(req.body.moisturePercent),
    });
    const enriched = await enrichManagedOffer(updated);

    return res.json({
      success: true,
      message: 'Offer delivery recorded',
      data: enriched,
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function verifyOffer(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const { offer } = await offerService.loadManagedOffer(identifier, req.user);
    const updated = await offerService.verifyOffer(offer);
    const enriched = await enrichManagedOffer(updated);

    return res.json({
      success: true,
      message: 'Offer verified',
      data: enriched,
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function recordConsignmentSale(req, res, next) {
  try {
    const identifier = parseOfferIdentifier(req.params.id);
    const result = await paymentService.recordConsignmentSaleAndPayout({
      offerIdentifier: identifier,
      user: req.user,
      saleAmount: req.body.saleAmount,
      reference: req.body.reference,
    });
    return res.json({
      success: true,
      message: result.idempotent
        ? 'Consignment sale payout already exists'
        : 'Consignment sale recorded and payout submitted',
      data: {
        saleAmount: result.amounts.grossAmount,
        commissionAmount: result.amounts.commissionAmount,
        payoutAmount: result.amounts.payoutAmount,
        payment: result.payment,
      },
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

async function verifyFarmer(req, res, next) {
  try {
    const farmerId = parsePositiveInteger(req.params.farmerId, 'farmerId');
    const cooperativeId = req.user.role === 'COOPERATIVE_STAFF'
      ? req.user.cooperativeId
      : parsePositiveInteger(
        req.body.cooperativeId ?? req.query.cooperativeId,
        'cooperativeId'
      );
    const farmer = await offerService.verifyFarmer({ cooperativeId, farmerId });
    return res.json({
      success: true,
      message: 'Farmer verified',
      data: { farmer },
    });
  } catch (err) {
    return handleControllerError(err, res, next);
  }
}

// Deprecated compatibility adapter. New clients must use the explicit lifecycle endpoints.
async function updateOfferStatus(req, res, next) {
  const status = req.body.status;
  if (status === 'ACCEPTED') return acceptOffer(req, res, next);
  if (status === 'REJECTED') return rejectOffer(req, res, next);
  if (status === 'RECEIVED') {
    req.body = {
      ...req.body,
      weighedKg: req.body.weighedKg ?? req.body.weightKg ?? req.body.acceptedWeightKg,
    };
    return recordDelivery(req, res, next);
  }
  if (status === 'VERIFIED') return verifyOffer(req, res, next);

  return res.status(400).json({
    success: false,
    message: 'status must be ACCEPTED, REJECTED, RECEIVED, or VERIFIED',
    code: 'INVALID_OFFER_STATUS',
  });
}

module.exports = {
  acceptOffer,
  getMyOffer,
  listMyOffers,
  listOffers,
  recordConsignmentSale,
  recordDelivery,
  rejectOffer,
  updateOfferStatus,
  verifyFarmer,
  verifyOffer,
};
