const prisma = require('../config/db');

function uniqueUserIds(userIds) {
  return [...new Set((userIds || []).filter(
    (userId) => Number.isSafeInteger(userId) && userId > 0
  ))];
}

function notificationData({ type, title, message, entityType, entityId }) {
  if (typeof type !== 'string' || !type) throw new TypeError('Notification type is required');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    throw new TypeError('Notification title is required and must not exceed 200 characters');
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
    throw new TypeError('Notification message is required and must not exceed 2000 characters');
  }

  const hasEntityType = typeof entityType === 'string' && Boolean(entityType.trim());
  const hasEntityId = entityId !== undefined && entityId !== null && String(entityId).trim() !== '';
  if (hasEntityType !== hasEntityId) {
    throw new TypeError('Notification entityType and entityId must be provided together');
  }

  return {
    type,
    title: title.trim(),
    message: message.trim(),
    entityType: hasEntityType ? entityType.trim() : null,
    entityId: hasEntityId ? String(entityId).trim() : null,
  };
}

async function createForUsers({
  userIds,
  type,
  title,
  message,
  entityType,
  entityId,
  client = prisma,
}) {
  const recipients = uniqueUserIds(userIds);
  if (recipients.length === 0) return null;

  const data = notificationData({ type, title, message, entityType, entityId });
  const create = {
    ...data,
    recipients: {
      create: recipients.map((userId) => ({ userId })),
    },
  };

  if (data.entityType && data.entityId) {
    return client.notification.upsert({
      where: {
        type_entityType_entityId: {
          type: data.type,
          entityType: data.entityType,
          entityId: data.entityId,
        },
      },
      create,
      update: {},
      include: { recipients: true },
    });
  }

  return client.notification.create({
    data: create,
    include: { recipients: true },
  });
}

async function notifyActiveAdmins(options) {
  const client = options.client || prisma;
  const admins = await client.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  return createForUsers({
    ...options,
    client,
    userIds: admins.map((admin) => admin.id),
  });
}

async function notifyCooperativeLeaders(options) {
  const client = options.client || prisma;
  const memberships = await client.cooperativeMembership.findMany({
    where: {
      cooperativeId: options.cooperativeId,
      isActive: true,
      role: { in: ['OWNER', 'MANAGER'] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
  return createForUsers({
    ...options,
    client,
    userIds: memberships.map((membership) => membership.userId),
  });
}

module.exports = {
  createForUsers,
  notifyActiveAdmins,
  notifyCooperativeLeaders,
};
