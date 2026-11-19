const mockPrisma = {
  cooperative: { findUnique: jest.fn() },
  honeyBatch: {
    findUnique: jest.fn(),
    create: jest.fn(),
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

const { createBatch } = require('../src/controllers/batchController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const validBody = {
  batchId: 'BAR-2026-001',
  village: 'Kabarnet',
  harvestDate: '2026-11-18',
  moisturePercent: 18.5,
  weightKg: 120,
  pricePerKg: 700,
};

beforeEach(() => {
  jest.resetAllMocks();
});

test.each([
  ['an invalid batch ID', { batchId: 'batch-1' }, 'batchId must match BAR-YYYY-NNN exactly'],
  [
    'a future harvest date',
    { harvestDate: '2999-01-01' },
    'harvestDate must be a valid date that is not in the future',
  ],
  [
    'zero moisture',
    { moisturePercent: 0 },
    'moisturePercent must be greater than 0 and less than 100 with at most one decimal place',
  ],
  [
    '100 percent moisture',
    { moisturePercent: 100 },
    'moisturePercent must be greater than 0 and less than 100 with at most one decimal place',
  ],
  [
    'more than one moisture decimal',
    { moisturePercent: '18.55' },
    'moisturePercent must be greater than 0 and less than 100 with at most one decimal place',
  ],
  [
    'fractional weight',
    { weightKg: 12.5 },
    'weightKg must be a whole number of kilograms and at least 1',
  ],
  [
    'a zero price',
    { pricePerKg: 0 },
    'pricePerKg must be greater than 0 when supplied',
  ],
])('rejects %s before database or blockchain work', async (description, override, message) => {
  const req = {
    body: { ...validBody, ...override },
    user: { id: 5, role: 'COOPERATIVE_STAFF', cooperativeId: 2 },
  };
  const res = createResponse();
  const next = jest.fn();

  await createBatch(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, message });
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
  expect(mockBlockchain.recordBatchOnChain).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('uses validated values consistently for blockchain and database writes', async () => {
  const cooperative = { id: 2, name: 'Baringo Honey Cooperative' };
  const blockchainResult = { txHash: '0xabc', blockNumber: 12 };
  const savedBatch = { id: 9, ...validBody, cooperativeId: cooperative.id };
  mockPrisma.cooperative.findUnique.mockResolvedValue(cooperative);
  mockPrisma.honeyBatch.findUnique.mockResolvedValue(null);
  mockBlockchain.recordBatchOnChain.mockResolvedValue(blockchainResult);
  mockPrisma.honeyBatch.create.mockResolvedValue(savedBatch);

  const req = {
    body: { ...validBody, batchId: ' BAR-2026-001 ', village: ' Kabarnet ' },
    user: { id: 5, role: 'COOPERATIVE_STAFF', cooperativeId: cooperative.id },
  };
  const res = createResponse();
  const next = jest.fn();

  await createBatch(req, res, next);

  expect(mockBlockchain.recordBatchOnChain).toHaveBeenCalledWith({
    batchId: 'BAR-2026-001',
    village: 'Kabarnet',
    cooperativeName: cooperative.name,
    moisturePercent: 18.5,
    weightKg: 120,
    harvestDate: '2026-11-18',
  });
  expect(mockPrisma.honeyBatch.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      batchId: 'BAR-2026-001',
      village: 'Kabarnet',
      moistureContent: 18.5,
      weightKg: 120,
      pricePerKg: 700,
      blockchainTxHash: '0xabc',
    }),
  }));
  expect(res.status).toHaveBeenCalledWith(201);
  expect(next).not.toHaveBeenCalled();
});
