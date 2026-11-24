const prisma = require('../config/db');

const OFFER_LIFETIME_MS = 48 * 60 * 60 * 1000;
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

const batchInclude = {
  batch: { select: { batchId: true } },
};

class OfferServiceError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'OfferServiceError';
    this.status = status;
    this.code = code;
  }
}

function normalizeOfferIdentifier(identifier) {
  if (typeof identifier === 'number') {
    if (Number.isSafeInteger(identifier) && identifier > 0) return identifier;
    throw new OfferServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }

  const normalized = typeof identifier === 'string' ? identifier.trim() : '';
  if (!normalized || normalized.length > 80) {
    throw new OfferServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    throw new OfferServiceError(400, 'Offer ID is invalid', 'INVALID_OFFER_ID');
  }
  return normalized.toUpperCase();
}

function offerIdentifierWhere(identifier) {
  const normalized = normalizeOfferIdentifier(identifier);
  return typeof normalized === 'number'
    ? { id: normalized }
    : { reference: normalized };
}

function decimalNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function assertFiniteRange(value, name, {
  min,
  max,
  exclusiveMin = false,
  exclusiveMax = false,
}) {
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

async function queryOffers(where, { page, limit }) {
  const skip = (page - 1) * limit;
  const [offers, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      include: batchInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.offer.count({ where }),
  ]);

  return { offers, total };
}

async function listIncomingOffers({ user, cooperativeId, status, page, limit }) {
  const cooperatives = await resolveIncomingScope(user, cooperativeId);
  const where = {
    cooperativeId: { in: cooperatives.map((cooperative) => cooperative.id) },
    ...(status && { status }),
  };
  const result = await queryOffers(where, { page, limit });
  return {
    ...result,
    offers: await enrichOffers(result.offers, { includeFarmer: true }),
  };
}

async function listFarmerOffers({ farmerId, status, page, limit }) {
  const where = { farmerId, ...(status && { status }) };
  const result = await queryOffers(where, { page, limit });
  return {
    ...result,
    offers: await enrichOffers(result.offers),
  };
}

