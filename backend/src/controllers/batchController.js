const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');
const Offer = require('../models/Offer');
const { randomUUID } = require('crypto');
const { Types } = require('mongoose');
const QRCode = require('qrcode');
const { validateBatchInput } = require('../utils/batchValidation');
const { computeLotIdsHash } = require('../utils/lotIdsHash');

const publicCooperativeSelect = {
  id: true,
  name: true,
  village: true,
  ward: true,
  county: true,
  walletAddress: true,
  registrationNumber: true,
  phone: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
};

function parsePositiveInteger(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toPlainOffer(document) {
  return typeof document?.toObject === 'function'
    ? document.toObject({ virtuals: false, versionKey: false })
    : document;
}

function updatedCount(result) {
  return result?.modifiedCount ?? result?.nModified ?? result?.matchedCount ?? 0;
}

async function releaseReservation(batchReservationToken, expectedCount) {
  const result = await Offer.updateMany({ batchReservationToken }, {
    $set: { batchId: null, batchReservationToken: null },
  }, { runValidators: true });
  if (updatedCount(result) !== expectedCount) {
    throw new Error('Reservation release count mismatch');
  }
}

async function resolveBatchCooperative(req) {
  let cooperativeId;
  const requestedCooperativeId = req.body.cooperativeId === undefined
    ? null
    : parsePositiveInteger(req.body.cooperativeId);

  if (req.user.role === 'ADMIN') {
    if (!requestedCooperativeId) {
      return {
        error: {
          status: 400,
          message: 'ADMIN batch creation requires a positive cooperativeId',
          code: 'COOPERATIVE_REQUIRED',
        },
      };
    }
    cooperativeId = requestedCooperativeId;
  } else {
    if (!req.user.cooperativeId) {
      return {
        error: {
          status: 403,
          message: 'Your account is not linked to a cooperative. Ask your admin to assign you.',
          code: 'NO_COOPERATIVE',
        },
      };
    }
    if (req.body.cooperativeId !== undefined && requestedCooperativeId !== req.user.cooperativeId) {
      return {
        error: {
          status: 403,
          message: 'You can only create batches for your cooperative',
          code: 'COOPERATIVE_SCOPE_DENIED',
        },
      };
    }
    cooperativeId = req.user.cooperativeId;
  }

  const cooperative = await prisma.cooperative.findUnique({
    where: { id: cooperativeId },
  });
  if (!cooperative) {
    return { error: { status: 404, message: 'Cooperative not found' } };
  }
  if (!cooperative.isVerified) {
    return {
      error: {
        status: 403,
        message: 'A verified cooperative is required to create a batch',
        code: 'COOPERATIVE_NOT_VERIFIED',
      },
    };
  }
  return { cooperative };
}

// POST /api/batches
// Records one aggregate batch commitment for verified, measured Mongo offers.
async function createBatch(req, res, next) {
  try {
    const validation = validateBatchInput(req.body);
    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }
    const {
      batchId: normalizedBatchId,
      village: normalizedVillage,
      harvestDate: parsedHarvestDate,
      harvestDateText,
      pricePerKg: parsedPrice,
      offerIds,
    } = validation.value;

    const cooperativeResult = await resolveBatchCooperative(req);
    if (cooperativeResult.error) {
      return res.status(cooperativeResult.error.status).json({
        success: false,
        message: cooperativeResult.error.message,
        ...(cooperativeResult.error.code && { code: cooperativeResult.error.code }),
      });
    }
    const { cooperative } = cooperativeResult;

    const existing = await prisma.honeyBatch.findUnique({
      where: { batchId: normalizedBatchId },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Batch ID already exists',
      });
    }

    const objectIds = offerIds.map((id) => new Types.ObjectId(id));
    const documents = await Offer.find({ _id: { $in: objectIds } });
    const offersById = new Map(documents.map((document) => {
      const offer = toPlainOffer(document);
      return [String(offer._id ?? offer.id).toLowerCase(), offer];
    }));
    if (offersById.size !== offerIds.length || offerIds.some((id) => !offersById.has(id))) {
      return res.status(404).json({
        success: false,
        message: 'One or more requested offers were not found',
        code: 'OFFERS_NOT_FOUND',
      });
    }

    const sortedOfferIds = [...offerIds].sort();
    const offers = sortedOfferIds.map((id) => offersById.get(id));
    if (offers.some((offer) => offer.cooperativeId !== cooperative.id)) {
      return res.status(403).json({
        success: false,
        message: 'All offers must belong to the selected cooperative',
        code: 'OFFER_SCOPE_DENIED',
      });
    }
    if (offers.some((offer) => offer.status !== 'verified')) {
      return res.status(409).json({
        success: false,
        message: 'All offers must have verified status',
        code: 'OFFERS_NOT_VERIFIED',
      });
    }
    if (offers.some((offer) => (
      !Number.isFinite(offer.weighedKg)
      || offer.weighedKg <= 0
      || !Number.isFinite(offer.moisturePercent)
      || offer.moisturePercent <= 0
      || offer.moisturePercent >= 100
    ))) {
      return res.status(409).json({
        success: false,
        message: 'All offers must have positive measured weight and moisture',
        code: 'OFFER_MEASUREMENTS_REQUIRED',
      });
    }
    if (offers.some((offer) => offer.batchId !== null)) {
      return res.status(409).json({
        success: false,
        message: 'One or more offers already belong to a batch',
        code: 'OFFERS_ALREADY_BATCHED',
      });
    }

    const weightKg = offers.reduce((sum, offer) => sum + offer.weighedKg, 0);
    const weightedMoistureTotal = offers.reduce(
      (sum, offer) => sum + (offer.weighedKg * offer.moisturePercent),
      0
    );
    const weightGrams = Math.round(weightKg * 1000);
    const moisturePercent = weightedMoistureTotal / weightKg;
    if (
      !Number.isFinite(weightKg)
      || weightKg <= 0
      || !Number.isSafeInteger(weightGrams)
      || weightGrams <= 0
      || !Number.isFinite(moisturePercent)
      || moisturePercent <= 0
      || moisturePercent >= 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Offer measurements cannot be represented safely as a batch',
        code: 'UNSAFE_BATCH_MEASUREMENTS',
      });
    }
    const lotIdsHash = computeLotIdsHash(sortedOfferIds);
    const batchReservationToken = randomUUID();
    const reservation = await Offer.updateMany({
      _id: { $in: objectIds },
      cooperativeId: cooperative.id,
      status: 'verified',
      batchId: null,
      weighedKg: { $gt: 0 },
      moisturePercent: { $gt: 0, $lt: 100 },
    }, {
      $set: {
        batchId: normalizedBatchId,
        batchReservationToken,
      },
    }, { runValidators: true });

    const reservationCount = updatedCount(reservation);
    if (reservationCount !== offerIds.length) {
      try {
        await releaseReservation(batchReservationToken, reservationCount);
      } catch (err) {
        logger.error('Batch reservation rollback failed', { batchId: normalizedBatchId });
        return res.status(500).json({
          success: false,
          message: 'Batch reservation requires reconciliation',
          code: 'BATCH_RECONCILIATION_REQUIRED',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'One or more offers changed before they could be reserved',
        code: 'OFFER_RESERVATION_CONFLICT',
      });
    }

    let blockchainResult;
    try {
      blockchainResult = await blockchain.recordBatchOnChain({
        batchId: normalizedBatchId,
        village: normalizedVillage,
        cooperativeName: cooperative.name,
        moisturePercent,
        weightGrams,
        harvestDate: harvestDateText,
        lotIdsHash,
      });
    } catch (err) {
      try {
        await releaseReservation(batchReservationToken, reservationCount);
      } catch (releaseErr) {
        logger.error('Chain failure reservation release failed', { batchId: normalizedBatchId });
        return res.status(500).json({
          success: false,
          message: 'Batch reservation requires reconciliation',
          code: 'BATCH_RECONCILIATION_REQUIRED',
        });
      }
      logger.error('Blockchain batch write failed', { batchId: normalizedBatchId });
      return res.status(502).json({
        success: false,
        message: 'Failed to record batch on blockchain',
      });
    }

    let batch;
    try {
      batch = await prisma.honeyBatch.create({
        data: {
          batchId: normalizedBatchId,
          cooperativeId: cooperative.id,
          village: normalizedVillage,
          harvestDate: parsedHarvestDate,
          moistureContent: moisturePercent,
          weightKg,
          pricePerKg: parsedPrice,
          blockchainTxHash: blockchainResult.txHash,
          lotIdsHash,
          createdByUserId: req.user.id,
        },
        include: { cooperative: true },
      });
    } catch (err) {
      logger.error('Confirmed chain batch was not persisted in PostgreSQL', {
        batchId: normalizedBatchId,
        txHash: blockchainResult.txHash,
      });
      return res.status(500).json({
        success: false,
        message: 'Blockchain confirmed the batch, but database reconciliation is required',
        code: 'BATCH_RECONCILIATION_REQUIRED',
        data: {
          batchId: normalizedBatchId,
          blockchainTxHash: blockchainResult.txHash,
          lotIdsHash,
        },
      });
    }

    try {
      await Offer.updateMany({
        batchId: normalizedBatchId,
        batchReservationToken,
      }, {
        $set: { batchReservationToken: null },
      }, { runValidators: true });
    } catch (err) {
      logger.warn('Batch reservation token cleanup failed', { batchId: normalizedBatchId });
    }

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
        cooperative: { select: publicCooperativeSelect },
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
  const { batchId } = req.params;
  try {
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
    logger.error('Public blockchain batch read failed', { batchId });
    return res.status(502).json({
      success: false,
      verified: false,
      message: 'Blockchain verification is temporarily unavailable',
    });
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
