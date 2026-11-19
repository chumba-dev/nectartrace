const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('../src/utils/jwt', () => ({
  signToken: jest.fn(),
  verifyToken: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { signToken, verifyToken } = require('../src/utils/jwt');
const authRouter = require('../src/routes/auth');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));

const registration = {
  name: 'Test User',
  phone: '+254700000001',
  email: 'test@example.com',
  password: '12345678',
};

beforeEach(() => {
  jest.resetAllMocks();
  bcrypt.hash.mockResolvedValue('hashed-password');
  signToken.mockReturnValue('signed-token');
});

describe('public registration', () => {
  test.each(['ADMIN', 'FARMER', 'UNKNOWN_ROLE'])(
    'rejects the %s role without writing',
    async (role) => {
      const response = await request(app)
        .post('/auth/register')
        .send({ ...registration, role });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Role must be one of: BUYER, COOPERATIVE_STAFF');
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['a password shorter than eight characters', '1234567'],
    ['a non-string password', 12345678],
  ])('rejects %s before writing', async (description, password) => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...registration, password, role: 'BUYER' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Password must be at least 8 characters long');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  test.each(['BUYER', 'COOPERATIVE_STAFF'])(
    'accepts %s with an eight-character password and clears cooperativeId',
    async (role) => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(async ({ data }) => ({
        id: 11,
        name: data.name,
        phone: data.phone,
        email: data.email,
        role: data.role,
        cooperativeId: data.cooperativeId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }));

      const response = await request(app)
        .post('/auth/register')
        .send({ ...registration, role, cooperativeId: 999 });

      expect(response.status).toBe(201);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          role,
          cooperativeId: null,
          passwordHash: 'hashed-password',
        }),
      }));
      expect(response.body.data.user.cooperativeId).toBeNull();
    }
  );
});

test('GET /auth/me includes cooperativeId', async () => {
  const authenticatedUser = {
    id: 21,
    name: 'Staff User',
    phone: '+254700000021',
    email: 'staff@example.com',
    role: 'COOPERATIVE_STAFF',
    cooperativeId: 7,
    walletAddress: null,
    isActive: true,
  };
  const profile = {
    ...authenticatedUser,
    cooperative: { id: 7, name: 'Honey Cooperative' },
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  };

  verifyToken.mockReturnValue({ userId: authenticatedUser.id });
  mockPrisma.user.findUnique
    .mockResolvedValueOnce(authenticatedUser)
    .mockResolvedValueOnce(profile);

  const response = await request(app)
    .get('/auth/me')
    .set('Authorization', 'Bearer test-token');

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveProperty('cooperativeId', 7);
});
