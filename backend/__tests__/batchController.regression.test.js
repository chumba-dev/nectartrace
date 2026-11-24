const mockPrisma = {
  cooperative: { findUnique: jest.fn() },
  honeyBatch: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  offer: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockBlockchain = {
  recordBatchOnChain: jest.fn(),
  getBatchFromChain: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/config/blockchain', () => mockBlockchain);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { computeLotIdsHash } = require('../src/utils/lotIdsHash');
const { createBatch } = require('../src/controllers/batchController');
const batchRouter = require('../src/routes/batches');

const app = express();
app.use(express.json());
app.use('/batches', batchRouter);
app.use((err, req, res, next) => res.status(500).json({ message: err.message }));

const firstOfferId = 2;
const secondOfferId = 11;
const expectedLotIdsHash = computeLotIdsHash([firstOfferId, secondOfferId]);

const validBody = {
  batchId: 'BAR-2026-001',
  village: 'Kabarnet',
  harvestDate: '2026-11-18',
  pricePerKg: 700,
  offerIds: [secondOfferId, firstOfferId],
};

const cooperative = {
  id: 2,
  name: 'Baringo Honey Cooperative',
  isVerified: true,
};

function offer(id, overrides = {}) {
  return {
    id,
    farmerId: 4,
    cooperativeId: 2,
    status: 'verified',
    weighedKg: id === firstOfferId ? 12.345 : 7.655,
    moisturePercent: id === firstOfferId ? 18 : 20,
    batchId: null,
    batchReservationToken: null,
    ...overrides,
  };
}

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

async function runCreate({ body = validBody, user } = {}) {
  const req = {
    body: { ...body },
    user: user || { id: 5, role: 'COOPERATIVE_STAFF', cooperativeId: 2 },
  };
  const res = createResponse();
  const next = jest.fn();
  await createBatch(req, res, next);
  return { req, res, next };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(mockPrisma));
  mockPrisma.cooperative.findUnique.mockResolvedValue(cooperative);
  mockPrisma.honeyBatch.findUnique.mockResolvedValue(null);
  mockPrisma.offer.findMany.mockResolvedValue([
    offer(firstOfferId),
    offer(secondOfferId),
  ]);
  mockPrisma.offer.updateMany.mockResolvedValue({ count: 2 });
  mockBlockchain.recordBatchOnChain.mockResolvedValue({
    txHash: '0xabc',
    blockNumber: 12,
    gasUsed: '123',
  });
  mockPrisma.honeyBatch.create.mockImplementation(async ({ data }) => ({
    id: 9,
    ...data,
  }));
});

test('manual batch calls without offer IDs fail before database or blockchain work', async () => {
  const { res, next } = await runCreate({
    body: {
      batchId: validBody.batchId,
      village: validBody.village,
      harvestDate: validBody.harvestDate,
      moisturePercent: 18.5,
      weightKg: 120,
    },
  });

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'offerIds must be a nonempty array of positive integer Offer IDs',
  });
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.offer.findMany).not.toHaveBeenCalled();
  expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test.each([
  ['an invalid batch ID', { batchId: 'batch-1' }, 'batchId must match BAR-YYYY-NNN exactly'],
  [
    'a future harvest date',
    { harvestDate: '2999-01-01' },
    'harvestDate must be a valid date that is not in the future',
  ],
  ['a zero price', { pricePerKg: 0 }, 'pricePerKg must be greater than 0 when supplied'],
  [
    'duplicate offer IDs',
    { offerIds: [firstOfferId, String(firstOfferId)] },
    'Lot IDs must be unique',
  ],
  [
    'an unsafe offer ID',
    { offerIds: [Number.MAX_SAFE_INTEGER + 1] },
    'offerIds must contain only positive safe integer Offer IDs',
  ],
])('rejects %s before reserving offers', async (description, override, message) => {
  const { res } = await runCreate({ body: { ...validBody, ...override } });

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, message });
  expect(mockPrisma.offer.updateMany).not.toHaveBeenCalled();
  expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
});

