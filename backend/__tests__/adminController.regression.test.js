const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  cooperative: {
    findUnique: jest.fn(),
  },
};

jest.mock('../src/config/db', () => mockPrisma);

const {
  assignCooperative,
  changeUserRole,
  toggleUserActive,
} = require('../src/controllers/adminController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function createRequest({ currentUserId = 1, targetUserId = 2, body = {} } = {}) {
  return {
    params: { id: String(targetUserId) },
    body,
    user: { id: currentUserId, role: 'ADMIN' },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

test.each([
  ['assign a cooperative to', assignCooperative, { cooperativeId: 3 }],
  ['change the role of', changeUserRole, { role: 'BUYER' }],
  ['change the active status of', toggleUserActive, { isActive: false }],
])('prevents an administrator from trying to %s their own account', async (action, handler, body) => {
  const req = createRequest({ currentUserId: 1, targetUserId: 1, body });
  const res = createResponse();
  const next = jest.fn();

  await handler(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: `Administrators cannot ${action} their own account`,
  });
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('rejects cooperative assignment for an account that is not cooperative staff', async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 2, role: 'BUYER' });
  const req = createRequest({ body: { cooperativeId: 3 } });
  const res = createResponse();
  const next = jest.fn();

  await assignCooperative(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Only cooperative staff accounts can be assigned to a cooperative',
  });
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('assigns an existing cooperative staff account to the selected cooperative', async () => {
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 2,
    role: 'COOPERATIVE_STAFF',
  });
  mockPrisma.cooperative.findUnique.mockResolvedValue({ id: 3, name: 'Highlands' });
  mockPrisma.user.update.mockResolvedValue({
    id: 2,
    name: 'Staff Member',
    role: 'COOPERATIVE_STAFF',
    cooperativeId: 3,
  });
  const req = createRequest({ body: { cooperativeId: 3 } });
  const res = createResponse();
  const next = jest.fn();

  await assignCooperative(req, res, next);

  expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 2 },
    data: { cooperativeId: 3 },
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  expect(next).not.toHaveBeenCalled();
});

test('clears cooperative membership whenever an administrator changes another account role', async () => {
  mockPrisma.user.update.mockResolvedValue({
    id: 2,
    name: 'Former Staff',
    role: 'BUYER',
    cooperativeId: null,
  });
  const req = createRequest({ body: { role: 'BUYER' } });
  const res = createResponse();
  const next = jest.fn();

  await changeUserRole(req, res, next);

  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: 2 },
    data: { role: 'BUYER', cooperativeId: null },
    select: { id: true, name: true, role: true, cooperativeId: true },
  });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
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
