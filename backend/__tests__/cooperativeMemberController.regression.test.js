const mockPrisma = {
  $transaction: jest.fn(),
  user: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  cooperativeMembership: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../src/config/db', () => mockPrisma);

const {
  addMember,
  updateMemberActive,
  updateMemberRole,
} = require('../src/controllers/cooperativeMemberController');

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function request({ actorRole = 'OWNER', body = {}, userId = 7 } = {}) {
  return {
    body,
    params: { userId: String(userId) },
    user: { id: 2, role: 'COOPERATIVE_STAFF' },
    cooperativeMembership: {
      id: 10,
      cooperativeId: 4,
      userId: 2,
      role: actorRole,
      isActive: true,
    },
  };
}

function eligibleUser(overrides = {}) {
  return {
    id: 7,
    name: 'New Staff',
    email: 'staff@example.test',
    phone: '+254700000007',
    role: 'COOPERATIVE_STAFF',
    isActive: true,
    cooperativeId: null,
    cooperativeMembership: null,
    ...overrides,
  };
}

function membership(overrides = {}) {
  return {
    id: 20,
    cooperativeId: 4,
    userId: 7,
    role: 'STAFF',
    isActive: true,
    user: eligibleUser({ cooperativeId: 4 }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(mockPrisma));
  mockPrisma.user.findUnique.mockResolvedValue(eligibleUser());
  mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.cooperativeMembership.create.mockResolvedValue(membership({ role: 'MANAGER' }));
});

test('an owner can add a manager while preserving the target global role', async () => {
  const req = request({
    body: { identifier: ' STAFF@example.test ', role: 'MANAGER' },
  });
  const res = response();

  await addMember(req, res, jest.fn());

  expect(mockPrisma.cooperativeMembership.create).toHaveBeenCalledWith(expect.objectContaining({
    data: {
      cooperativeId: 4,
      userId: 7,
      role: 'MANAGER',
      isActive: true,
      invitedByUserId: 2,
    },
  }));
  expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
    where: {
      id: 7,
      role: 'COOPERATIVE_STAFF',
      cooperativeId: null,
    },
    data: { cooperativeId: 4 },
  });
  expect(mockPrisma.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('role');
  expect(res.status).toHaveBeenCalledWith(201);
});

test('a manager can add staff but cannot assign manager', async () => {
  const denied = response();
  await addMember(
    request({ actorRole: 'MANAGER', body: { identifier: 'staff@example.test', role: 'MANAGER' } }),
    denied,
    jest.fn()
  );

  expect(denied.status).toHaveBeenCalledWith(403);
  expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();

  const allowed = response();
  mockPrisma.cooperativeMembership.create.mockResolvedValue(membership());
  await addMember(
    request({ actorRole: 'MANAGER', body: { identifier: 'staff@example.test', role: 'STAFF' } }),
    allowed,
    jest.fn()
  );
  expect(allowed.status).toHaveBeenCalledWith(201);
});

test('a manager cannot promote, demote, or suspend another manager', async () => {
  mockPrisma.cooperativeMembership.findFirst.mockResolvedValue(membership({ role: 'MANAGER' }));
  const roleResponse = response();
  await updateMemberRole(
    request({ actorRole: 'MANAGER', body: { role: 'STAFF' } }),
    roleResponse,
    jest.fn()
  );
  expect(roleResponse.status).toHaveBeenCalledWith(403);

  const activeResponse = response();
  await updateMemberActive(
    request({ actorRole: 'MANAGER', body: { isActive: false } }),
    activeResponse,
    jest.fn()
  );
  expect(activeResponse.status).toHaveBeenCalledWith(403);
  expect(mockPrisma.cooperativeMembership.update).not.toHaveBeenCalled();
});

test('an owner can suspend staff but cannot manage their own membership', async () => {
  mockPrisma.cooperativeMembership.findFirst.mockResolvedValue(membership());
  mockPrisma.cooperativeMembership.update.mockResolvedValue(membership({ isActive: false }));
  const res = response();

  await updateMemberActive(
    request({ body: { isActive: false } }),
    res,
    jest.fn()
  );

  expect(mockPrisma.cooperativeMembership.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 20 },
    data: { isActive: false },
  }));

  const selfResponse = response();
  await updateMemberActive(
    request({ body: { isActive: false }, userId: 2 }),
    selfResponse,
    jest.fn()
  );
  expect(selfResponse.status).toHaveBeenCalledWith(403);
});
