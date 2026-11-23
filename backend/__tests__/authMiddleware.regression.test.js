const mockPrisma = {
  user: { findUnique: jest.fn() },
  cooperative: { findUnique: jest.fn() },
};
const mockVerifyToken = jest.fn();

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/utils/jwt', () => ({ verifyToken: mockVerifyToken }));

const {
  authenticate,
  requireVerifiedCooperative,
} = require('../src/middleware/auth');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
});

test('authentication selects an active user without selecting the USSD PIN hash', async () => {
  mockVerifyToken.mockReturnValue({ userId: 4 });
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 4,
    role: 'COOPERATIVE_STAFF',
    cooperativeId: 2,
    isActive: true,
  });
  const req = { headers: { authorization: 'Bearer token' } };
  const res = createResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  const query = mockPrisma.user.findUnique.mock.calls[0][0];
  expect(query.select).not.toHaveProperty('ussdPinHash');
  expect(next).toHaveBeenCalledTimes(1);
});

test('ADMIN bypasses cooperative verification for controller-level checks', async () => {
  const req = { user: { id: 1, role: 'ADMIN', cooperativeId: null, isActive: true } };
  const next = jest.fn();

  await requireVerifiedCooperative(req, createResponse(), next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
});

test.each([
  ['an unassigned staff account', { cooperativeId: null, isActive: true }],
  ['an inactive staff account', { cooperativeId: 2, isActive: false }],
])('rejects %s with the stable cooperative verification code', async (description, state) => {
  const req = { user: { id: 4, role: 'COOPERATIVE_STAFF', ...state } };
  const res = createResponse();
  const next = jest.fn();

  await requireVerifiedCooperative(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'A verified cooperative assignment is required',
    code: 'COOPERATIVE_NOT_VERIFIED',
  });
  expect(mockPrisma.cooperative.findUnique).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('rejects staff assigned to an unverified cooperative', async () => {
  mockPrisma.cooperative.findUnique.mockResolvedValue({ id: 2, isVerified: false });
  const req = {
    user: { id: 4, role: 'COOPERATIVE_STAFF', cooperativeId: 2, isActive: true },
  };
  const res = createResponse();
  const next = jest.fn();

  await requireVerifiedCooperative(req, res, next);

  expect(mockPrisma.cooperative.findUnique).toHaveBeenCalledWith({
    where: { id: 2 },
    select: { id: true, isVerified: true },
  });
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json.mock.calls[0][0].code).toBe('COOPERATIVE_NOT_VERIFIED');
  expect(next).not.toHaveBeenCalled();
});

test('allows active staff assigned to a verified cooperative', async () => {
  mockPrisma.cooperative.findUnique.mockResolvedValue({ id: 2, isVerified: true });
  const req = {
    user: { id: 4, role: 'COOPERATIVE_STAFF', cooperativeId: 2, isActive: true },
  };
  const next = jest.fn();

  await requireVerifiedCooperative(req, createResponse(), next);

  expect(next).toHaveBeenCalledTimes(1);
});
