const prisma = require('../config/db');

async function listListings(req, res, next) {
  try {
    const { cooperativeId, minPrice, maxPrice } = req.query;
    const where = { isAvailable: true };
    if (cooperativeId) where.cooperativeId = parseInt(cooperativeId);
    if (minPrice || maxPrice) {
      where.pricePerKg = {};
      if (minPrice) where.pricePerKg.gte = parseFloat(minPrice);
      if (maxPrice) where.pricePerKg.lte = parseFloat(maxPrice);
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        batch: { select: { batchId: true, village: true, moistureContent: true, harvestDate: true } },
        cooperative: { select: { id: true, name: true, village: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: listings, count: listings.length });
  } catch (err) { next(err); }
}

async function getListing(req, res, next) {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { batch: true, cooperative: true },
    });
    if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: listing });
  } catch (err) { next(err); }
}

async function createListing(req, res, next) {
  try {
    const { batchId, quantityKg, pricePerKg, description } = req.body;
    if (!batchId || !quantityKg || !pricePerKg) {
      return res.status(400).json({ success: false, message: 'batchId, quantityKg, pricePerKg required' });
    }

    const batch = await prisma.honeyBatch.findUnique({ where: { id: parseInt(batchId) } });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    if (batch.cooperativeId !== req.user.cooperativeId) {
      return res.status(403).json({ success: false, message: 'Not your batch' });
    }

    const listing = await prisma.listing.create({
      data: {
        batchId: batch.id,
        cooperativeId: batch.cooperativeId,
        quantityKg: parseFloat(quantityKg),
        pricePerKg: parseFloat(pricePerKg),
        description,
      },
      include: { batch: true, cooperative: true },
    });

    res.status(201).json({ success: true, data: listing });
  } catch (err) { next(err); }
}

async function updateListing(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
    if (listing.cooperativeId !== req.user.cooperativeId) {
      return res.status(403).json({ success: false, message: 'Not yours' });
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: req.body,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

module.exports = { listListings, getListing, createListing, updateListing };