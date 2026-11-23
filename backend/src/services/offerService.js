const Offer = require('../models/Offer');
const prisma = require('../config/db');

const OFFER_STATUSES = [
  'offered',
  'accepted',
  'rejected',
  'expired',
  'delivered',
  'verified',
  'paid',
];

const cooperativeSelect = {
  id: true,
  name: true,
  ward: true,
  isVerified: true,
  commissionPercent: true,
};

class OfferServiceError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'OfferServiceError';
    this.status = status;
    this.code = code;
  }
}

function toPlain(offer) {
  if (!offer) return null;
  if (typeof offer.toObject === 'function') {
    return offer.toObject({ virtuals: false, versionKey: false });
  }
  return { ...offer };
}

function identifierFilter(identifier) {
  const normalized = String(identifier || '').trim();
  if (/^[a-f\d]{24}$/i.test(normalized)) return { _id: normalized };
  return { reference: normalized.toUpperCase() };
}

function documentFilter(offer) {
  if (offer._id) return { _id: offer._id };
  if (offer.reference) return { reference: offer.reference };
  throw new OfferServiceError(400, 'Offer identifier is required', 'INVALID_OFFER_ID');
}

function assertFiniteRange(value, name, { min, max, exclusiveMin = false, exclusiveMax = false }) {
  if (!Number.isFinite(value)) {
    throw new OfferServiceError(400, `${name} must be a finite number`, 'INVALID_OFFER_VALUE');
  }
  if (min !== undefined && (exclusiveMin ? value <= min : value < min)) {
    throw new OfferServiceError(400, `${name} is outside the allowed range`, 'INVALID_OFFER_VALUE');
  }
  if (max !== undefined && (exclusiveMax ? value >= max : value > max)) {
    throw new OfferServiceError(400, `${name} is outside the allowed range`, 'INVALID_OFFER_VALUE');
  }
}

async function requireVerifiedCooperative(cooperativeId) {
  const cooperative = await prisma.cooperative.findUnique({
    where: { id: cooperativeId },
    select: cooperativeSelect,
  });
  if (!cooperative) {
    throw new OfferServiceError(404, 'Cooperative not found', 'COOPERATIVE_NOT_FOUND');
  }
  if (!cooperative.isVerified) {
    throw new OfferServiceError(
      403,
      'The target cooperative is not verified',
      'COOPERATIVE_NOT_VERIFIED'
    );
  }
  return cooperative;
}

async function resolveIncomingScope(user, requestedCooperativeId) {
  if (user.role === 'COOPERATIVE_STAFF') {
    if (!user.cooperativeId) {
      throw new OfferServiceError(
        403,
        'Your account is not linked to a cooperative',
        'NO_COOPERATIVE'
      );
    }
    if (requestedCooperativeId && requestedCooperativeId !== user.cooperativeId) {
      throw new OfferServiceError(
        403,
        'You can only view offers for your cooperative',
        'OFFER_SCOPE_DENIED'
      );
    }
    return [await requireVerifiedCooperative(user.cooperativeId)];
  }

  if (requestedCooperativeId) {
    return [await requireVerifiedCooperative(requestedCooperativeId)];
  }

  return prisma.cooperative.findMany({
    where: { isVerified: true },
    select: cooperativeSelect,
    orderBy: { id: 'asc' },
  });
}

async function queryOffers(filter, { page, limit }) {
  const skip = (page - 1) * limit;
  const [documents, total] = await Promise.all([
    Offer.find(filter, null, {
      sort: { createdAt: -1 },
      skip,
      limit,
    }),
    Offer.countDocuments(filter),
  ]);

  return {
    offers: documents.map(toPlain),
    total,
  };
}

async function listIncomingOffers({ user, cooperativeId, status, page, limit }) {
  const cooperatives = await resolveIncomingScope(user, cooperativeId);
  const filter = {
    cooperativeId: { $in: cooperatives.map((cooperative) => cooperative.id) },
  };
  if (status) filter.status = status;

  const result = await queryOffers(filter, { page, limit });
  return {
    ...result,
    offers: await enrichOffers(result.offers, { includeFarmer: true }),
  };
}

async function listFarmerOffers({ farmerId, status, page, limit }) {
  const filter = { farmerId };
  if (status) filter.status = status;

  const result = await queryOffers(filter, { page, limit });
  return {
    ...result,
    offers: await enrichOffers(result.offers),
  };
}

async function findOfferByIdentifier(identifier, additionalFilter = {}) {
  const document = await Offer.findOne({
    ...identifierFilter(identifier),
    ...additionalFilter,
  });
  return toPlain(document);
}

async function getFarmerOffer(identifier, farmerId) {
  const offer = await findOfferByIdentifier(identifier, { farmerId });
  if (!offer) {
    throw new OfferServiceError(404, 'Offer not found', 'OFFER_NOT_FOUND');
  }
  const [enriched] = await enrichOffers([offer]);
  return enriched;
}

