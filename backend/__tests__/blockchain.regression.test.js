const mockRpcUrl = 'https://rpc.example.test/private-api-token';
const mockContractAddress = '0x1111111111111111111111111111111111111111';
const mockLotIdsHash = `0x${'ab'.repeat(32)}`;
const mockProvider = { kind: 'provider' };
const mockReadContract = {
  batchIdExists: jest.fn(),
  getBatch: jest.fn(),
  COOPERATIVE_ROLE: jest.fn(),
  hasRole: jest.fn(),
  connect: jest.fn(),
};
const mockWriteContract = {
  recordBatch: jest.fn(),
};
const mockJsonRpcProvider = jest.fn(() => mockProvider);
const mockContractConstructor = jest.fn(() => mockReadContract);
const mockWallet = jest.fn();
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('ethers', () => ({
  ethers: {
    Contract: mockContractConstructor,
    JsonRpcProvider: mockJsonRpcProvider,
    Wallet: mockWallet,
    ZeroHash: `0x${'00'.repeat(32)}`,
    isAddress: jest.fn((value) => /^0x[a-f\d]{40}$/i.test(value || '')),
    isHexString: jest.fn((value, length) => (
      typeof value === 'string'
      && new RegExp(`^0x[a-f\\d]{${length * 2}}$`, 'i').test(value)
    )),
  },
}));
jest.mock('../src/config/env', () => ({
  blockchain: {
    rpcUrl: mockRpcUrl,
    privateKey: undefined,
    contractAddress: mockContractAddress,
  },
}));
jest.mock('../src/utils/logger', () => mockLogger);

const blockchain = require('../src/config/blockchain');
const env = require('../src/config/env');

beforeEach(() => {
  jest.clearAllMocks();
  mockReadContract.batchIdExists.mockResolvedValue(true);
  mockReadContract.getBatch.mockResolvedValue({
    batchId: 'BAR-2026-001',
    village: 'Kabarnet',
    cooperativeName: 'Highlands',
    moistureContent: 185n,
    weightGrams: 12345n,
    harvestDate: '2026-11-18',
    lotIdsHash: mockLotIdsHash,
    verifiedBy: mockContractAddress,
    timestamp: 1795046400n,
  });
  mockReadContract.connect.mockReturnValue(mockWriteContract);
  mockWallet.mockImplementation(() => ({
    address: '0x2222222222222222222222222222222222222222',
  }));
  mockWriteContract.recordBatch.mockResolvedValue({
    wait: jest.fn().mockResolvedValue({
      hash: '0xtransaction',
      blockNumber: 44,
      gasUsed: 123n,
    }),
  });
  env.blockchain.privateKey = undefined;
});

test('public chain reads initialize with provider only and preserve fractional kilograms', async () => {
  const batch = await blockchain.getBatchFromChain('BAR-2026-001');

  expect(batch).toEqual(expect.objectContaining({
    batchId: 'BAR-2026-001',
    moisturePercent: 18.5,
    weightKg: 12.345,
    lotIdsHash: mockLotIdsHash,
  }));
  expect(mockJsonRpcProvider).toHaveBeenCalledWith(mockRpcUrl);
  expect(mockContractConstructor).toHaveBeenCalledWith(
    mockContractAddress,
    blockchain.HONEY_BATCH_ABI,
    mockProvider
  );
  expect(mockWallet).not.toHaveBeenCalled();
  expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(mockRpcUrl);
});

test('manual ABI exposes only aggregate batch fields and the lot commitment', () => {
  const recordSignature = blockchain.HONEY_BATCH_ABI.find((entry) => (
    entry.startsWith('function recordBatch')
  ));
  const eventSignature = blockchain.HONEY_BATCH_ABI.find((entry) => (
    entry.startsWith('event BatchRecorded')
  ));

  expect(recordSignature).toContain('uint256 weightGrams');
  expect(recordSignature).toContain('bytes32 lotIdsHash');
  expect(eventSignature).toContain('uint256 weightGrams');
  expect(eventSignature).toContain('bytes32 lotIdsHash');
  expect(`${recordSignature} ${eventSignature}`).not.toMatch(
    /farmer|user|phone|mpesa|payment|offer|mongo/i
  );
});

test('batch writes send the commitment and no raw lot or identity data', async () => {
  env.blockchain.privateKey = `0x${'11'.repeat(32)}`;

  await blockchain.recordBatchOnChain({
    batchId: 'BAR-2026-002',
    village: 'Kabarnet',
    cooperativeName: 'Highlands',
    moisturePercent: 18.5,
    weightGrams: 12550,
    harvestDate: '2026-11-18',
    lotIdsHash: mockLotIdsHash,
  });

  expect(mockWriteContract.recordBatch).toHaveBeenCalledWith(
    'BAR-2026-002',
    'Kabarnet',
    'Highlands',
    185,
    12550,
    '2026-11-18',
    mockLotIdsHash
  );
  const serializedArgs = JSON.stringify(mockWriteContract.recordBatch.mock.calls[0]);
  expect(serializedArgs).not.toMatch(/farmer|user|phone|mpesa|payment|offer|mongo/i);
  expect(serializedArgs).not.toContain('64b64c2f3f3f3f3f3f3f3f3f');
});

test('bytes32 validation rejects zero and malformed commitments', () => {
  expect(() => blockchain.validateLotIdsHash(`0x${'00'.repeat(32)}`))
    .toThrow('lotIdsHash must be a nonzero bytes32 value');
  expect(() => blockchain.validateLotIdsHash('0x1234'))
    .toThrow('lotIdsHash must be a nonzero bytes32 value');
});
