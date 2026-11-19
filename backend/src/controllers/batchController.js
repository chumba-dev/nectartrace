const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');
const QRCode = require('qrcode');
const env = require('../config/env');

const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;
const MOISTURE_PATTERN = /^\d+(?:\.\d)?$/;

function parseHarvestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  return value <= today ? date : null;
}

// POST /api/batches
// Staff only — records batch in DB + blockchain
async function createBatch(req, res, next) {
  try {
    const {
      batchId,
      village,
      harvestDate,
      moisturePercent,
      weightKg,
      pricePerKg,
    } = req.body;

    const normalizedBatchId = typeof batchId === 'string' ? batchId.trim() : '';
    const normalizedVillage = typeof village === 'string' ? village.trim() : '';
    const parsedHarvestDate = parseHarvestDate(harvestDate);
    const moistureText = String(moisturePercent ?? '').trim();
    const parsedMoisture = Number(moistureText);
    const parsedWeight = Number(weightKg);
    const hasPrice = pricePerKg !== undefined
      && pricePerKg !== null
      && String(pricePerKg).trim() !== '';
    const parsedPrice = hasPrice ? Number(pricePerKg) : null;

    if (!BATCH_ID_PATTERN.test(normalizedBatchId)) {
      return res.status(400).json({
        success: false,
        message: 'batchId must match BAR-YYYY-NNN exactly',
      });
    }
    if (!normalizedVillage || normalizedVillage.length > 120) {
      return res.status(400).json({
        success: false,
        message: 'village is required and must not exceed 120 characters',
      });
    }
    if (!parsedHarvestDate) {
      return res.status(400).json({
        success: false,
        message: 'harvestDate must be a valid date that is not in the future',
      });
    }
    if (
      !MOISTURE_PATTERN.test(moistureText)
      || !Number.isFinite(parsedMoisture)
      || parsedMoisture <= 0
      || parsedMoisture >= 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'moisturePercent must be greater than 0 and less than 100 with at most one decimal place',
      });
    }
    if (!Number.isInteger(parsedWeight) || parsedWeight < 1) {
      return res.status(400).json({
        success: false,
        message: 'weightKg must be a whole number of kilograms and at least 1',
      });
    }
    if (hasPrice && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'pricePerKg must be greater than 0 when supplied',
      });
    }

    // Check user has a cooperative
    if (!req.user.cooperativeId) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not linked to a cooperative. Ask your admin to assign you.',
        code: 'NO_COOPERATIVE',
      });
    }

    // Get cooperative
    const cooperative = await prisma.cooperative.findUnique({
      where: { id: req.user.cooperativeId },
    });

    if (!cooperative) {
      return res.status(404).json({
        success: false,
        message: 'Cooperative not found',
      });
    }

    // Check batch doesn't exist
    const existing = await prisma.honeyBatch.findUnique({
      where: { batchId: normalizedBatchId },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Batch ID already exists',
      });
    }

    // Write to blockchain first
    let blockchainResult;
    try {
      blockchainResult = await blockchain.recordBatchOnChain({
        batchId: normalizedBatchId,
        village: normalizedVillage,
        cooperativeName: cooperative.name,
        moisturePercent: parsedMoisture,
        weightKg: parsedWeight,
        harvestDate,
      });
    } catch (err) {
      logger.error('Blockchain write failed', { error: err.message, batchId: normalizedBatchId });
      return res.status(502).json({
        success: false,
        message: 'Failed to record batch on blockchain',
      });
    }

    // Save to database
    const batch = await prisma.honeyBatch.create({
      data: {
        batchId: normalizedBatchId,
        cooperativeId: cooperative.id,
        village: normalizedVillage,
        harvestDate: parsedHarvestDate,
        moistureContent: parsedMoisture,
        weightKg: parsedWeight,
        pricePerKg: parsedPrice,
        blockchainTxHash: blockchainResult.txHash,
        createdByUserId: req.user.id,
      },
      include: { cooperative: true },
    });

    logger.info('Batch created', {
      batchId: normalizedBatchId,
      txHash: blockchainResult.txHash,
    });

    res.status(201).json({
      success: true,
      message: 'Batch recorded on blockchain and saved',
      data: {
        batch,
        blockchain: blockchainResult,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/batches
async function listBatches(req, res, next) {
  try {
    const { status, cooperativeId, village } = req.query;

    const where = {};
    if (status) where.status = status;
    if (cooperativeId) where.cooperativeId = parseInt(cooperativeId);
    if (village) where.village = village;

    const batches = await prisma.honeyBatch.findMany({
      where,
      include: {
        cooperative: {
          select: { id: true, name: true, village: true, walletAddress: true },
        },
        listings: {
          where: { isAvailable: true },
          select: { id: true, quantityKg: true, pricePerKg: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: batches,
      count: batches.length,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/batches/:batchId
async function getBatch(req, res, next) {
  try {
    const { batchId } = req.params;

    const batch = await prisma.honeyBatch.findUnique({
      where: { batchId },
      include: {
        cooperative: true,
        listings: true,
      },
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    res.json({
      success: true,
      data: batch,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/batches/:batchId/verify
// Reads directly from blockchain — independent of DB
async function verifyBatch(req, res, next) {
  try {
    const { batchId } = req.params;

    const onChain = await blockchain.getBatchFromChain(batchId);

    if (!onChain) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found on blockchain',
        verified: false,
      });
    }

    res.json({
      success: true,
      verified: true,
      data: onChain,
      message: 'Batch verified on blockchain',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/batches/my
async function getMyBatches(req, res, next) {
  try {
    if (!req.user.cooperativeId) {
      return res.json({ success: true, data: [], count: 0 });
    }

    const batches = await prisma.honeyBatch.findMany({
      where: { cooperativeId: req.user.cooperativeId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: batches,
      count: batches.length,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/batches/:batchId/status
async function updateStatus(req, res, next) {
  try {
    const { batchId } = req.params;
    const { status } = req.body;

    if (!['AVAILABLE', 'RESERVED', 'SOLD'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Use AVAILABLE, RESERVED, or SOLD',
      });
    }

    const batch = await prisma.honeyBatch.findUnique({ where: { batchId } });
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    if (batch.cooperativeId !== req.user.cooperativeId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your cooperative\'s batches',
      });
    }

    const updated = await prisma.honeyBatch.update({
      where: { batchId },
      data: { status },
    });

    res.json({
      success: true,
      message: 'Batch status updated',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBatch,
  listBatches,
  getBatch,
  verifyBatch,
  getMyBatches,
  updateStatus,
  getBatchQR,
};


// GET /api/batches/:batchId/qr
async function getBatchQR(req, res, next) {
  try {
    const { batchId } = req.params;

    // Verify batch exists
    const batch = await prisma.honeyBatch.findUnique({
      where: { batchId },
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    // Generate QR pointing to frontend verify page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify?batchId=${batchId}`;

    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0D0D0D',
        light: '#F5F0E8',
      },
    });

    res.json({
      success: true,
      data: {
        batchId,
        verifyUrl,
        qrDataUrl,
      },
    });
  } catch (err) {
    next(err);
  }
}
