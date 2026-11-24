const mockPrisma = {
  offer: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  cooperative: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  honeyBatch: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockSmsService = {
  sendOfferAccepted: jest.fn(),
  sendOfferRejected: jest.fn(),
};

const mockBlockchain = { recordBatchOnChain: jest.fn() };

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/smsService', () => mockSmsService);
jest.mock('../src/config/blockchain', () => mockBlockchain);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const offerService = require('../src/services/offerService');
const {
  acceptOffer,
  getMyOffer,
  listOffers,
  recordDelivery,
  rejectOffer,
  updateOfferStatus,
  verifyFarmer,
  verifyOffer,
} = require('../src/controllers/harvestOfferController');

const cooperative = {
  id: 2,
  name: 'Baringo Honey',
  ward: 'Kabarnet',
  isVerified: true,
  commissionPercent: 12.5,
};

const farmer = {
  id: 4,
  name: 'Farmer',
  phone: '+254700000004',
  farmerVerifiedAt: null,
};

function offer(overrides = {}) {
  return {
    id: 41,
    reference: 'NTO-20261123-ABC123',
    ussdSessionId: 'private-session-id',
    farmerId: 4,
    cooperativeId: 2,
    ward: 'Kabarnet',
    offeredKg: 100,
    expectedPricePerKg: 700,
    tradeType: 'direct',
    commissionPercent: 12.5,
    agreedPricePerKg: null,
    weighedKg: null,
    moisturePercent: null,
    status: 'offered',
    offeredAt: new Date('2026-11-23T08:00:00.000Z'),
    expiresAt: new Date('2026-11-25T08:00:00.000Z'),
    rejectionReason: null,
    batchId: null,
    batch: null,
    batchReservationToken: null,
    saleAmount: null,
    paymentDetailsConfirmedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    expiredAt: null,
    deliveredAt: null,
    verifiedAt: null,
    paidAt: null,
    createdAt: new Date('2026-11-23T08:00:00.000Z'),
    updatedAt: new Date('2026-11-23T08:00:00.000Z'),
    ...overrides,
  };
}

function requestFor(overrides = {}) {
  return {
    params: { id: '41' },
    query: {},
    body: {},
    user: { id: 7, role: 'COOPERATIVE_STAFF', cooperativeId: 2 },
    ...overrides,
  };
}

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.cooperative.findUnique.mockResolvedValue(cooperative);
  mockPrisma.cooperative.findMany.mockResolvedValue([cooperative]);
  mockPrisma.user.findMany.mockResolvedValue([farmer]);
  mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.offer.findMany.mockResolvedValue([]);
  mockPrisma.offer.count.mockResolvedValue(0);
  mockPrisma.offer.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.offer.findUnique.mockResolvedValue(offer());
  mockSmsService.sendOfferAccepted.mockResolvedValue({});
  mockSmsService.sendOfferRejected.mockResolvedValue({});
});

