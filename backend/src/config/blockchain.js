const { ethers } = require('ethers');
const env = require('./env');
const logger = require('../utils/logger');

// HoneyBatch v2 ABI. Lot preimages and all identity/payment data stay off-chain.
const HONEY_BATCH_ABI = [
  'function getBatch(string memory batchId) external view returns (tuple(string batchId, string village, string cooperativeName, uint256 moistureContent, uint256 weightGrams, string harvestDate, bytes32 lotIdsHash, address verifiedBy, uint256 timestamp))',
  'function batchIdExists(string memory batchId) external view returns (bool)',
  'function getTotalBatches() external view returns (uint256)',
  'function getCooperativeBatches(address cooperative) external view returns (string[])',
  'function hasRole(bytes32 role, address account) external view returns (bool)',
  'function COOPERATIVE_ROLE() external view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() external view returns (bytes32)',
  'function recordBatch(string memory batchId, string memory village, string memory cooperativeName, uint256 moistureContent, uint256 weightGrams, string memory harvestDate, bytes32 lotIdsHash) external',
  'function addCooperative(address cooperativeWallet) external',
  'event BatchRecorded(string indexed batchId, string village, string cooperativeName, uint256 moistureContent, uint256 weightGrams, bytes32 lotIdsHash, address indexed verifiedBy, uint256 timestamp)',
];

let provider = null;
let wallet = null;
let readContract = null;
let writeContract = null;

function validateBaseConfig() {
  const { rpcUrl, contractAddress } = env.blockchain;
  if (typeof rpcUrl !== 'string' || !rpcUrl.trim() || !ethers.isAddress(contractAddress)) {
    throw new Error('Blockchain reads require RPC_URL and a valid CONTRACT_ADDRESS');
  }
  return { rpcUrl: rpcUrl.trim(), contractAddress };
}

function initializeRead() {
  if (readContract) return readContract;

  const { rpcUrl, contractAddress } = validateBaseConfig();
  provider = new ethers.JsonRpcProvider(rpcUrl);
  readContract = new ethers.Contract(contractAddress, HONEY_BATCH_ABI, provider);
  logger.info('Blockchain read service initialized', { contract: contractAddress });
  return readContract;
}

function initializeWrite() {
  if (writeContract) return writeContract;

  const readOnly = initializeRead();
  const { privateKey } = env.blockchain;
  if (typeof privateKey !== 'string' || !privateKey.trim()) {
    throw new Error('Blockchain writes require PRIVATE_KEY');
  }

  wallet = new ethers.Wallet(privateKey.trim(), provider);
  writeContract = readOnly.connect(wallet);
  logger.info('Blockchain write service initialized', {
    contract: env.blockchain.contractAddress,
    wallet: wallet.address,
  });
  return writeContract;
}

function getReadContract() {
  return initializeRead();
}

function getWriteContract() {
  return initializeWrite();
}

// Retained for existing internal callers; contract mutations always require a signer.
function getContract() {
  return getWriteContract();
}

function getWallet() {
  initializeWrite();
  return wallet;
}

function getProvider() {
  initializeRead();
  return provider;
}

function requireText(value, name, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new TypeError(`${name} must be a nonempty string of at most ${maxLength} characters`);
  }
  return value.trim();
}

