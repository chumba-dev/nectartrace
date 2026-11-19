const mockPrisma = {
  harvestOffer: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  honeyBatch: {
    findUnique: jest.fn(),
  },
  farmerSettlement: {
    upsert: jest.fn(),
  },
  order: {
    aggregate: jest.fn(),
  },
};
const mockBlockchain = {
  recordBatchOnChain: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/config/blockchain', () => mockBlockchain);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const {
  listOffers,
  updateOfferStatus,
  verifyOffer,
  upsertSettlement,
} = require('../src/controllers/harvestOfferController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function offer(overrides = {}) {
  return {
    id: 9,
    reference: 'NTO-20261119-ABC123',
    farmerId: 4,
    cooperativeId: 2,
    pickupVillage: 'Kabarnet',
    offeredWeightKg: 100,
    expectedPricePerKg: 700,
    settlementType: 'DIRECT_PURCHASE',
    status: 'SUBMITTED',
    acceptedWeightKg: null,
    agreedPricePerKg: null,
    honeyBatchId: null,
    settlement: null,
    cooperative: { id: 2, name: 'Baringo Honey' },
    farmer: { id: 4, name: 'Farmer' },
    batch: null,
    ...overrides,
  };
}

function requestFor(overrides = {}) {
  return {
    params: { id: '9' },
    query: {},
    body: {},
    user: { id: 7, role: 'COOPERATIVE_STAFF', cooperativeId: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('offer scoping and transitions', () => {
  test('cooperative staff list only their cooperative offers', async () => {
    mockPrisma.harvestOffer.findMany.mockResolvedValue([offer()]);
    const req = requestFor();
    const res = createResponse();

    await listOffers(req, res, jest.fn());

    expect(mockPrisma.harvestOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { cooperativeId: 2 },
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  test('an admin may filter the list by a positive cooperative ID', async () => {
    mockPrisma.harvestOffer.findMany.mockResolvedValue([]);
    const req = requestFor({
      user: { id: 1, role: 'ADMIN', cooperativeId: null },
      query: { cooperativeId: '8' },
    });
    const res = createResponse();

    await listOffers(req, res, jest.fn());

    expect(mockPrisma.harvestOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { cooperativeId: 8 },
    }));
  });

  test("staff cannot update another cooperative's offer", async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({ cooperativeId: 3 }));
    const req = requestFor({ body: { status: 'REJECTED', rejectionReason: 'Not enough space' } });
    const res = createResponse();

    await updateOfferStatus(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.harvestOffer.updateMany).not.toHaveBeenCalled();
  });

  test('acceptance requires positive weight and price', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer());
    const req = requestFor({
      body: { status: 'ACCEPTED', acceptedWeightKg: 0, agreedPricePerKg: 700 },
    });
    const res = createResponse();

    await updateOfferStatus(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.harvestOffer.updateMany).not.toHaveBeenCalled();
  });

  test('atomically accepts a submitted offer with agreed terms', async () => {
    const submitted = offer();
    const accepted = offer({
      status: 'ACCEPTED',
      acceptedWeightKg: 95,
      agreedPricePerKg: 680,
    });
    mockPrisma.harvestOffer.findUnique
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce(accepted);
    mockPrisma.harvestOffer.updateMany.mockResolvedValue({ count: 1 });
    const req = requestFor({
      body: { status: 'ACCEPTED', acceptedWeightKg: 95, agreedPricePerKg: 680 },
    });
    const res = createResponse();

    await updateOfferStatus(req, res, jest.fn());

    expect(mockPrisma.harvestOffer.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: 'SUBMITTED' },
      data: {
        status: 'ACCEPTED',
        acceptedWeightKg: 95,
        agreedPricePerKg: 680,
        rejectionReason: null,
      },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: accepted,
    }));
  });

  test('rejects a transition not present in the workflow', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer());
    const req = requestFor({ body: { status: 'RECEIVED' } });
    const res = createResponse();

    await updateOfferStatus(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.harvestOffer.updateMany).not.toHaveBeenCalled();
  });
});