describe('verified cooperative scope and sanitized reads', () => {
  test('cooperative staff list only their verified cooperative offers', async () => {
    mockPrisma.offer.findMany.mockResolvedValue([offer()]);
    mockPrisma.offer.count.mockResolvedValue(1);
    const res = createResponse();

    await listOffers(requestFor(), res, jest.fn());

    expect(mockPrisma.offer.findMany).toHaveBeenCalledWith({
      where: { cooperativeId: { in: [2] } },
      include: { batch: { select: { batchId: true } } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(payload.data[0].id).toBe(41);
    expect(payload.data[0]).not.toHaveProperty('ussdSessionId');
    expect(payload.data[0]).not.toHaveProperty('batchReservationToken');
    expect(payload.data[0].farmer).toEqual({
      id: farmer.id,
      name: farmer.name,
      phone: farmer.phone,
      isVerified: false,
    });
  });

  test('admin cooperative filters hide an unverified cooperative', async () => {
    mockPrisma.cooperative.findUnique.mockResolvedValue({
      ...cooperative,
      id: 8,
      isVerified: false,
    });
    const res = createResponse();

    await listOffers(requestFor({
      user: { id: 1, role: 'ADMIN', cooperativeId: null },
      query: { cooperativeId: '8' },
    }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('COOPERATIVE_NOT_VERIFIED');
    expect(mockPrisma.offer.findMany).not.toHaveBeenCalled();
  });

  test('admin filters and pagination use lower-case Prisma status', async () => {
    mockPrisma.cooperative.findUnique.mockResolvedValue({ ...cooperative, id: 8 });

    await listOffers(requestFor({
      user: { id: 1, role: 'ADMIN', cooperativeId: null },
      query: { cooperativeId: '8', status: 'offered', page: '2', limit: '10' },
    }), createResponse(), jest.fn());

    expect(mockPrisma.offer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { cooperativeId: { in: [8] }, status: 'offered' },
      skip: 10,
      take: 10,
    }));
  });

  test("staff cannot manage another cooperative's offer", async () => {
    mockPrisma.offer.findFirst.mockResolvedValue(offer({ cooperativeId: 3 }));
    const res = createResponse();

    await acceptOffer(requestFor({ body: { agreedPricePerKg: 680 } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_SCOPE_DENIED');
    expect(mockPrisma.offer.updateMany).not.toHaveBeenCalled();
  });

  test('farmer detail lookup includes ownership and parses an integer ID', async () => {
    mockPrisma.offer.findFirst.mockResolvedValue(null);
    const res = createResponse();

    await getMyOffer(requestFor({
      params: { id: '41' },
      user: { id: 4, role: 'FARMER', cooperativeId: null },
    }), res, jest.fn());

    expect(mockPrisma.offer.findFirst).toHaveBeenCalledWith({
      where: { id: 41, farmerId: 4 },
      include: { batch: { select: { batchId: true } } },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_NOT_FOUND');
  });

  test('a farmer can still address their offer by human reference', async () => {
    mockPrisma.offer.findFirst.mockResolvedValue(offer());
    const res = createResponse();

    await getMyOffer(requestFor({
      params: { id: 'nto-20261123-abc123' },
      user: { id: 4, role: 'FARMER', cooperativeId: null },
    }), res, jest.fn());

    expect(mockPrisma.offer.findFirst.mock.calls[0][0].where).toEqual({
      reference: 'NTO-20261123-ABC123',
      farmerId: 4,
    });
    expect(res.json.mock.calls[0][0].data.id).toBe(41);
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('farmer');
  });
});

describe('offer lifecycle compare-and-set transitions', () => {
  test('an expired offered record cannot be accepted and is marked expired', async () => {
    mockPrisma.offer.findFirst.mockResolvedValue(offer({
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    }));
    const res = createResponse();

    await acceptOffer(requestFor({ body: { agreedPricePerKg: 680 } }), res, jest.fn());

    expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
      where: { id: 41, status: 'offered', expiresAt: { lte: expect.any(Date) } },
      data: { status: 'expired', expiredAt: expect.any(Date) },
    });
    expect(mockSmsService.sendOfferAccepted).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_EXPIRED');
  });

  test('direct acceptance atomically stores and texts the agreed price', async () => {
    const accepted = offer({
      status: 'accepted',
      agreedPricePerKg: 680,
      acceptedAt: new Date(),
    });
    mockPrisma.offer.findFirst.mockResolvedValue(offer());
    mockPrisma.offer.findUnique.mockResolvedValue(accepted);
    const res = createResponse();

    await acceptOffer(requestFor({ body: { agreedPricePerKg: 680 } }), res, jest.fn());

    expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        cooperativeId: 2,
        status: 'offered',
        expiresAt: { gt: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: 'accepted',
        agreedPricePerKg: 680,
        acceptedAt: expect.any(Date),
      }),
    });
    expect(mockSmsService.sendOfferAccepted).toHaveBeenCalledWith(farmer.phone, {
      reference: accepted.reference,
      tradeType: 'direct',
      agreedPricePerKg: 680,
      commissionPercent: 12.5,
    });
    expect(res.json.mock.calls[0][0].data.agreedPricePerKg).toBe(680);
  });

  test('consignment acceptance preserves the immutable commission snapshot', async () => {
    const offered = offer({ tradeType: 'consignment', commissionPercent: 9.75 });
    const accepted = offer({
      tradeType: 'consignment',
      commissionPercent: 9.75,
      status: 'accepted',
      acceptedAt: new Date(),
    });
    mockPrisma.offer.findFirst.mockResolvedValue(offered);
    mockPrisma.offer.findUnique.mockResolvedValue(accepted);

    await acceptOffer(requestFor(), createResponse(), jest.fn());

    const update = mockPrisma.offer.updateMany.mock.calls[0][0].data;
    expect(update).not.toHaveProperty('commissionPercent');
    expect(mockSmsService.sendOfferAccepted).toHaveBeenCalledWith(
      farmer.phone,
      expect.objectContaining({ tradeType: 'consignment', commissionPercent: 9.75 })
    );
  });

  test('rejection requires a reason and sends one farmer status SMS', async () => {
    const rejected = offer({
      status: 'rejected',
      rejectionReason: 'Capacity is full',
      rejectedAt: new Date(),
    });
    mockPrisma.offer.findFirst.mockResolvedValue(offer());
    mockPrisma.offer.findUnique.mockResolvedValue(rejected);

    await rejectOffer(
      requestFor({ body: { reason: ' Capacity is full ' } }),
      createResponse(),
      jest.fn()
    );

    expect(mockSmsService.sendOfferRejected).toHaveBeenCalledWith(farmer.phone, {
      reference: rejected.reference,
      rejectionReason: 'Capacity is full',
    });
  });

  test('delivery stores measurements and idempotently verifies the farmer', async () => {
    const accepted = offer({ status: 'accepted', agreedPricePerKg: 680 });
    const delivered = offer({
      status: 'delivered',
      agreedPricePerKg: 680,
      weighedKg: 87.5,
      moisturePercent: 18.2,
      deliveredAt: new Date(),
    });
    mockPrisma.offer.findFirst.mockResolvedValue(accepted);
    mockPrisma.offer.findUnique.mockResolvedValue(delivered);
    mockPrisma.user.findMany.mockResolvedValue([{
      ...farmer,
      farmerVerifiedAt: delivered.deliveredAt,
    }]);
    const res = createResponse();

    await recordDelivery(requestFor({
      body: { weighedKg: 87.5, moisturePercent: 18.2 },
    }), res, jest.fn());

    const transition = mockPrisma.offer.updateMany.mock.calls[0][0];
    expect(transition.where.status).toBe('accepted');
    expect(transition.data).toEqual({
      status: 'delivered',
      weighedKg: 87.5,
      moisturePercent: 18.2,
      deliveredAt: expect.any(Date),
    });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 4, role: 'FARMER', farmerVerifiedAt: null },
      data: { farmerVerifiedAt: transition.data.deliveredAt },
    });
    expect(res.json.mock.calls[0][0].data.farmer.isVerified).toBe(true);
  });

  test('verification changes only the offer lifecycle', async () => {
    const delivered = offer({ status: 'delivered', weighedKg: 87.5, moisturePercent: 18.2 });
    const verified = offer({
      ...delivered,
      status: 'verified',
      verifiedAt: new Date(),
    });
    mockPrisma.offer.findFirst.mockResolvedValue(delivered);
    mockPrisma.offer.findUnique.mockResolvedValue(verified);
    const res = createResponse();

    await verifyOffer(requestFor(), res, jest.fn());

    expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 41,
        status: 'delivered',
        weighedKg: { gt: 0, lte: 10000 },
        moisturePercent: { gt: 0, lt: 100 },
      }),
      data: { status: 'verified', verifiedAt: expect.any(Date) },
    });
    expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
    expect(mockPrisma.honeyBatch.create).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.status).toBe('verified');
  });

  test('legacy VERIFIED status delegates to the lower-case verification transition', async () => {
    mockPrisma.offer.findFirst.mockResolvedValue(offer({
      status: 'delivered',
      weighedKg: 90,
      moisturePercent: 17,
    }));
    mockPrisma.offer.findUnique.mockResolvedValue(offer({
      status: 'verified',
      weighedKg: 90,
      moisturePercent: 17,
      verifiedAt: new Date(),
    }));

    await updateOfferStatus(
      requestFor({ body: { status: 'VERIFIED' } }),
      createResponse(),
      jest.fn()
    );

    expect(mockPrisma.offer.updateMany.mock.calls[0][0].where.status).toBe('delivered');
  });
});

describe('farmer verification and expiry', () => {
  test('a cooperative idempotently verifies a farmer with its delivered offer', async () => {
    mockPrisma.offer.findFirst.mockResolvedValue({ id: 41 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 4,
      role: 'FARMER',
      farmerVerifiedAt: null,
    });
    const res = createResponse();

    await verifyFarmer(requestFor({ params: { farmerId: '4' } }), res, jest.fn());

    expect(mockPrisma.offer.findFirst).toHaveBeenCalledWith({
      where: {
        cooperativeId: 2,
        farmerId: 4,
        status: { in: ['delivered', 'verified'] },
      },
      select: { id: true },
    });
    expect(res.json.mock.calls[0][0].data.farmer).toEqual({ id: 4, isVerified: true });
  });

  test('expiry updates only offered records whose deadline has passed', async () => {
    const now = new Date('2026-11-23T20:00:00.000Z');
    mockPrisma.offer.updateMany.mockResolvedValue({ count: 3 });

    await expect(offerService.expireDueOffers(now)).resolves.toBe(3);
    expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
      where: { status: 'offered', expiresAt: { lte: now } },
      data: { status: 'expired', expiredAt: now },
    });
  });
});
