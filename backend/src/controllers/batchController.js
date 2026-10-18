const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');
const QRCode = require('qrcode');
const env = require('../config/env');

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

    // Validate
    if (!batchId || !village || !harvestDate || !moisturePercent || !weightKg) {
      return res.status(400).json({
        success: false,
        message: 'batchId, village, harvestDate, moisturePercent, weightKg required',
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
      where: { batchId },
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
        batchId,
        village,
        cooperativeName: cooperative.name,
        moisturePercent: parseFloat(moisturePercent),
        weightKg: parseFloat(weightKg),
        harvestDate,
      });
    } catch (err) {
      logger.error('Blockchain write failed', { error: err.message, batchId });
      return res.status(502).json({
        success: false,
        message: 'Failed to record batch on blockchain',
        error: err.message,
      });
    }

    // Save to database
    const batch = await prisma.honeyBatch.create({
      data: {
        batchId,
        cooperativeId: cooperative.id,
        village,
        harvestDate: new Date(harvestDate),
        moistureContent: parseFloat(moisturePercent),
        weightKg: parseFloat(weightKg),
        pricePerKg: pricePerKg ? parseFloat(pricePerKg) : null,
        blockchainTxHash: blockchainResult.txHash,
        createdByUserId: req.user.id,
      },
      include: { cooperative: true },
    });

    logger.info('Batch created', {
      batchId,
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