async function findOfferByIdentifier(identifier, additionalWhere = {}) {
  return prisma.offer.findFirst({
    where: {
      ...offerIdentifierWhere(identifier),
      ...additionalWhere,
    },
    include: batchInclude,
  });
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
  const sanitized = {
    id: offer.id,
    reference: offer.reference,
    farmerId: offer.farmerId,
    cooperativeId: offer.cooperativeId,
    ward: offer.ward,
    offeredKg: decimalNumber(offer.offeredKg),
    expectedPricePerKg: decimalNumber(offer.expectedPricePerKg),
    tradeType: offer.tradeType,
    commissionPercent: decimalNumber(offer.commissionPercent),
    agreedPricePerKg: decimalNumber(offer.agreedPricePerKg),
    weighedKg: decimalNumber(offer.weighedKg),
    moisturePercent: decimalNumber(offer.moisturePercent),
    status: offer.status,
    expiresAt: offer.expiresAt,
    rejectionReason: offer.rejectionReason ?? null,
    batchId: offer.batch?.batchId ?? null,
    saleAmount: decimalNumber(offer.saleAmount),
    paymentDetailsConfirmedAt: offer.paymentDetailsConfirmedAt ?? null,
    offeredAt: offer.offeredAt,
    acceptedAt: offer.acceptedAt ?? null,
    rejectedAt: offer.rejectedAt ?? null,
    expiredAt: offer.expiredAt ?? null,
    deliveredAt: offer.deliveredAt ?? null,
    verifiedAt: offer.verifiedAt ?? null,
    paidAt: offer.paidAt ?? null,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
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
  const cooperativeById = new Map(cooperatives.map((item) => [item.id, item]));
  const farmerById = new Map(farmers.map((item) => [item.id, item]));

  return offers.map((offer) => sanitizeOffer(
    offer,
    farmerById.get(offer.farmerId),
    cooperativeById.get(offer.cooperativeId)
  ));
}

function offerIsDue(offer, now) {
  return new Date(offer.expiresAt).getTime() <= now.getTime();
}

async function loadOfferAfterTransition(id) {
  return prisma.offer.findUnique({
    where: { id },
    include: batchInclude,
  });
}

async function markOfferExpired(offer, now) {
  await prisma.offer.updateMany({
    where: {
      id: offer.id,
      status: 'offered',
      expiresAt: { lte: now },
    },
    data: { status: 'expired', expiredAt: now },
  });
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

  const result = await prisma.offer.updateMany({
    where: {
      id: offer.id,
      cooperativeId: offer.cooperativeId,
      status: 'offered',
      expiresAt: { gt: now },
    },
    data: {
      status: 'accepted',
      agreedPricePerKg: hasAgreedPrice ? agreedPricePerKg : null,
      acceptedAt: now,
      rejectionReason: null,
    },
  });
  if (result.count !== 1) {
    throw new OfferServiceError(
      409,
      'Offer status changed before acceptance completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return loadOfferAfterTransition(offer.id);
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

  const result = await prisma.offer.updateMany({
    where: {
      id: offer.id,
      cooperativeId: offer.cooperativeId,
      status: 'offered',
      expiresAt: { gt: now },
    },
    data: { status: 'rejected', rejectionReason, rejectedAt: now },
  });
  if (result.count !== 1) {
    throw new OfferServiceError(
      409,
      'Offer status changed before rejection completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return loadOfferAfterTransition(offer.id);
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

  const result = await prisma.offer.updateMany({
    where: {
      id: offer.id,
      cooperativeId: offer.cooperativeId,
      status: 'accepted',
    },
    data: {
      status: 'delivered',
      weighedKg,
      moisturePercent,
      deliveredAt: now,
    },
  });
  if (result.count !== 1) {
    throw new OfferServiceError(
      409,
      'Offer status changed before delivery completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }

  await prisma.user.updateMany({
    where: {
      id: offer.farmerId,
      role: 'FARMER',
      farmerVerifiedAt: null,
    },
    data: { farmerVerifiedAt: now },
  });
  return loadOfferAfterTransition(offer.id);
}

async function verifyOffer(offer, now = new Date()) {
  if (
    offer.status !== 'delivered'
    || !(Number(offer.weighedKg) > 0)
    || !(Number(offer.moisturePercent) > 0)
  ) {
    throw new OfferServiceError(
      409,
      'Only delivered offers with measured weight and moisture can be verified',
      'INVALID_OFFER_TRANSITION'
    );
  }

  const result = await prisma.offer.updateMany({
    where: {
      id: offer.id,
      cooperativeId: offer.cooperativeId,
      status: 'delivered',
      weighedKg: { gt: 0, lte: 10000 },
      moisturePercent: { gt: 0, lt: 100 },
    },
    data: { status: 'verified', verifiedAt: now },
  });
  if (result.count !== 1) {
    throw new OfferServiceError(
      409,
      'Offer status changed before verification completed',
      'OFFER_TRANSITION_CONFLICT'
    );
  }
  return loadOfferAfterTransition(offer.id);
}

async function verifyFarmer({ cooperativeId, farmerId, now = new Date() }) {
  await requireVerifiedCooperative(cooperativeId);
  const qualifyingOffer = await prisma.offer.findFirst({
    where: {
      cooperativeId,
      farmerId,
      status: { in: ['delivered', 'verified'] },
    },
    select: { id: true },
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
  const result = await prisma.offer.updateMany({
    where: { status: 'offered', expiresAt: { lte: now } },
    data: { status: 'expired', expiredAt: now },
  });
  return result.count;
}

module.exports = {
  OFFER_LIFETIME_MS,
  OFFER_STATUSES,
  OfferServiceError,
  acceptOffer,
  enrichOffers,
  expireDueOffers,
  findOfferByIdentifier,
  getFarmerOffer,
  listFarmerOffers,
  listIncomingOffers,
  loadManagedOffer,
  normalizeOfferIdentifier,
  offerIdentifierWhere,
  recordDelivery,
  rejectOffer,
  requireVerifiedCooperative,
  sanitizeOffer,
  verifyFarmer,
  verifyOffer,
};
