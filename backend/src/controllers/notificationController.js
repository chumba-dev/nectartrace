const prisma = require('../config/db');

function parsePositiveInteger(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page);
  const limit = query.limit === undefined ? 20 : parsePositiveInteger(query.limit);
  if (!page || !limit || limit > 100) return null;
  return { page, limit };
}

function publicNotification(recipient) {
  return {
    id: recipient.notification.id,
    type: recipient.notification.type,
    title: recipient.notification.title,
    message: recipient.notification.message,
    entityType: recipient.notification.entityType ?? null,
    entityId: recipient.notification.entityId ?? null,
    createdAt: recipient.notification.createdAt,
    readAt: recipient.readAt ?? null,
  };
}

async function listNotifications(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: 'page and limit must be positive integers, and limit must not exceed 100',
      });
    }
    const { page, limit } = pagination;
    const where = { userId: req.user.id };
    const [recipients, total] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where,
        select: {
          readAt: true,
          notification: {
            select: {
              id: true,
              type: true,
              title: true,
              message: true,
              entityType: true,
              entityId: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notificationRecipient.count({ where }),
    ]);

    return res.json({
      success: true,
      data: recipients.map(publicNotification),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await prisma.notificationRecipient.count({
      where: { userId: req.user.id, readAt: null },
    });
    return res.json({ success: true, data: { count } });
  } catch (err) {
    return next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notificationId = parsePositiveInteger(req.params.id);
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification id must be a positive integer',
      });
    }
    const readAt = new Date();
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        notificationId,
        userId: req.user.id,
        readAt: null,
      },
      data: { readAt },
    });
    if (result.count === 0) {
      const recipient = await prisma.notificationRecipient.findUnique({
        where: {
          notificationId_userId: { notificationId, userId: req.user.id },
        },
        select: { readAt: true },
      });
      if (!recipient) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }
      return res.json({
        success: true,
        data: { notificationId, readAt: recipient.readAt },
      });
    }
    return res.json({ success: true, data: { notificationId, readAt } });
  } catch (err) {
    return next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const readAt = new Date();
    const result = await prisma.notificationRecipient.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt },
    });
    return res.json({
      success: true,
      data: { updatedCount: result.count, readAt },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
};