describe('verification and settlement', () => {
  test('does not expose a raw blockchain error while verifying', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({ status: 'RECEIVED' }));
    mockPrisma.honeyBatch.findUnique.mockResolvedValue(null);
    mockBlockchain.recordBatchOnChain.mockRejectedValue(new Error('RPC secret detail'));
    const req = requestFor({
      body: {
        batchId: 'BAR-2026-001',
        village: 'Kabarnet',
        harvestDate: '2026-11-18',
        moisturePercent: 18.5,
        weightKg: 95,
        pricePerKg: 680,
      },
    });
    const res = createResponse();

    await verifyOffer(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to record batch on blockchain',
    });
  });

  test('links the new batch while marking a received offer verified', async () => {
    const received = offer({ status: 'RECEIVED' });
    const verified = offer({
      status: 'VERIFIED',
      honeyBatchId: 31,
      batch: { id: 31, batchId: 'BAR-2026-001' },
    });
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(received);
    mockPrisma.honeyBatch.findUnique.mockResolvedValue(null);
    mockBlockchain.recordBatchOnChain.mockResolvedValue({ txHash: '0xabc' });
    mockPrisma.harvestOffer.update.mockResolvedValue(verified);
    const req = requestFor({
      body: {
        batchId: 'BAR-2026-001',
        village: 'Kabarnet',
        harvestDate: '2026-11-18',
        moisturePercent: 18.5,
        weightKg: 95,
        pricePerKg: 680,
      },
    });
    const res = createResponse();

    await verifyOffer(req, res, jest.fn());

    expect(mockPrisma.harvestOffer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9, status: 'RECEIVED', honeyBatchId: null },
      data: expect.objectContaining({
        status: 'VERIFIED',
        batch: {
          create: expect.objectContaining({
            batchId: 'BAR-2026-001',
            blockchainTxHash: '0xabc',
            cooperative: { connect: { id: 2 } },
          }),
        },
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ batch: verified.batch }),
    }));
  });

  test('direct-purchase settlement calculates net amount and partial status after acceptance', async () => {
    const accepted = offer({
      status: 'ACCEPTED',
      acceptedWeightKg: 100,
      agreedPricePerKg: 10,
    });
    const settled = offer({
      status: 'ACCEPTED',
      settlement: { status: 'PARTIALLY_PAID', netAmount: 1000, amountPaid: 300 },
    });
    mockPrisma.harvestOffer.findUnique
      .mockResolvedValueOnce(accepted)
      .mockResolvedValueOnce(settled);
    mockPrisma.farmerSettlement.upsert.mockResolvedValue({ id: 1 });
    const req = requestFor({
      body: { grossAmount: 1000, commissionAmount: 0, amountPaid: 300 },
    });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(mockPrisma.farmerSettlement.upsert).toHaveBeenCalledWith({
      where: { offerId: 9 },
      create: expect.objectContaining({
        offerId: 9,
        type: 'DIRECT_PURCHASE',
        grossAmount: 1000,
        commissionAmount: 0,
        netAmount: 1000,
        amountPaid: 300,
        status: 'PARTIALLY_PAID',
      }),
      update: expect.objectContaining({
        netAmount: 1000,
        status: 'PARTIALLY_PAID',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: settled }));
  });

  test('consignment settlement cannot begin before verification', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({
      status: 'ACCEPTED',
      settlementType: 'CONSIGNMENT',
    }));
    const req = requestFor({ body: { grossAmount: 1000 } });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.farmerSettlement.upsert).not.toHaveBeenCalled();
  });

  test('verified consignment can be recorded as paid', async () => {
    const verified = offer({
      status: 'VERIFIED',
      settlementType: 'CONSIGNMENT',
      honeyBatchId: 31,
    });
    const settled = offer({
      status: 'VERIFIED',
      settlementType: 'CONSIGNMENT',
      honeyBatchId: 31,
      settlement: { status: 'PAID', netAmount: 900, amountPaid: 900 },
    });
    mockPrisma.harvestOffer.findUnique
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(settled);
    mockPrisma.farmerSettlement.upsert.mockResolvedValue({ id: 2 });
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { totalPrice: 1000, quantityKg: 2 },
    });
    const req = requestFor({
      body: { grossAmount: 1000, commissionAmount: 100, amountPaid: 900 },
    });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(mockPrisma.farmerSettlement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: 'CONSIGNMENT',
        netAmount: 900,
        status: 'PAID',
        paidAt: expect.any(Date),
      }),
    }));
  });

  test('settlement rejects payment above calculated net amount', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({
      status: 'ACCEPTED',
      acceptedWeightKg: 100,
      agreedPricePerKg: 10,
    }));
    const req = requestFor({
      body: { grossAmount: 1000, commissionAmount: 0, amountPaid: 1001 },
    });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.farmerSettlement.upsert).not.toHaveBeenCalled();
  });

  test('consignment settlement requires delivered marketplace sales', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({
      status: 'VERIFIED',
      settlementType: 'CONSIGNMENT',
      honeyBatchId: 31,
    }));
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { totalPrice: null, quantityKg: null },
    });
    const req = requestFor({
      body: { grossAmount: 0, commissionAmount: 0, amountPaid: 0 },
    });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Consignment settlement requires at least one delivered marketplace order',
    });
    expect(mockPrisma.farmerSettlement.upsert).not.toHaveBeenCalled();
  });

  test('direct purchases cannot deduct a commission', async () => {
    mockPrisma.harvestOffer.findUnique.mockResolvedValue(offer({
      status: 'ACCEPTED',
      acceptedWeightKg: 100,
      agreedPricePerKg: 10,
    }));
    const req = requestFor({
      body: { grossAmount: 1000, commissionAmount: 50, amountPaid: 0 },
    });
    const res = createResponse();

    await upsertSettlement(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Direct-purchase settlements cannot deduct a commission',
    });
    expect(mockPrisma.farmerSettlement.upsert).not.toHaveBeenCalled();
  });
});