function requireSafePositiveInteger(value, name) {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function validateLotIdsHash(value) {
  if (!ethers.isHexString(value, 32) || value.toLowerCase() === ethers.ZeroHash) {
    throw new TypeError('lotIdsHash must be a nonzero bytes32 value');
  }
  return value.toLowerCase();
}

/** Convert a percentage such as 18.5 to the contract's tenths representation. */
function moistureToChain(moisturePercent) {
  if (!Number.isFinite(moisturePercent) || moisturePercent <= 0 || moisturePercent >= 100) {
    throw new TypeError('moisturePercent must be greater than 0 and less than 100');
  }
  const moistureContent = Math.round(moisturePercent * 10);
  if (!Number.isSafeInteger(moistureContent) || moistureContent <= 0 || moistureContent >= 1000) {
    throw new TypeError('moisturePercent cannot be represented safely on-chain');
  }
  return moistureContent;
}

function moistureFromChain(moistureInt) {
  return requireSafePositiveInteger(moistureInt, 'moistureContent') / 10;
}

async function recordBatchOnChain({
  batchId,
  village,
  cooperativeName,
  moisturePercent,
  weightGrams,
  harvestDate,
  lotIdsHash,
}) {
  const normalized = {
    batchId: requireText(batchId, 'batchId', 120),
    village: requireText(village, 'village', 120),
    cooperativeName: requireText(cooperativeName, 'cooperativeName', 200),
    moistureContent: moistureToChain(moisturePercent),
    weightGrams: requireSafePositiveInteger(weightGrams, 'weightGrams'),
    harvestDate: requireText(harvestDate, 'harvestDate', 10),
    lotIdsHash: validateLotIdsHash(lotIdsHash),
  };
  if (!/^BAR-\d{4}-\d{3}$/.test(normalized.batchId)) {
    throw new TypeError('batchId must match BAR-YYYY-NNN exactly');
  }
  const harvestDateValue = new Date(`${normalized.harvestDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized.harvestDate)
    || Number.isNaN(harvestDateValue.getTime())
    || harvestDateValue.toISOString().slice(0, 10) !== normalized.harvestDate
  ) {
    throw new TypeError('harvestDate must use YYYY-MM-DD');
  }

  const contract = getWriteContract();
  logger.info('Recording batch on-chain', { batchId: normalized.batchId });
  const tx = await contract.recordBatch(
    normalized.batchId,
    normalized.village,
    normalized.cooperativeName,
    normalized.moistureContent,
    normalized.weightGrams,
    normalized.harvestDate,
    normalized.lotIdsHash
  );
  const receipt = await tx.wait();

  logger.info('Batch transaction confirmed', {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}

async function getBatchFromChain(batchId) {
  const normalizedBatchId = requireText(batchId, 'batchId', 120);
  const contract = getReadContract();
  if (!await contract.batchIdExists(normalizedBatchId)) return null;

  const batch = await contract.getBatch(normalizedBatchId);
  const weightGrams = requireSafePositiveInteger(batch.weightGrams, 'weightGrams');
  const timestamp = requireSafePositiveInteger(batch.timestamp, 'timestamp');

  return {
    batchId: batch.batchId,
    village: batch.village,
    cooperativeName: batch.cooperativeName,
    moisturePercent: moistureFromChain(batch.moistureContent),
    weightKg: weightGrams / 1000,
    harvestDate: batch.harvestDate,
    lotIdsHash: validateLotIdsHash(batch.lotIdsHash),
    verifiedBy: batch.verifiedBy,
    timestamp: new Date(timestamp * 1000).toISOString(),
  };
}

async function isCooperative(address) {
  if (!ethers.isAddress(address)) throw new TypeError('A valid cooperative address is required');
  const contract = getReadContract();
  const role = await contract.COOPERATIVE_ROLE();
  return contract.hasRole(role, address);
}

async function addCooperativeOnChain(address) {
  if (!ethers.isAddress(address)) throw new TypeError('A valid cooperative address is required');
  const contract = getWriteContract();
  const role = await contract.COOPERATIVE_ROLE();
  if (await contract.hasRole(role, address)) {
    return { txHash: null, alreadyGranted: true };
  }

  const tx = await contract.addCooperative(address);
  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    alreadyGranted: false,
  };
}

module.exports = {
  HONEY_BATCH_ABI,
  initialize: initializeRead,
  initializeRead,
  initializeWrite,
  getContract,
  getReadContract,
  getWriteContract,
  getWallet,
  getProvider,
  recordBatchOnChain,
  getBatchFromChain,
  addCooperativeOnChain,
  isCooperative,
  moistureToChain,
  moistureFromChain,
  validateLotIdsHash,
};
