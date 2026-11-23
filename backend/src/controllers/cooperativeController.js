const prisma = require('../config/db');

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
  verifiedAt: true,
  commissionPercent: true,
  createdAt: true,
  updatedAt: true,
};

function parseCommissionPercent(value) {
  if (value === undefined) return 0;
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseOptionalWard(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    return { error: 'ward must be a non-empty string of at most 120 characters' };
  }
  return { value: value.trim() };
}

async function listCooperatives(req, res, next) {
  try {
    const coops = await prisma.cooperative.findMany({
      select: {
        ...publicCooperativeSelect,
        _count: { select: { users: true, batches: true } },
      },
    });
    res.json({ success: true, data: coops });
  } catch (err) { next(err); }
}

async function getCooperative(req, res, next) {
  try {
    const coop = await prisma.cooperative.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        ...publicCooperativeSelect,
        users: { select: { id: true, name: true, role: true } },
      },
    });
    if (!coop) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: coop });
  } catch (err) { next(err); }
}

async function getCooperativeStats(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const [batches, listings, orders] = await Promise.all([
      prisma.honeyBatch.count({ where: { cooperativeId: id } }),
      prisma.listing.count({ where: { cooperativeId: id, isAvailable: true } }),
      prisma.order.count({
        where: { listing: { cooperativeId: id } },
      }),
    ]);
    const totalWeight = await prisma.honeyBatch.aggregate({
      where: { cooperativeId: id },
      _sum: { weightKg: true },
    });
    res.json({
      success: true,
      data: {
        totalBatches: batches,
        activeListings: listings,
        totalOrders: orders,
        totalWeightKg: totalWeight._sum.weightKg || 0,
      },
    });
  } catch (err) { next(err); }
}

async function createCooperative(req, res, next) {
  try {
    const {
      name,
      village,
      ward,
      county,
      walletAddress,
      registrationNumber,
      phone,
      commissionPercent,
    } = req.body;
    if (!name || !village || !walletAddress) {
      return res.status(400).json({ success: false, message: 'name, village, walletAddress required' });
    }
    const parsedWard = parseOptionalWard(ward);
    if (parsedWard.error) {
      return res.status(400).json({ success: false, message: parsedWard.error });
    }
    const parsedCommissionPercent = parseCommissionPercent(commissionPercent);
    if (parsedCommissionPercent === null) {
      return res.status(400).json({
        success: false,
        message: 'commissionPercent must be between 0 and 100',
      });
    }
    const coop = await prisma.cooperative.create({
      data: {
        name,
        village,
        ward: parsedWard.value,
        county: county || 'Baringo',
        walletAddress,
        registrationNumber: registrationNumber || null,
        phone: phone || null,
        commissionPercent: parsedCommissionPercent,
        isVerified: false,
        verifiedAt: null,
      },
    });
    res.status(201).json({ success: true, data: coop });
  } catch (err) { next(err); }
}

module.exports = { listCooperatives, getCooperative, getCooperativeStats, createCooperative };
