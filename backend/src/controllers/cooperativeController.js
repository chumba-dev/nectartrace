const prisma = require('../config/db');

async function listCooperatives(req, res, next) {
  try {
    const coops = await prisma.cooperative.findMany({
      include: { _count: { select: { users: true, batches: true } } },
    });
    res.json({ success: true, data: coops });
  } catch (err) { next(err); }
}

async function getCooperative(req, res, next) {
  try {
    const coop = await prisma.cooperative.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { users: { select: { id: true, name: true, role: true } } },
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
    const { name, village, county, walletAddress, registrationNumber, phone } = req.body;
    if (!name || !village || !walletAddress) {
      return res.status(400).json({ success: false, message: 'name, village, walletAddress required' });
    }
    const coop = await prisma.cooperative.create({
      data: { name, village, county: county || 'Baringo', walletAddress, registrationNumber, phone },
    });
    res.status(201).json({ success: true, data: coop });
  } catch (err) { next(err); }
}

module.exports = { listCooperatives, getCooperative, getCooperativeStats, createCooperative };