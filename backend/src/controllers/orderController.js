const prisma = require('../config/db');
const notificationService = require('../services/notificationService');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];
const ORDER_STATUS_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

function parsePositiveInteger(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getOrderScope(req) {
  if (req.user.role === 'ADMIN') return {};
  if (req.user.role === 'BUYER') return { buyerId: req.user.id };
  if (
    req.user.role === 'COOPERATIVE_STAFF'
    && req.cooperativeMembership?.isActive
  ) {
    return { listing: { cooperativeId: req.cooperativeMembership.cooperativeId } };
  }
  return null;
}

async function createOrder(req, res, next) {
  try {
    const { listingId, quantityKg, notes } = req.body;
    const parsedListingId = parsePositiveInteger(listingId);
    const parsedQuantityKg = parsePositiveNumber(quantityKg);

    if (!parsedListingId) {
      return res.status(400).json({ success: false, message: 'listingId must be a positive integer' });
    }
    if (!parsedQuantityKg) {
      return res.status(400).json({ success: false, message: 'quantityKg must be a positive finite number' });
    }
    if (req.user.role !== 'BUYER') {
      return res.status(403).json({ success: false, message: 'Only buyers can create orders' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.listing.updateMany({
        where: {
          id: parsedListingId,
          isAvailable: true,
          quantityKg: { gte: parsedQuantityKg },
        },
        data: { quantityKg: { decrement: parsedQuantityKg } },
      });

      if (reservation.count === 0) {
        const listing = await tx.listing.findUnique({ where: { id: parsedListingId } });
        if (!listing || !listing.isAvailable) {
          return { error: { status: 404, message: 'Listing not available' } };
        }
        return { error: { status: 400, message: 'Not enough quantity available' } };
      }

      let listing = await tx.listing.findUnique({ where: { id: parsedListingId } });
      if (listing.quantityKg === 0) {
        listing = await tx.listing.update({
          where: { id: parsedListingId },
          data: { isAvailable: false },
        });
      }

      const totalPrice = parsedQuantityKg * listing.pricePerKg;
      if (!Number.isFinite(totalPrice)) {
        const error = new Error('Order total is outside the supported range');
        error.status = 400;
        throw error;
      }

      const order = await tx.order.create({
        data: {
          listingId: listing.id,
          buyerId: req.user.id,
          quantityKg: parsedQuantityKg,
          totalPrice,
          notes,
        },
        include: { listing: true },
      });

      await notificationService.notifyCooperativeLeaders({
        client: tx,
        cooperativeId: listing.cooperativeId,
        type: 'ORDER_CREATED',
        title: 'New marketplace order',
        message: `Order #${order.id} was placed for ${parsedQuantityKg} kg of honey.`,
        entityType: 'Order',
        entityId: order.id,
      });

      return { order };
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.status(201).json({ success: true, data: result.order });
  } catch (err) { next(err); }
}

async function listOrders(req, res, next) {
  try {
    const where = getOrderScope(req);
    if (!where) {
      return res.status(403).json({ success: false, message: 'You are not allowed to view orders' });
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
    const id = parsePositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Order id must be a positive integer' });
    }

    const scope = getOrderScope(req);
    if (!scope) {
      return res.status(403).json({ success: false, message: 'You are not allowed to view orders' });
    }

    const order = await prisma.order.findFirst({
      where: { id, ...scope },
      include: {
        listing: { include: { batch: true, cooperative: true } },
        buyer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const id = parsePositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Order id must be a positive integer' });
    }
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    if (
      req.user.role !== 'COOPERATIVE_STAFF'
      || !req.cooperativeMembership?.isActive
    ) {
      return res.status(403).json({
        success: false,
        message: 'An active cooperative membership is required to update orders',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id },
        include: { listing: { select: { id: true, cooperativeId: true } } },
      });
      if (!order) return { error: { status: 404, message: 'Order not found' } };

      if (order.listing.cooperativeId !== req.cooperativeMembership.cooperativeId) {
        return { error: { status: 403, message: 'You cannot update this order' } };
      }

      if (order.status === status) return { order };
      if (!ORDER_STATUS_TRANSITIONS[order.status].includes(status)) {
        return {
          error: {
            status: 400,
            message: `Order cannot move from ${order.status} to ${status}`,
          },
        };
      }

      if (status === 'CANCELLED') {
        await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${order.listing.id} FOR UPDATE`;
        await tx.listing.update({
          where: { id: order.listing.id },
          data: {
            quantityKg: { increment: order.quantityKg },
            isAvailable: true,
          },
        });
      }

      const updated = await tx.order.update({ where: { id }, data: { status } });
      return { order: updated };
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    res.json({ success: true, data: result.order });
  } catch (err) { next(err); }
}

async function listAdminOrders(req, res, next) {
  try {
    const where = {};
    if (req.query.cooperativeId !== undefined) {
      const cooperativeId = parsePositiveInteger(req.query.cooperativeId);
      if (!cooperativeId) {
        return res.status(400).json({
          success: false,
          message: 'cooperativeId must be a positive integer',
        });
      }
      where.listing = { cooperativeId };
    }
    if (req.query.status !== undefined) {
      if (!ORDER_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      where.status = req.query.status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        listing: {
          include: {
            batch: true,
            cooperative: true,
          },
        },
        buyer: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: orders });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createOrder,
  getOrder,
  listAdminOrders,
  listOrders,
  updateOrderStatus,
};
