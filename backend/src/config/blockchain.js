const { ethers } = require('ethers');
const env = require('./env');
const logger = require('../utils/logger');

// HoneyBatch contract ABI (only the functions we use)
const HONEY_BATCH_ABI = [
  // Read functions
  'function getBatch(string memory batchId) external view returns (tuple(string batchId, string village, string cooperativeName, uint256 moistureContent, uint256 weightKg, string harvestDate, address verifiedBy, uint256 timestamp))',
  'function batchIdExists(string memory batchId) external view returns (bool)',
  'function getTotalBatches() external view returns (uint256)',
  'function getCooperativeBatches(address cooperative) external view returns (string[])',
  'function hasRole(bytes32 role, address account) external view returns (bool)',
  'function COOPERATIVE_ROLE() external view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() external view returns (bytes32)',

  // Write functions
  'function recordBatch(string memory batchId, string memory village, string memory cooperativeName, uint256 moistureContent, uint256 weightKg, string memory harvestDate) external',
  'function addCooperative(address cooperativeWallet) external',

  // Events
  'event BatchRecorded(string indexed batchId, string village, string cooperativeName, uint256 moistureContent, uint256 weightKg, address indexed verifiedBy, uint256 timestamp)',
];

// Initialize provider and wallet
let provider = null;
let wallet = null;
let contract = null;

function initialize() {
  if (contract) return contract;

  const { rpcUrl, privateKey, contractAddress } = env.blockchain;

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error(
      'Blockchain not configured. Check RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS in .env'
    );
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);
  wallet = new ethers.Wallet(privateKey, provider);
  contract = new ethers.Contract(contractAddress, HONEY_BATCH_ABI, wallet);

  logger.info('Blockchain service initialized', {
    rpc: rpcUrl,
    contract: contractAddress,
    wallet: wallet.address,
  });

  return contract;
}

function getContract() {
  if (!contract) initialize();
  return contract;
}

function getWallet() {
  if (!wallet) initialize();
  return wallet;
}

function getProvider() {
  if (!provider) initialize();
  return provider;
}

// ============================================
// HIGH-LEVEL HELPERS
// ============================================

/**
 * Convert moisture from percentage (e.g., 18.5) to blockchain integer (185)
 */
function moistureToChain(moisturePercent) {
  return Math.round(moisturePercent * 10);
}

/**
 * Convert moisture from blockchain integer (185) to percentage (18.5)
 */
function moistureFromChain(moistureInt) {
  return Number(moistureInt) / 10;
}

/**
 * Record a batch on the blockchain
 */
async function recordBatchOnChain({
  batchId,
  village,
  cooperativeName,
  moisturePercent,
  weightKg,
  harvestDate,
}) {
  const c = getContract();

  logger.info('Recording batch on-chain', { batchId });

  const tx = await c.recordBatch(
    batchId,
    village,
    cooperativeName,
    moistureToChain(moisturePercent),
    Math.round(weightKg),
    harvestDate
  );

  logger.info('Transaction sent', { hash: tx.hash });

  const receipt = await tx.wait();

  logger.info('Transaction confirmed', {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  });

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Read a batch from the blockchain
 */
async function getBatchFromChain(batchId) {
  const c = getContract();

  const exists = await c.batchIdExists(batchId);
  if (!exists) {
    return null;
  }

  const batch = await c.getBatch(batchId);

  return {
    batchId: batch.batchId,
    village: batch.village,
    cooperativeName: batch.cooperativeName,
    moisturePercent: moistureFromChain(batch.moistureContent),
    weightKg: Number(batch.weightKg),
    harvestDate: batch.harvestDate,
    verifiedBy: batch.verifiedBy,
    timestamp: new Date(Number(batch.timestamp) * 1000).toISOString(),
  };
}

/**
 * Check if an address is a registered cooperative
 */
async function isCooperative(address) {
  const c = getContract();
  const role = await c.COOPERATIVE_ROLE();
  return await c.hasRole(role, address);
}

module.exports = {
  initialize,
  getContract,
  getWallet,
  getProvider,
  recordBatchOnChain,
  getBatchFromChain,
  isCooperative,
  moistureToChain,
  moistureFromChain,
};