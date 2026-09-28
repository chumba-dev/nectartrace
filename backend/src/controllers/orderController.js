const prisma = require('../config/db');

async function createOrder(req, res, next) {
  try {
    const { listingId, quantityKg, notes } = req.body;
    if (!listingId || !quantityKg) {
      return res.status(400).json({ success: false, message: 'listingId and quantityKg required' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: parseInt(listingId) },
    });
    if (!listing || !listing.isAvailable) {
      return res.status(404).json({ success: false, message: 'Listing not available' });
    }
    if (quantityKg > listing.quantityKg) {
      return res.status(400).json({ success: false, message: 'Not enough quantity available' });
    }

    const totalPrice = quantityKg * listing.pricePerKg;

    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: req.user.id,
        quantityKg: parseFloat(quantityKg),
        totalPrice,
        notes,
      },
      include: { listing: true },
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
}

async function listOrders(req, res, next) {
  try {
    const where = {};
    if (req.user.role === 'BUYER') {
      where.buyerId = req.user.id;
    } else if (req.user.role === 'COOPERATIVE_STAFF') {
      where.listing = { cooperativeId: req.user.cooperativeId };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        listing: { include: { batch: true, cooperative: true } },
        buyer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
}

async function getOrder(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { listing: true, buyer: { select: { id: true, name: true, phone: true } } },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updated = await prisma.order.update({
      where: { id: parseInt(req.params.id) },
      data: { status },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

module.exports = { createOrder, listOrders, getOrder, updateOrderStatus };