test('requires every requested integer Offer ID to resolve', async () => {
  mockPrisma.offer.findMany.mockResolvedValue([offer(firstOfferId)]);

  const { res } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json.mock.calls[0][0].code).toBe('OFFERS_NOT_FOUND');
  expect(mockPrisma.offer.updateMany).not.toHaveBeenCalled();
});

test.each([
  [
    'nonverified',
    [offer(firstOfferId, { status: 'delivered' }), offer(secondOfferId)],
    409,
    'OFFERS_NOT_VERIFIED',
  ],
  [
    'unweighed',
    [offer(firstOfferId, { weighedKg: null }), offer(secondOfferId)],
    409,
    'OFFER_MEASUREMENTS_REQUIRED',
  ],
  [
    'cross-cooperative',
    [offer(firstOfferId, { cooperativeId: 3 }), offer(secondOfferId)],
    403,
    'OFFER_SCOPE_DENIED',
  ],
  [
    'already-batched',
    [offer(firstOfferId, { batchId: 9 }), offer(secondOfferId)],
    409,
    'OFFERS_ALREADY_BATCHED',
  ],
  [
    'already-reserved',
    [offer(firstOfferId, { batchReservationToken: 'other-request' }), offer(secondOfferId)],
    409,
    'OFFER_RESERVATION_CONFLICT',
  ],
])('rejects %s lots before chain submission', async (description, offers, status, code) => {
  mockPrisma.offer.findMany.mockResolvedValue(offers);

  const { res } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json.mock.calls[0][0].code).toBe(code);
  expect(mockPrisma.offer.updateMany).not.toHaveBeenCalled();
  expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
});

test('derives authoritative weight, weighted moisture, and lot hash from Prisma offers', async () => {
  const { res, next } = await runCreate({
    body: {
      ...validBody,
      batchId: ' BAR-2026-001 ',
      village: ' Kabarnet ',
      weightKg: 999999,
      moisturePercent: 1,
    },
  });
  const expectedMoisture = ((12.345 * 18) + (7.655 * 20)) / 20;

  expect(mockBlockchain.recordBatchOnChain).toHaveBeenCalledWith({
    batchId: 'BAR-2026-001',
    village: 'Kabarnet',
    cooperativeName: cooperative.name,
    moisturePercent: expectedMoisture,
    weightGrams: 20000,
    harvestDate: '2026-11-18',
    lotIdsHash: expectedLotIdsHash,
  });
  expect(mockPrisma.honeyBatch.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      batchId: 'BAR-2026-001',
      moistureContent: expectedMoisture,
      weightKg: 20,
      lotIdsHash: expectedLotIdsHash,
      blockchainTxHash: '0xabc',
    }),
  }));
  expect(mockPrisma.offer.updateMany.mock.calls[0][0]).toEqual({
    where: {
      id: { in: [firstOfferId, secondOfferId] },
      cooperativeId: cooperative.id,
      status: 'verified',
      batchId: null,
      batchReservationToken: null,
      weighedKg: { gt: 0 },
      moisturePercent: { gt: 0, lt: 100 },
    },
    data: { batchReservationToken: expect.any(String) },
  });
  const token = mockPrisma.offer.updateMany.mock.calls[0][0].data.batchReservationToken;
  expect(mockPrisma.offer.updateMany.mock.calls[1][0]).toEqual({
    where: {
      id: { in: [firstOfferId, secondOfferId] },
      batchReservationToken: token,
      batchId: null,
    },
    data: { batchId: 9, batchReservationToken: null },
  });
  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(next).not.toHaveBeenCalled();

  const chainArgs = mockBlockchain.recordBatchOnChain.mock.calls[0][0];
  const publicPayload = res.json.mock.calls[0][0];
  expect(chainArgs).not.toHaveProperty('offerIds');
  expect(JSON.stringify(chainArgs)).not.toMatch(/farmer|user|phone|mpesa|payment|reservation/i);
  expect(JSON.stringify(publicPayload)).not.toMatch(/offerIds|farmerId|batchReservationToken/i);
});

