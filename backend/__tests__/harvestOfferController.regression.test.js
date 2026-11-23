const mockOfferModel = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  exists: jest.fn(),
};

const mockPrisma = {
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

const mockBlockchain = {
  recordBatchOnChain: jest.fn(),
};

jest.mock('../src/models/Offer', () => mockOfferModel);
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
    _id: '64b64c2f3f3f3f3f3f3f3f3f',
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
    saleAmount: null,
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
    params: { id: 'NTO-20261123-ABC123' },
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
  mockOfferModel.find.mockResolvedValue([]);
  mockOfferModel.countDocuments.mockResolvedValue(0);
  mockOfferModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockOfferModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mockSmsService.sendOfferAccepted.mockResolvedValue({});
  mockSmsService.sendOfferRejected.mockResolvedValue({});
});

describe('verified cooperative scope and sanitized reads', () => {
  test('cooperative staff list only their verified cooperative offers', async () => {
    mockOfferModel.find.mockResolvedValue([offer()]);
    mockOfferModel.countDocuments.mockResolvedValue(1);
    const res = createResponse();

    await listOffers(requestFor(), res, jest.fn());

    expect(mockOfferModel.find).toHaveBeenCalledWith(
      { cooperativeId: { $in: [2] } },
      null,
      { sort: { createdAt: -1 }, skip: 0, limit: 20 }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }));
    const returnedOffer = res.json.mock.calls[0][0].data[0];
    expect(returnedOffer).not.toHaveProperty('ussdSessionId');
    expect(returnedOffer.farmer).toEqual({
      id: farmer.id,
      name: farmer.name,
      phone: farmer.phone,
      isVerified: false,
    });
    expect(returnedOffer.farmer).not.toHaveProperty('farmerVerifiedAt');
  });

  test('admin cooperative filters must target a verified cooperative', async () => {
    mockPrisma.cooperative.findUnique.mockResolvedValue({
      ...cooperative,
      id: 8,
      isVerified: false,
    });
    const req = requestFor({
      user: { id: 1, role: 'ADMIN', cooperativeId: null },
      query: { cooperativeId: '8' },
    });
    const res = createResponse();

    await listOffers(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('COOPERATIVE_NOT_VERIFIED');
    expect(mockOfferModel.find).not.toHaveBeenCalled();
  });

  test('an admin may filter incoming offers to a verified cooperative', async () => {
    mockPrisma.cooperative.findUnique.mockResolvedValue({ ...cooperative, id: 8 });
    const req = requestFor({
      user: { id: 1, role: 'ADMIN', cooperativeId: null },
      query: { cooperativeId: '8', status: 'offered', page: '2', limit: '10' },
    });

    await listOffers(req, createResponse(), jest.fn());

    expect(mockOfferModel.find).toHaveBeenCalledWith(
      { cooperativeId: { $in: [8] }, status: 'offered' },
      null,
      { sort: { createdAt: -1 }, skip: 10, limit: 10 }
    );
  });

  test("staff cannot manage another cooperative's offer", async () => {
    mockOfferModel.findOne.mockResolvedValue(offer({ cooperativeId: 3 }));
    const req = requestFor({ body: { agreedPricePerKg: 680 } });
    const res = createResponse();

    await acceptOffer(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_SCOPE_DENIED');
    expect(mockOfferModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('farmer detail lookup includes ownership in the Mongo query', async () => {
    mockOfferModel.findOne.mockResolvedValue(null);
    const req = requestFor({
      params: { id: 'NTO-OTHER-FARMER' },
      user: { id: 4, role: 'FARMER', cooperativeId: null },
    });
    const res = createResponse();

    await getMyOffer(req, res, jest.fn());

    expect(mockOfferModel.findOne).toHaveBeenCalledWith({
      reference: 'NTO-OTHER-FARMER',
      farmerId: 4,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_NOT_FOUND');
  });

  test('a farmer can read their own sanitized offer without farmer PII enrichment', async () => {
    mockOfferModel.findOne.mockResolvedValue(offer());
    const req = requestFor({
      user: { id: 4, role: 'FARMER', cooperativeId: null },
    });
    const res = createResponse();

    await getMyOffer(req, res, jest.fn());

    const returnedOffer = res.json.mock.calls[0][0].data;
    expect(returnedOffer.id).toBe('64b64c2f3f3f3f3f3f3f3f3f');
    expect(returnedOffer).not.toHaveProperty('ussdSessionId');
    expect(returnedOffer).not.toHaveProperty('farmer');
  });
});

describe('offer lifecycle compare-and-set transitions', () => {
  test('an expired offered record cannot be accepted and is marked expired', async () => {
    mockOfferModel.findOne.mockResolvedValue(offer({
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    }));
    const req = requestFor({ body: { agreedPricePerKg: 680 } });
    const res = createResponse();

    await acceptOffer(req, res, jest.fn());

    expect(mockOfferModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: '64b64c2f3f3f3f3f3f3f3f3f',
        status: 'offered',
        expiresAt: { $lte: expect.any(Date) },
      }),
      { $set: { status: 'expired', expiredAt: expect.any(Date) } },
      { runValidators: true }
    );
    expect(mockOfferModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSmsService.sendOfferAccepted).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('OFFER_EXPIRED');
  });

  test('direct acceptance atomically stores and texts the agreed price', async () => {
    const offered = offer();
    const accepted = offer({
      status: 'accepted',
      agreedPricePerKg: 680,
      acceptedAt: new Date(),
    });
    mockOfferModel.findOne.mockResolvedValue(offered);
    mockOfferModel.findOneAndUpdate.mockResolvedValue(accepted);
    const req = requestFor({ body: { agreedPricePerKg: 680 } });
    const res = createResponse();

    await acceptOffer(req, res, jest.fn());

    expect(mockOfferModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: offered._id,
        cooperativeId: 2,
        status: 'offered',
        expiresAt: { $gt: expect.any(Date) },
      }),
      { $set: expect.objectContaining({
        status: 'accepted',
        agreedPricePerKg: 680,
        acceptedAt: expect.any(Date),
      }) },
      { new: true, runValidators: true }
    );
    expect(mockSmsService.sendOfferAccepted).toHaveBeenCalledWith(
      farmer.phone,
      {
        reference: accepted.reference,
        tradeType: 'direct',
        agreedPricePerKg: 680,
        commissionPercent: 12.5,
      }
    );
    expect(res.json.mock.calls[0][0].data.agreedPricePerKg).toBe(680);
  });

  test('consignment acceptance texts the immutable commission snapshot', async () => {
    const offered = offer({ tradeType: 'consignment', commissionPercent: 9.75 });
    const accepted = offer({
      tradeType: 'consignment',
      commissionPercent: 9.75,
      status: 'accepted',
      acceptedAt: new Date(),
    });
    mockOfferModel.findOne.mockResolvedValue(offered);
    mockOfferModel.findOneAndUpdate.mockResolvedValue(accepted);

    await acceptOffer(requestFor(), createResponse(), jest.fn());

    expect(mockSmsService.sendOfferAccepted).toHaveBeenCalledWith(
      farmer.phone,
      expect.objectContaining({
        tradeType: 'consignment',
        commissionPercent: 9.75,
      })
    );
    const update = mockOfferModel.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set).not.toHaveProperty('commissionPercent');
  });

  test('rejection requires a reason and sends the farmer status SMS', async () => {
    const rejected = offer({
      status: 'rejected',
      rejectionReason: 'Capacity is full',
      rejectedAt: new Date(),
    });
    mockOfferModel.findOne.mockResolvedValue(offer());
    mockOfferModel.findOneAndUpdate.mockResolvedValue(rejected);
    const req = requestFor({ body: { reason: ' Capacity is full ' } });

    await rejectOffer(req, createResponse(), jest.fn());

    expect(mockSmsService.sendOfferRejected).toHaveBeenCalledWith(farmer.phone, {
      reference: rejected.reference,
      rejectionReason: 'Capacity is full',
    });
  });

  test('delivery stores measured values and idempotently verifies the farmer', async () => {
    const accepted = offer({
      status: 'accepted',
      agreedPricePerKg: 680,
      acceptedAt: new Date(),
    });
    const delivered = offer({
      status: 'delivered',
      agreedPricePerKg: 680,
      weighedKg: 87.5,
      moisturePercent: 18.2,
      deliveredAt: new Date(),
    });
    mockOfferModel.findOne.mockResolvedValue(accepted);
    mockOfferModel.findOneAndUpdate.mockResolvedValue(delivered);
    mockPrisma.user.findMany.mockResolvedValue([{
      ...farmer,
      farmerVerifiedAt: delivered.deliveredAt,
    }]);
    const req = requestFor({ body: { weighedKg: 87.5, moisturePercent: 18.2 } });
    const res = createResponse();

    await recordDelivery(req, res, jest.fn());

    const updateCall = mockOfferModel.findOneAndUpdate.mock.calls[0];
    expect(updateCall[0]).toEqual(expect.objectContaining({ status: 'accepted' }));
    expect(updateCall[1].$set).toEqual({
      status: 'delivered',
      weighedKg: 87.5,
      moisturePercent: 18.2,
      deliveredAt: expect.any(Date),
    });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 4, role: 'FARMER', farmerVerifiedAt: null },
      data: { farmerVerifiedAt: updateCall[1].$set.deliveredAt },
    });
    expect(res.json.mock.calls[0][0].data.weighedKg).toBe(87.5);
    expect(res.json.mock.calls[0][0].data.farmer.isVerified).toBe(true);
  });

  test('verification only changes the Mongo lifecycle and never writes blockchain or HoneyBatch', async () => {
    const delivered = offer({
      status: 'delivered',
      weighedKg: 87.5,
      moisturePercent: 18.2,
      deliveredAt: new Date(),
    });
    const verified = offer({
      ...delivered,
      status: 'verified',
      verifiedAt: new Date(),
    });
    mockOfferModel.findOne.mockResolvedValue(delivered);
    mockOfferModel.findOneAndUpdate.mockResolvedValue(verified);
    const res = createResponse();

    await verifyOffer(requestFor(), res, jest.fn());

    expect(mockOfferModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
        weighedKg: { $gt: 0, $lte: 10000 },
        moisturePercent: { $gt: 0, $lt: 100 },
      }),
      { $set: { status: 'verified', verifiedAt: expect.any(Date) } },
      { new: true, runValidators: true }
    );
    expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
    expect(mockPrisma.honeyBatch.create).not.toHaveBeenCalled();
    expect(mockPrisma.honeyBatch.update).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.status).toBe('verified');
  });

  test('legacy VERIFIED status delegates to the same verification transition', async () => {
    const delivered = offer({
      status: 'delivered',
      weighedKg: 90,
      moisturePercent: 17,
    });
    mockOfferModel.findOne.mockResolvedValue(delivered);
    mockOfferModel.findOneAndUpdate.mockResolvedValue(offer({
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

    expect(mockOfferModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' }),
      expect.any(Object),
      { new: true, runValidators: true }
    );
  });
});

describe('farmer verification and expiry', () => {
  test('a cooperative idempotently verifies a farmer with its delivered offer', async () => {
    mockOfferModel.exists.mockResolvedValue({ _id: 'qualifying-offer' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 4,
      role: 'FARMER',
      farmerVerifiedAt: null,
    });
    const req = requestFor({ params: { farmerId: '4' } });
    const res = createResponse();

    await verifyFarmer(req, res, jest.fn());

    expect(mockOfferModel.exists).toHaveBeenCalledWith({
      cooperativeId: 2,
      farmerId: 4,
      status: { $in: ['delivered', 'verified'] },
    });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 4, role: 'FARMER', farmerVerifiedAt: null },
      data: { farmerVerifiedAt: expect.any(Date) },
    });
    expect(res.json.mock.calls[0][0].data.farmer).toEqual({ id: 4, isVerified: true });
  });

  test('expiry updates only offered records whose deadline has passed', async () => {
    const now = new Date('2026-11-23T20:00:00.000Z');
    mockOfferModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const expiredCount = await offerService.expireDueOffers(now);

    expect(mockOfferModel.updateMany).toHaveBeenCalledWith(
      { status: 'offered', expiresAt: { $lte: now } },
      { $set: { status: 'expired', expiredAt: now } },
      { runValidators: true }
    );
    expect(expiredCount).toBe(3);
    expect(mockOfferModel).not.toHaveProperty('deleteMany');
  });
});
