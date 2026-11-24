const mockPrisma = {
  user: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  cooperative: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};
const mockAddCooperativeOnChain = jest.fn();

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/config/blockchain', () => ({
  addCooperativeOnChain: mockAddCooperativeOnChain,
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const {
  listUsers,
  toggleUserActive,
  createCooperative,
  verifyCooperative,
} = require('../src/controllers/adminController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function createRequest({ currentUserId = 1, targetUserId = 2, body = {}, query = {} } = {}) {
  return {
    params: { id: String(targetUserId) },
    body,
    query,
    user: { id: currentUserId, role: 'ADMIN' },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockAddCooperativeOnChain.mockResolvedValue({
    txHash: '0xseed',
    alreadyGranted: false,
  });
});

test('prevents an administrator from changing their own active status', async () => {
  const req = createRequest({
    currentUserId: 1,
    targetUserId: 1,
    body: { isActive: false },
  });
  const res = createResponse();
  const next = jest.fn();

  await toggleUserActive(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Administrators cannot change the active status of their own account',
  });
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('requires a boolean when changing another account active status', async () => {
  const req = createRequest({ body: { isActive: 'false' } });
  const res = createResponse();
  const next = jest.fn();

  await toggleUserActive(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'isActive must be a boolean',
  });
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('lists users with an optional fixed global role filter and no secret fields', async () => {
  mockPrisma.user.findMany.mockResolvedValue([]);
  const req = createRequest({ query: { role: 'COOPERATIVE_STAFF' } });
  const res = createResponse();
  const next = jest.fn();

  await listUsers(req, res, next);

  const query = mockPrisma.user.findMany.mock.calls[0][0];
  expect(query.where).toEqual({ role: 'COOPERATIVE_STAFF' });
  expect(query.select).not.toHaveProperty('passwordHash');
  expect(query.select).not.toHaveProperty('ussdPinHash');
  expect(query.select).not.toHaveProperty('mpesaNumber');
  expect(next).not.toHaveBeenCalled();
});

test('rejects an invalid user role filter', async () => {
  const res = createResponse();

  await listUsers(createRequest({ query: { role: 'OWNER' } }), res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
});

test.each([-1, 100.01, 'not-a-number'])(
  'rejects cooperative commission %p before blockchain or database work',
  async (commissionPercent) => {
    const req = createRequest({
      body: {
        name: 'Highlands',
        village: 'Kabarnet',
        walletAddress: '0x1111111111111111111111111111111111111111',
        commissionPercent,
      },
    });
    const res = createResponse();

    await createCooperative(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'commissionPercent must be between 0 and 100',
    });
    expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
    expect(mockAddCooperativeOnChain).not.toHaveBeenCalled();
    expect(mockPrisma.cooperative.create).not.toHaveBeenCalled();
  }
);

test('creates a cooperative with ward and commission while leaving it unverified', async () => {
  const cooperative = {
    id: 3,
    name: 'Highlands',
    ward: 'Kabarnet',
    commissionPercent: 7.5,
    isVerified: false,
    verifiedAt: null,
  };
  mockPrisma.cooperative.findUnique.mockResolvedValue(null);
  mockPrisma.cooperative.create.mockResolvedValue(cooperative);
  const req = createRequest({
    body: {
      name: 'Highlands',
      village: 'Kabarnet',
      ward: ' Kabarnet ',
      walletAddress: '0x1111111111111111111111111111111111111111',
      commissionPercent: '7.5',
    },
  });
  const res = createResponse();

  await createCooperative(req, res, jest.fn());

  expect(mockPrisma.cooperative.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      ward: 'Kabarnet',
      commissionPercent: 7.5,
      isVerified: false,
      verifiedAt: null,
    }),
  });
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockAddCooperativeOnChain).not.toHaveBeenCalled();
});

test('validates the cooperative ID before verification', async () => {
  const req = createRequest({ targetUserId: 0 });
  const res = createResponse();

  await verifyCooperative(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.cooperative.update).not.toHaveBeenCalled();
});

test('returns 404 when verifying an unknown cooperative', async () => {
  mockPrisma.cooperative.findUnique.mockResolvedValue(null);
  const req = createRequest({ targetUserId: 99 });
  const res = createResponse();

  await verifyCooperative(req, res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(404);
  expect(mockPrisma.cooperative.update).not.toHaveBeenCalled();
});

test('grants the chain role before verifying a cooperative in the database', async () => {
  mockPrisma.cooperative.findUnique.mockResolvedValue({
    id: 3,
    walletAddress: '0x1111111111111111111111111111111111111111',
    isVerified: false,
    verifiedAt: null,
  });
  mockPrisma.cooperative.update.mockResolvedValue({ id: 3, isVerified: true });
  const req = createRequest({ targetUserId: 3 });
  const res = createResponse();

  await verifyCooperative(req, res, jest.fn());

  expect(mockAddCooperativeOnChain).toHaveBeenCalledWith(
    '0x1111111111111111111111111111111111111111'
  );
  expect(mockAddCooperativeOnChain.mock.invocationCallOrder[0]).toBeLessThan(
    mockPrisma.cooperative.update.mock.invocationCallOrder[0]
  );
  expect(mockPrisma.cooperative.update).toHaveBeenCalledWith({
    where: { id: 3 },
    data: { isVerified: true, verifiedAt: expect.any(Date) },
  });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    message: 'Cooperative verified',
  }));
});

test('leaves a cooperative unverified when the chain role grant fails', async () => {
  mockPrisma.cooperative.findUnique.mockResolvedValue({
    id: 3,
    walletAddress: '0x1111111111111111111111111111111111111111',
    isVerified: false,
    verifiedAt: null,
  });
  mockAddCooperativeOnChain.mockRejectedValue(
    new Error('provider failed at https://rpc.example.test/private-token')
  );
  const res = createResponse();

  await verifyCooperative(createRequest({ targetUserId: 3 }), res, jest.fn());

  expect(res.status).toHaveBeenCalledWith(502);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Failed to grant the cooperative blockchain role',
  });
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-token');
  expect(mockPrisma.cooperative.update).not.toHaveBeenCalled();
});
