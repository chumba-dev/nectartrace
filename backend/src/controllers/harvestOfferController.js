const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');
const { validateBatchInput } = require('../utils/batchValidation');

const offerInclude = {
  farmer: {
    select: { id: true, name: true, phone: true, email: true },
  },
  cooperative: true,
  batch: true,
  settlement: true,
};

function parsePositiveInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function canManageOffer(user, offer) {
  return user.role === 'ADMIN'
    || (Boolean(user.cooperativeId) && user.cooperativeId === offer.cooperativeId);
}

function parseFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonnegativeMoney(value) {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getDeliveredSales(offer) {
  if (!offer.honeyBatchId) {
    return { deliveredSalesAmount: 0, deliveredSalesQuantityKg: 0 };
  }

  const result = await prisma.order.aggregate({
    where: {
      status: 'DELIVERED',
      listing: { batchId: offer.honeyBatchId },
    },
    _sum: { totalPrice: true, quantityKg: true },
  });

  return {
    deliveredSalesAmount: roundMoney(result._sum.totalPrice || 0),
    deliveredSalesQuantityKg: result._sum.quantityKg || 0,
  };
}

async function withDeliveredSales(offer) {
  if (!offer || offer.settlementType !== 'CONSIGNMENT') return offer;
  return { ...offer, ...(await getDeliveredSales(offer)) };
}

async function listOffers(req, res, next) {
  try {
    const where = {};
    if (req.user.role === 'COOPERATIVE_STAFF') {
      if (!req.user.cooperativeId) {
        return res.status(403).json({
          success: false,
          message: 'Your account is not linked to a cooperative',
          code: 'NO_COOPERATIVE',
        });
      }
      where.cooperativeId = req.user.cooperativeId;
    } else if (req.query.cooperativeId !== undefined) {
      const cooperativeId = parsePositiveInteger(req.query.cooperativeId);
      if (!cooperativeId) {
        return res.status(400).json({
          success: false,
          message: 'cooperativeId must be a positive integer',
        });
      }
      where.cooperativeId = cooperativeId;
    }

    const offers = await prisma.harvestOffer.findMany({
      where,
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });

    const offersWithSales = await Promise.all(offers.map(withDeliveredSales));
    res.json({ success: true, data: offersWithSales, count: offersWithSales.length });
  } catch (err) {
    next(err);
  }
}

async function listMyOffers(req, res, next) {
  try {
    const offers = await prisma.harvestOffer.findMany({
      where: { farmerId: req.user.id },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });

    const offersWithSales = await Promise.all(offers.map(withDeliveredSales));
    res.json({ success: true, data: offersWithSales, count: offersWithSales.length });
  } catch (err) {
    next(err);
  }
}

async function updateOfferStatus(req, res, next) {
  try {
    const offerId = parsePositiveInteger(req.params.id);
    if (!offerId) {
      return res.status(400).json({ success: false, message: 'Offer ID must be a positive integer' });
    }

    const { status } = req.body;
    if (!['ACCEPTED', 'REJECTED', 'RECEIVED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be ACCEPTED, REJECTED, or RECEIVED',
      });
    }

    const offer = await prisma.harvestOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Harvest offer not found' });
    }
    if (!canManageOffer(req.user, offer)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage offers for your cooperative',
      });
    }

    const allowedTransitions = {
      SUBMITTED: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['RECEIVED', 'REJECTED'],
    };
    if (!allowedTransitions[offer.status]?.includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change an offer from ${offer.status} to ${status}`,
      });
    }

    const data = { status };
    if (status === 'ACCEPTED') {
      const acceptedWeightKg = parseFiniteNumber(req.body.acceptedWeightKg);
      const agreedPricePerKg = parseFiniteNumber(req.body.agreedPricePerKg);
      if (
        acceptedWeightKg === null
        || acceptedWeightKg <= 0
        || agreedPricePerKg === null
        || agreedPricePerKg <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'acceptedWeightKg and agreedPricePerKg must be positive numbers',
        });
      }
      data.acceptedWeightKg = acceptedWeightKg;
      data.agreedPricePerKg = agreedPricePerKg;
      data.rejectionReason = null;
    }

    if (status === 'REJECTED') {
      const rejectionReason = typeof req.body.rejectionReason === 'string'
        ? req.body.rejectionReason.trim()
        : '';
      if (!rejectionReason || rejectionReason.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'rejectionReason is required and must not exceed 500 characters',
        });
      }
      data.rejectionReason = rejectionReason;
    }

    const result = await prisma.harvestOffer.updateMany({
      where: { id: offerId, status: offer.status },
      data,
    });
    if (result.count !== 1) {
      return res.status(409).json({
        success: false,
        message: 'Offer status changed before this request completed',
      });
    }

    const updatedOffer = await prisma.harvestOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    res.json({
      success: true,
      message: 'Harvest offer status updated',
      data: await withDeliveredSales(updatedOffer),
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOffer(req, res, next) {
  try {
    const offerId = parsePositiveInteger(req.params.id);
    if (!offerId) {
      return res.status(400).json({ success: false, message: 'Offer ID must be a positive integer' });
    }

    const offer = await prisma.harvestOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Harvest offer not found' });
    }
    if (!canManageOffer(req.user, offer)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage offers for your cooperative',
      });
    }
    if (offer.status !== 'RECEIVED') {
      return res.status(409).json({
        success: false,
        message: 'Only received offers can be verified',
      });
    }

    const validation = validateBatchInput(req.body);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }
    const batchInput = validation.value;

    const existingBatch = await prisma.honeyBatch.findUnique({
      where: { batchId: batchInput.batchId },
    });
    if (existingBatch) {
      return res.status(409).json({ success: false, message: 'Batch ID already exists' });
    }

    let blockchainResult;
    try {
      blockchainResult = await blockchain.recordBatchOnChain({
        batchId: batchInput.batchId,
        village: batchInput.village,
        cooperativeName: offer.cooperative.name,
        moisturePercent: batchInput.moisturePercent,
        weightKg: batchInput.weightKg,
        harvestDate: batchInput.harvestDateText,
      });
    } catch (err) {
      logger.error('Offer verification blockchain write failed', {
        offerId,
        batchId: batchInput.batchId,
      });
      return res.status(502).json({
        success: false,
        message: 'Failed to record batch on blockchain',
      });
    }

    let verifiedOffer;
    try {
      verifiedOffer = await prisma.harvestOffer.update({
        where: { id: offerId, status: 'RECEIVED', honeyBatchId: null },
        data: {
          status: 'VERIFIED',
          batch: {
            create: {
              batchId: batchInput.batchId,
              cooperative: { connect: { id: offer.cooperativeId } },
              village: batchInput.village,
              harvestDate: batchInput.harvestDate,
              moistureContent: batchInput.moisturePercent,
              weightKg: batchInput.weightKg,
              pricePerKg: batchInput.pricePerKg,
              blockchainTxHash: blockchainResult.txHash,
              createdByUserId: req.user.id,
            },
          },
        },
        include: offerInclude,
      });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ success: false, message: 'Batch ID or transaction already exists' });
      }
      if (err.code === 'P2025') {
        return res.status(409).json({
          success: false,
          message: 'Offer status changed before verification completed',
        });
      }
      throw err;
    }

    res.status(201).json({
      success: true,
      message: 'Harvest offer verified and batch recorded',
      data: {
        offer: verifiedOffer,
        batch: verifiedOffer.batch,
        blockchain: blockchainResult,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function upsertSettlement(req, res, next) {
  try {
    const offerId = parsePositiveInteger(req.params.id);
    if (!offerId) {
      return res.status(400).json({ success: false, message: 'Offer ID must be a positive integer' });
    }

    const offer = await prisma.harvestOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Harvest offer not found' });
    }
    if (!canManageOffer(req.user, offer)) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage offers for your cooperative',
      });
    }

    const directPurchaseStates = ['ACCEPTED', 'RECEIVED', 'VERIFIED'];
    const canSettle = offer.settlementType === 'DIRECT_PURCHASE'
      ? directPurchaseStates.includes(offer.status)
      : offer.status === 'VERIFIED';
    if (!canSettle) {
      return res.status(409).json({
        success: false,
        message: offer.settlementType === 'CONSIGNMENT'
          ? 'Consignment settlement can only begin after verification'
          : 'Direct-purchase settlement can only begin after acceptance',
      });
    }

    let grossAmount;
    if (offer.settlementType === 'CONSIGNMENT') {
      const deliveredSales = await getDeliveredSales(offer);
      if (deliveredSales.deliveredSalesAmount <= 0) {
        return res.status(409).json({
          success: false,
          message: 'Consignment settlement requires at least one delivered marketplace order',
        });
      }
      grossAmount = deliveredSales.deliveredSalesAmount;
      if (req.body.grossAmount !== undefined) {
        const requestedGross = parseNonnegativeMoney(req.body.grossAmount);
        if (requestedGross === null || Math.abs(requestedGross - grossAmount) > 0.009) {
          return res.status(400).json({
            success: false,
            message: 'grossAmount must match delivered marketplace sales',
          });
        }
      }
    } else {
      grossAmount = roundMoney(
        Number(offer.acceptedWeightKg) * Number(offer.agreedPricePerKg)
      );
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        return res.status(409).json({
          success: false,
          message: 'Direct-purchase settlement requires accepted weight and agreed price',
        });
      }
      if (req.body.grossAmount !== undefined) {
        const requestedGross = parseNonnegativeMoney(req.body.grossAmount);
        if (requestedGross === null || Math.abs(requestedGross - grossAmount) > 0.009) {
          return res.status(400).json({
            success: false,
            message: 'grossAmount must match the accepted weight and agreed price',
          });
        }
      }
    }

    const commissionSource = req.body.commissionAmount ?? offer.settlement?.commissionAmount ?? 0;
    const paidSource = req.body.amountPaid ?? offer.settlement?.amountPaid ?? 0;
    const commissionAmount = parseNonnegativeMoney(commissionSource);
    const amountPaid = parseNonnegativeMoney(paidSource);

    if (commissionAmount === null || amountPaid === null) {
      return res.status(400).json({
        success: false,
        message: 'commissionAmount and amountPaid must be nonnegative finite numbers',
      });
    }
    if (commissionAmount > grossAmount) {
      return res.status(400).json({
        success: false,
        message: 'commissionAmount cannot exceed grossAmount',
      });
    }
    if (offer.settlementType === 'DIRECT_PURCHASE' && commissionAmount !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Direct-purchase settlements cannot deduct a commission',
      });
    }

    const netAmount = roundMoney(grossAmount - commissionAmount);
    if (amountPaid - netAmount > 0.009) {
      return res.status(400).json({
        success: false,
        message: 'amountPaid cannot exceed netAmount',
      });
    }

    const paymentReference = req.body.paymentReference === undefined
      ? offer.settlement?.paymentReference ?? null
      : typeof req.body.paymentReference === 'string'
        ? req.body.paymentReference.trim() || null
        : undefined;
    if (paymentReference === undefined || (paymentReference && paymentReference.length > 120)) {
      return res.status(400).json({
        success: false,
        message: 'paymentReference must be a string of at most 120 characters',
      });
    }

    const normalizedAmountPaid = roundMoney(amountPaid);
    const status = Math.abs(normalizedAmountPaid - netAmount) <= 0.009
      ? 'PAID'
      : normalizedAmountPaid > 0
        ? 'PARTIALLY_PAID'
        : 'PENDING';
    const paidAt = status === 'PAID' ? offer.settlement?.paidAt ?? new Date() : null;
    const settlementData = {
      farmerId: offer.farmerId,
      cooperativeId: offer.cooperativeId,
      type: offer.settlementType,
      grossAmount,
      commissionAmount,
      netAmount,
      amountPaid: normalizedAmountPaid,
      status,
      paymentReference,
      paidAt,
    };

    await prisma.farmerSettlement.upsert({
      where: { offerId },
      create: { offerId, ...settlementData },
      update: settlementData,
    });

    const updatedOffer = await prisma.harvestOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    res.json({
      success: true,
      message: 'Farmer settlement saved',
      data: await withDeliveredSales(updatedOffer),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOffers,
  listMyOffers,
  updateOfferStatus,
  verifyOffer,
  upsertSettlement,
};