async function loadManagedOffer(identifier, user) {
  const offer = await findOfferByIdentifier(identifier);
  if (!offer) {
    throw new OfferServiceError(404, 'Offer not found', 'OFFER_NOT_FOUND');
  }
  if (
    user.role === 'COOPERATIVE_STAFF'
    && user.cooperativeId !== offer.cooperativeId
  ) {
    throw new OfferServiceError(
      403,
      'You can only manage offers for your cooperative',
      'OFFER_SCOPE_DENIED'
    );
  }

  const cooperative = await requireVerifiedCooperative(offer.cooperativeId);
  return { offer, cooperative };
}

function sanitizeOffer(offer, farmer, cooperative) {
  const source = toPlain(offer);
  const sanitized = {
    id: source._id ? String(source._id) : String(source.id),
    reference: source.reference,
    farmerId: source.farmerId,
    cooperativeId: source.cooperativeId,
    ward: source.ward,
    offeredKg: source.offeredKg,
    expectedPricePerKg: source.expectedPricePerKg,
    tradeType: source.tradeType,
    commissionPercent: source.commissionPercent,
    agreedPricePerKg: source.agreedPricePerKg ?? null,
    weighedKg: source.weighedKg ?? null,
    moisturePercent: source.moisturePercent ?? null,
    status: source.status,
    expiresAt: source.expiresAt,
    rejectionReason: source.rejectionReason ?? null,
    batchId: source.batchId ?? null,
    saleAmount: source.saleAmount ?? null,
    paymentDetailsConfirmedAt: source.paymentDetailsConfirmedAt ?? null,
    offeredAt: source.offeredAt,
    acceptedAt: source.acceptedAt ?? null,
    rejectedAt: source.rejectedAt ?? null,
    expiredAt: source.expiredAt ?? null,
    deliveredAt: source.deliveredAt ?? null,
    verifiedAt: source.verifiedAt ?? null,
    paidAt: source.paidAt ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };

  if (cooperative) {
    sanitized.cooperative = {
      id: cooperative.id,
      name: cooperative.name,
      ward: cooperative.ward,
      isVerified: Boolean(cooperative.isVerified),
    };
  }
  if (farmer) {
    sanitized.farmer = {
      id: farmer.id,
      name: farmer.name,
      phone: farmer.phone,
      isVerified: Boolean(farmer.farmerVerifiedAt),
    };
  }

  return sanitized;
}

async function enrichOffers(offers, { includeFarmer = false } = {}) {
  if (offers.length === 0) return [];

  const cooperativeIds = [...new Set(offers.map((offer) => offer.cooperativeId))];
  const farmerIds = includeFarmer
    ? [...new Set(offers.map((offer) => offer.farmerId))]
    : [];
  const [cooperatives, farmers] = await Promise.all([
    prisma.cooperative.findMany({
      where: { id: { in: cooperativeIds } },
      select: cooperativeSelect,
    }),
    includeFarmer
      ? prisma.user.findMany({
        where: { id: { in: farmerIds }, role: 'FARMER' },
        select: {
          id: true,
          name: true,
          phone: true,
          farmerVerifiedAt: true,
        },
      })
      : Promise.resolve([]),
  ]);
  const cooperativeById = new Map(cooperatives.map((cooperative) => [cooperative.id, cooperative]));
  const farmerById = new Map(farmers.map((farmer) => [farmer.id, farmer]));

  return offers.map((offer) => sanitizeOffer(
    offer,
    farmerById.get(offer.farmerId),
    cooperativeById.get(offer.cooperativeId)
  ));
}

function offerIsDue(offer, now) {
  return new Date(offer.expiresAt).getTime() <= now.getTime();
}

async function markOfferExpired(offer, now) {
  await Offer.updateOne({
    ...documentFilter(offer),
    status: 'offered',
    expiresAt: { $lte: now },
  }, {
    $set: { status: 'expired', expiredAt: now },
  }, { runValidators: true });
}

async function assertCurrentOffered(offer, now) {
  if (offer.status !== 'offered') {
    throw new OfferServiceError(
      409,
      `Only offered records can be changed; current status is ${offer.status}`,
      'INVALID_OFFER_TRANSITION'
    );
  }
  if (offerIsDue(offer, now)) {
    await markOfferExpired(offer, now);
    throw new OfferServiceError(409, 'The offer has expired', 'OFFER_EXPIRED');
  }
}

