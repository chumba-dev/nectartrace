const mockPrisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  cooperative: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  cooperativeApplication: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  cooperativeMembership: {
    create: jest.fn(),
  },
};
const mockAddCooperativeOnChain = jest.fn();
const mockNotifyActiveAdmins = jest.fn();
const mockCreateForUsers = jest.fn();

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/config/blockchain', () => ({
  addCooperativeOnChain: mockAddCooperativeOnChain,
}));
jest.mock('../src/services/notificationService', () => ({
  createForUsers: mockCreateForUsers,
  notifyActiveAdmins: mockNotifyActiveAdmins,
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const {
  approveApplication,
  createApplication,
  rejectApplication,
} = require('../src/controllers/cooperativeApplicationController');

const applicationInput = {
  name: 'Baringo Gold',
  village: 'Kabarnet',
  ward: 'Kabarnet',
  county: 'Baringo',
  walletAddress: '0x1111111111111111111111111111111111111111',
  registrationNumber: 'COOP-2026-01',
  phone: '+254700000001',
  commissionPercent: 7.5,
};

function pendingApplication(overrides = {}) {
  return {
    id: 21,
    applicantId: 7,
    ...applicationInput,
    status: 'PENDING',
    rejectionReason: null,
    reviewedAt: null,
    cooperativeId: null,
    createdAt: new Date('2026-11-24T10:00:00Z'),
    updatedAt: new Date('2026-11-24T10:00:00Z'),
    applicant: {
      id: 7,
      role: 'COOPERATIVE_STAFF',
      isActive: true,
      cooperativeId: null,
      cooperativeMembership: null,
    },
    ...overrides,
  };
}

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(mockPrisma));
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 7,
    role: 'COOPERATIVE_STAFF',
    isActive: true,
    cooperativeId: null,
    cooperativeMembership: null,
  });
  mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.cooperative.findFirst.mockResolvedValue(null);
  mockPrisma.cooperativeApplication.findFirst.mockResolvedValue(null);
  mockPrisma.cooperativeApplication.create.mockResolvedValue(pendingApplication({ applicant: undefined }));
  mockNotifyActiveAdmins.mockResolvedValue({ id: 90 });
  mockCreateForUsers.mockResolvedValue({ id: 91 });
  mockAddCooperativeOnChain.mockResolvedValue({ txHash: '0xgrant', alreadyGranted: false });
});

test('creates one pending application and notifies active admins', async () => {
  const req = { body: applicationInput, user: { id: 7, role: 'COOPERATIVE_STAFF' } };
  const res = response();

  await createApplication(req, res, jest.fn());

  expect(mockPrisma.cooperativeApplication.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      applicantId: 7,
      name: 'Baringo Gold',
      walletAddress: '0x1111111111111111111111111111111111111111',
      status: 'PENDING',
    }),
  }));
  expect(mockNotifyActiveAdmins).toHaveBeenCalledWith(expect.objectContaining({
    client: mockPrisma,
    type: 'COOPERATIVE_APPLICATION_SUBMITTED',
    entityType: 'CooperativeApplication',
    entityId: 21,
  }));
  expect(res.status).toHaveBeenCalledWith(201);
});

test('prevents a second pending application for the same applicant', async () => {
  mockPrisma.cooperativeApplication.findFirst.mockResolvedValue({ id: 20 });
  const res = response();

  await createApplication(
    { body: applicationInput, user: { id: 7, role: 'COOPERATIVE_STAFF' } },
    res,
    jest.fn()
  );

  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockPrisma.cooperativeApplication.create).not.toHaveBeenCalled();
  expect(mockNotifyActiveAdmins).not.toHaveBeenCalled();
});

test('approval grants the chain role then atomically creates cooperative ownership', async () => {
  const pending = pendingApplication();
  mockPrisma.cooperativeApplication.findUnique.mockResolvedValue(pending);
  mockPrisma.cooperative.create.mockResolvedValue({ id: 31, name: pending.name, isVerified: true });
  mockPrisma.cooperativeMembership.create.mockResolvedValue({
    id: 41,
    cooperativeId: 31,
    userId: 7,
    role: 'OWNER',
    isActive: true,
  });
  mockPrisma.cooperativeApplication.update.mockResolvedValue({
    ...pending,
    applicant: undefined,
    status: 'APPROVED',
    cooperativeId: 31,
  });
  const res = response();

  await approveApplication(
    { params: { id: '21' }, user: { id: 1, role: 'ADMIN' } },
    res,
    jest.fn()
  );

  expect(mockAddCooperativeOnChain).toHaveBeenCalledWith(pending.walletAddress);
  expect(mockPrisma.cooperative.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ isVerified: true, verifiedAt: expect.any(Date) }),
  });
  expect(mockPrisma.cooperativeMembership.create).toHaveBeenCalledWith({
    data: {
      cooperativeId: 31,
      userId: 7,
      role: 'OWNER',
      isActive: true,
      invitedByUserId: null,
    },
  });
  expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { cooperativeId: 31 },
  }));
  expect(mockPrisma.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('role');
  expect(mockPrisma.cooperativeApplication.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      status: 'APPROVED',
      reviewedById: 1,
      cooperativeId: 31,
    }),
  }));
  expect(mockCreateForUsers).toHaveBeenCalledWith(expect.objectContaining({
    userIds: [7],
    type: 'COOPERATIVE_APPLICATION_APPROVED',
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

test('chain failure leaves an application pending and creates no database records', async () => {
  mockPrisma.cooperativeApplication.findUnique.mockResolvedValue(pendingApplication());
  mockAddCooperativeOnChain.mockRejectedValue(new Error('private RPC failure'));
  const res = response();

  await approveApplication(
    { params: { id: '21' }, user: { id: 1, role: 'ADMIN' } },
    res,
    jest.fn()
  );

  expect(res.status).toHaveBeenCalledWith(502);
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(mockPrisma.cooperative.create).not.toHaveBeenCalled();
  expect(mockPrisma.cooperativeApplication.update).not.toHaveBeenCalled();
});

test('rejects a pending application with a required reason and notifies the applicant', async () => {
  const pending = pendingApplication();
  mockPrisma.cooperativeApplication.findUnique.mockResolvedValue(pending);
  mockPrisma.cooperativeApplication.update.mockResolvedValue({
    ...pending,
    status: 'REJECTED',
    rejectionReason: 'Registration document is expired.',
  });
  const res = response();

  await rejectApplication(
    {
      params: { id: '21' },
      body: { reason: ' Registration document is expired. ' },
      user: { id: 1, role: 'ADMIN' },
    },
    res,
    jest.fn()
  );

  expect(mockPrisma.cooperativeApplication.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      status: 'REJECTED',
      rejectionReason: 'Registration document is expired.',
      reviewedById: 1,
    }),
  }));
  expect(mockCreateForUsers).toHaveBeenCalledWith(expect.objectContaining({
    userIds: [7],
    type: 'COOPERATIVE_APPLICATION_REJECTED',
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});
