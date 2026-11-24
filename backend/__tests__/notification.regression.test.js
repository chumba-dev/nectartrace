const mockPrisma = {
  notification: {
    create: jest.fn(),
    upsert: jest.fn(),
  },
  notificationRecipient: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findMany: jest.fn() },
  cooperativeMembership: { findMany: jest.fn() },
};

jest.mock('../src/config/db', () => mockPrisma);

const notificationService = require('../src/services/notificationService');
const {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} = require('../src/controllers/notificationController');

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.notification.upsert.mockResolvedValue({ id: 1, recipients: [] });
});

test('event notifications deduplicate recipients and use the event identity upsert key', async () => {
  const input = {
    userIds: [4, 4, 9],
    type: 'ORDER_CREATED',
    title: 'New order',
    message: 'Order #31 was created.',
    entityType: 'Order',
    entityId: 31,
  };

  await notificationService.createForUsers(input);
  await notificationService.createForUsers(input);

  expect(mockPrisma.notification.upsert).toHaveBeenCalledTimes(2);
  expect(mockPrisma.notification.upsert).toHaveBeenCalledWith({
    where: {
      type_entityType_entityId: {
        type: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: '31',
      },
    },
    create: expect.objectContaining({
      recipients: { create: [{ userId: 4 }, { userId: 9 }] },
    }),
    update: {},
    include: { recipients: true },
  });
  expect(mockPrisma.notification.create).not.toHaveBeenCalled();
});

test('admin and cooperative leader helpers select only active intended recipients', async () => {
  mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  mockPrisma.cooperativeMembership.findMany.mockResolvedValue([{ userId: 7 }]);

  await notificationService.notifyActiveAdmins({
    type: 'COOPERATIVE_APPLICATION_SUBMITTED',
    title: 'Application',
    message: 'Review it.',
    entityType: 'CooperativeApplication',
    entityId: 5,
  });
  await notificationService.notifyCooperativeLeaders({
    cooperativeId: 3,
    type: 'HARVEST_OFFER_SUBMITTED',
    title: 'Offer',
    message: 'Review it.',
    entityType: 'Offer',
    entityId: 8,
  });

  expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  expect(mockPrisma.cooperativeMembership.findMany).toHaveBeenCalledWith({
    where: {
      cooperativeId: 3,
      isActive: true,
      role: { in: ['OWNER', 'MANAGER'] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
});

test('lists only the authenticated recipient notifications and reports unread count', async () => {
  const createdAt = new Date('2026-11-24T12:00:00Z');
  mockPrisma.notificationRecipient.findMany.mockResolvedValue([{
    readAt: null,
    notification: {
      id: 11,
      type: 'ORDER_CREATED',
      title: 'New order',
      message: 'Order #31 was created.',
      entityType: 'Order',
      entityId: '31',
      createdAt,
    },
  }]);
  mockPrisma.notificationRecipient.count
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(1);
  const listRes = response();

  await listNotifications(
    { user: { id: 7 }, query: { page: '1', limit: '20' } },
    listRes,
    jest.fn()
  );
  const unreadRes = response();
  await getUnreadCount({ user: { id: 7 } }, unreadRes, jest.fn());

  expect(mockPrisma.notificationRecipient.findMany.mock.calls[0][0].where).toEqual({ userId: 7 });
  expect(listRes.json.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({
    id: 11,
    readAt: null,
  }));
  expect(mockPrisma.notificationRecipient.count).toHaveBeenLastCalledWith({
    where: { userId: 7, readAt: null },
  });
  expect(unreadRes.json).toHaveBeenCalledWith({ success: true, data: { count: 1 } });
});

test('read operations enforce recipient ownership and read-all scopes to the current user', async () => {
  mockPrisma.notificationRecipient.updateMany
    .mockResolvedValueOnce({ count: 0 })
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 3 });
  mockPrisma.notificationRecipient.findUnique.mockResolvedValue(null);
  const denied = response();

  await markRead(
    { params: { id: '11' }, user: { id: 7 } },
    denied,
    jest.fn()
  );
  expect(denied.status).toHaveBeenCalledWith(404);
  expect(mockPrisma.notificationRecipient.findUnique).toHaveBeenCalledWith({
    where: { notificationId_userId: { notificationId: 11, userId: 7 } },
    select: { readAt: true },
  });

  const owned = response();
  await markRead(
    { params: { id: '12' }, user: { id: 7 } },
    owned,
    jest.fn()
  );
  expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenNthCalledWith(2, {
    where: { notificationId: 12, userId: 7, readAt: null },
    data: { readAt: expect.any(Date) },
  });

  const all = response();
  await markAllRead({ user: { id: 7 } }, all, jest.fn());
  expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenNthCalledWith(3, {
    where: { userId: 7, readAt: null },
    data: { readAt: expect.any(Date) },
  });
  expect(all.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ updatedCount: 3 }),
  }));
});