async function acceptOffer(offer, agreedPricePerKg, now = new Date()) {
  await assertCurrentOffered(offer, now);
  const hasAgreedPrice = agreedPricePerKg !== undefined && agreedPricePerKg !== null;
  if (offer.tradeType === 'direct') {
    assertFiniteRange(agreedPricePerKg, 'agreedPricePerKg', {
      min: 0,
      exclusiveMin: true,
    });
  } else if (hasAgreedPrice) {
    assertFiniteRange(agreedPricePerKg, 'agreedPricePerKg', { min: 0 });
  }

  const document = await Offer.findOneAndUpdate({
    ...documentFilter(offer),
    cooperativeId: offer.cooperativeId,
    status: 'offered',
    expiresAt: { $gt: now },
  }, {
    $set: {
      status: 'accepted',
      agreedPricePerKg: hasAgreedPrice ? agreedPricePerKg : null,
      acceptedAt: now,
      rejectionReason: null,
    },
  }, { new: true, runValidators: true });
  if (!document) {
    throw new OfferServiceError(
      409,
      'Offer status changed before acceptance completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return toPlain(document);
}

async function rejectOffer(offer, reason, now = new Date()) {
  await assertCurrentOffered(offer, now);
  const rejectionReason = typeof reason === 'string' ? reason.trim() : '';
  if (!rejectionReason || rejectionReason.length > 500) {
    throw new OfferServiceError(
      400,
      'rejectionReason is required and must not exceed 500 characters',
      'INVALID_REJECTION_REASON'
    );
  }

  const document = await Offer.findOneAndUpdate({
    ...documentFilter(offer),
    cooperativeId: offer.cooperativeId,
    status: 'offered',
    expiresAt: { $gt: now },
  }, {
    $set: {
      status: 'rejected',
      rejectionReason,
      rejectedAt: now,
    },
  }, { new: true, runValidators: true });
  if (!document) {
    throw new OfferServiceError(
      409,
      'Offer status changed before rejection completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return toPlain(document);
}

async function recordDelivery(offer, { weighedKg, moisturePercent }, now = new Date()) {
  if (offer.status !== 'accepted') {
    throw new OfferServiceError(
      409,
      `Only accepted offers can be delivered; current status is ${offer.status}`,
      'INVALID_OFFER_TRANSITION'
    );
  }
  assertFiniteRange(weighedKg, 'weighedKg', { min: 0, max: 10000, exclusiveMin: true });
  assertFiniteRange(moisturePercent, 'moisturePercent', {
    min: 0,
    max: 100,
    exclusiveMin: true,
    exclusiveMax: true,
  });

  const document = await Offer.findOneAndUpdate({
    ...documentFilter(offer),
    cooperativeId: offer.cooperativeId,
    status: 'accepted',
  }, {
    $set: {
      status: 'delivered',
      weighedKg,
      moisturePercent,
      deliveredAt: now,
    },
  }, { new: true, runValidators: true });
  if (!document) {
    throw new OfferServiceError(
      409,
      'Offer status changed before delivery completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }

  const delivered = toPlain(document);
  await prisma.user.updateMany({
    where: {
      id: delivered.farmerId,
      role: 'FARMER',
      farmerVerifiedAt: null,
    },
    data: { farmerVerifiedAt: now },
  });
  return delivered;
}

async function verifyOffer(offer, now = new Date()) {
  if (offer.status !== 'delivered' || !offer.weighedKg || !offer.moisturePercent) {
    throw new OfferServiceError(
      409,
      'Only delivered offers with measured weight and moisture can be verified',
      'INVALID_OFFER_TRANSITION'
    );
  }

  const document = await Offer.findOneAndUpdate({
    ...documentFilter(offer),
    cooperativeId: offer.cooperativeId,
    status: 'delivered',
    weighedKg: { $gt: 0, $lte: 10000 },
    moisturePercent: { $gt: 0, $lt: 100 },
  }, {
    $set: { status: 'verified', verifiedAt: now },
  }, { new: true, runValidators: true });
  if (!document) {
    throw new OfferServiceError(
      409,
      'Offer status changed before verification completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return toPlain(document);
}

async function verifyFarmer({ cooperativeId, farmerId, now = new Date() }) {
  await requireVerifiedCooperative(cooperativeId);
  const qualifyingOffer = await Offer.exists({
    cooperativeId,
    farmerId,
    status: { $in: ['delivered', 'verified'] },
  });
  if (!qualifyingOffer) {
    throw new OfferServiceError(
      409,
      'A delivered or verified offer from this cooperative is required',
      'FARMER_DELIVERY_REQUIRED'
    );
  }

  const farmer = await prisma.user.findUnique({
    where: { id: farmerId },
    select: { id: true, role: true, farmerVerifiedAt: true },
  });
  if (!farmer || farmer.role !== 'FARMER') {
    throw new OfferServiceError(404, 'Farmer not found', 'FARMER_NOT_FOUND');
  }
  if (!farmer.farmerVerifiedAt) {
    await prisma.user.updateMany({
      where: { id: farmerId, role: 'FARMER', farmerVerifiedAt: null },
      data: { farmerVerifiedAt: now },
    });
  }

  return { id: farmer.id, isVerified: true };
}

async function expireDueOffers(now = new Date()) {
  const result = await Offer.updateMany({
    status: 'offered',
    expiresAt: { $lte: now },
  }, {
    $set: { status: 'expired', expiredAt: now },
  }, { runValidators: true });
  return result.modifiedCount ?? result.nModified ?? 0;
}

module.exports = {
  OFFER_STATUSES,
  OfferServiceError,
  acceptOffer,
  enrichOffers,
  expireDueOffers,
  getFarmerOffer,
  listFarmerOffers,
  listIncomingOffers,
  loadManagedOffer,
  recordDelivery,
  rejectOffer,
  requireVerifiedCooperative,
  sanitizeOffer,
  verifyFarmer,
  verifyOffer,
};