test('rounds only the chain gram representation while retaining DB kilograms', async () => {
  mockPrisma.offer.findMany.mockResolvedValue([
    offer(firstOfferId, { weighedKg: 1.2344, moisturePercent: 18 }),
    offer(secondOfferId, { weighedKg: 0.0004, moisturePercent: 19 }),
  ]);

  await runCreate();

  expect(mockBlockchain.recordBatchOnChain).toHaveBeenCalledWith(expect.objectContaining({
    weightGrams: 1235,
  }));
  expect(mockPrisma.honeyBatch.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ weightKg: 1.2348 }),
  }));
});

test('rolls back only this request reservation when compare-and-set count conflicts', async () => {
  mockPrisma.offer.updateMany
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 1 });

  const { res } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json.mock.calls[0][0].code).toBe('OFFER_RESERVATION_CONFLICT');
  const token = mockPrisma.offer.updateMany.mock.calls[0][0].data.batchReservationToken;
  expect(mockPrisma.offer.updateMany.mock.calls[1][0]).toEqual({
    where: { batchReservationToken: token },
    data: { batchReservationToken: null },
  });
  expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
});

test('releases reservations when chain submission fails', async () => {
  mockPrisma.offer.updateMany
    .mockResolvedValueOnce({ count: 2 })
    .mockResolvedValueOnce({ count: 2 });
  mockBlockchain.recordBatchOnChain.mockRejectedValue(new Error('RPC failure'));

  const { res } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(502);
  const token = mockPrisma.offer.updateMany.mock.calls[0][0].data.batchReservationToken;
  expect(mockPrisma.offer.updateMany.mock.calls[1][0]).toEqual({
    where: { batchReservationToken: token },
    data: { batchReservationToken: null },
  });
  expect(mockPrisma.honeyBatch.create).not.toHaveBeenCalled();
});

test('keeps reservations when database finalization fails after chain confirmation', async () => {
  mockPrisma.honeyBatch.create.mockRejectedValue(new Error('database unavailable'));

  const { res, next } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
    success: false,
    code: 'BATCH_RECONCILIATION_REQUIRED',
    data: expect.objectContaining({
      batchId: validBody.batchId,
      blockchainTxHash: '0xabc',
      lotIdsHash: expectedLotIdsHash,
    }),
  }));
  expect(mockPrisma.offer.updateMany).toHaveBeenCalledTimes(1);
  expect(next).not.toHaveBeenCalled();
});

test('keeps reservations when final compare-and-set count conflicts', async () => {
  mockPrisma.offer.updateMany
    .mockResolvedValueOnce({ count: 2 })
    .mockResolvedValueOnce({ count: 1 });

  const { res } = await runCreate();

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].code).toBe('BATCH_RECONCILIATION_REQUIRED');
  expect(mockPrisma.offer.updateMany).toHaveBeenCalledTimes(2);
});

test('ADMIN must explicitly select a verified cooperative', async () => {
  const { res } = await runCreate({ user: { id: 1, role: 'ADMIN', cooperativeId: null } });

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].code).toBe('COOPERATIVE_REQUIRED');
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
});

test('ADMIN resolves the supplied verified cooperative before loading lots', async () => {
  await runCreate({
    body: { ...validBody, cooperativeId: '2' },
    user: { id: 1, role: 'ADMIN', cooperativeId: null },
  });

  expect(mockPrisma.cooperative.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
  expect(mockBlockchain.recordBatchOnChain).toHaveBeenCalledTimes(1);
});

test('GET /batches/:batchId/verify is public and returns aggregate details plus hash', async () => {
  mockBlockchain.getBatchFromChain.mockResolvedValue({
    batchId: 'BAR-2026-001',
    cooperativeName: 'Baringo Honey Cooperative',
    moisturePercent: 18.5,
    weightKg: 20,
    lotIdsHash: expectedLotIdsHash,
  });

  const response = await request(app).get('/batches/BAR-2026-001/verify');

  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({
    success: true,
    verified: true,
    data: expect.objectContaining({
      batchId: 'BAR-2026-001',
      weightKg: 20,
      moisturePercent: 18.5,
      lotIdsHash: expectedLotIdsHash,
    }),
  }));
  expect(response.body.data).not.toHaveProperty('offerIds');
  expect(mockBlockchain.getBatchFromChain).toHaveBeenCalledWith('BAR-2026-001');
});
