const mockVerifyIdToken = jest.fn();
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  emailVerificationToken: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockEmailService = {
  sendVerificationEmail: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/config/env', () => ({
  google: { clientId: 'google-client-id' },
  emailVerification: { ttlMinutes: 60 },
}));
jest.mock('../src/services/emailService', () => mockEmailService);
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
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
const { OAuth2Client } = require('google-auth-library');
const { signToken, verifyToken } = require('../src/utils/jwt');
const authRouter = require('../src/routes/auth');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));

const registration = {
  name: 'Test User',
  phone: '0700 000 001',
  email: ' Test@Example.COM ',
  password: '12345678',
};

function user(overrides = {}) {
  return {
    id: 11,
    name: 'Test User',
    phone: '+254700000001',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    googleId: null,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    role: 'BUYER',
    cooperativeId: null,
    cooperative: null,
    walletAddress: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  bcrypt.hash.mockResolvedValue('hashed-password');
  bcrypt.compare.mockResolvedValue(true);
  signToken.mockReturnValue('signed-token');
  mockEmailService.sendVerificationEmail.mockResolvedValue(true);
  OAuth2Client.mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken }));
  mockPrisma.emailVerificationToken.upsert.mockResolvedValue({ id: 1 });
  mockPrisma.emailVerificationToken.delete.mockResolvedValue({ id: 1 });
  mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(async (operations) => Promise.all(operations));
});

describe('public registration and verification', () => {
  test.each(['ADMIN', 'UNKNOWN_ROLE'])(
    'rejects the %s role without writing',
    async (role) => {
      const response = await request(app)
        .post('/auth/register')
        .send({ ...registration, role });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Role must be one of: COOPERATIVE_STAFF, BUYER, FARMER, CONSUMER'
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
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

  test.each([
    ['BUYER', 'BUYER'],
    ['FaRmEr', 'FARMER'],
    ['consumer', 'CONSUMER'],
    ['CoOpErAtIvE', 'COOPERATIVE_STAFF'],
    ['cooperative_staff', 'COOPERATIVE_STAFF'],
  ])(
    'normalizes %s and creates an unverified %s account without a JWT',
    async (role, expectedRole) => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(async ({ data }) => user({
        ...data,
        emailVerifiedAt: null,
        googleId: null,
      }));

      const response = await request(app)
        .post('/auth/register')
        .send({ ...registration, role, cooperativeId: 999 });

      expect(response.status).toBe(201);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
          phone: '+254700000001',
          role: expectedRole,
          cooperativeId: null,
          passwordHash: 'hashed-password',
        }),
      }));
      expect(mockPrisma.emailVerificationToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 11 },
        create: expect.objectContaining({
          userId: 11,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      }));
      expect(response.body.data).toEqual(expect.objectContaining({
        requiresEmailVerification: true,
        emailSent: true,
      }));
      expect(response.body.data).not.toHaveProperty('token');
      expect(response.body.data.user).not.toHaveProperty('googleId');
    }
  );

  test('keeps registration successful when SMTP delivery fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(user({ emailVerifiedAt: null }));
    mockEmailService.sendVerificationEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const response = await request(app)
      .post('/auth/register')
      .send({ ...registration, role: 'BUYER' });

    expect(response.status).toBe(201);
    expect(response.body.data.emailSent).toBe(false);
  });

  test('verifies a hashed token and consumes it atomically', async () => {
    const verifiedUser = user();
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 4,
      userId: 11,
      expiresAt: new Date(Date.now() + 60_000),
      user: user({ emailVerifiedAt: null }),
    });
    mockPrisma.user.update.mockResolvedValue(verifiedUser);

    const response = await request(app)
      .post('/auth/verify-email')
      .send({ token: 'raw-token' });

    expect(response.status).toBe(200);
    expect(mockPrisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(mockPrisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 4 } });
    expect(response.body.data.user).not.toHaveProperty('tokenHash');
  });

  test('resend uses the same generic response for eligible and unknown accounts', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(user({ emailVerifiedAt: null }));
    const eligible = await request(app)
      .post('/auth/resend-verification')
      .send({ identifier: 'test@example.com' });

    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app)
      .post('/auth/resend-verification')
      .send({ identifier: 'unknown@example.com' });

    expect(eligible.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(eligible.body).toEqual(unknown.body);
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('identifier login', () => {
  test('normalizes an email identifier and returns the existing envelope', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user());

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: ' TEST@example.COM ', password: 'password' });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'test@example.com' },
      select: expect.any(Object),
    }));
    expect(mockPrisma.user.findUnique.mock.calls[0][0].select).not.toHaveProperty('ussdPinHash');
    expect(response.body.data.token).toBe('signed-token');
    expect(response.body.data.user).not.toHaveProperty('googleId');
  });

  test('tries normalized then exact legacy phone input', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user({ phone: '0700000001', email: null, emailVerifiedAt: null }));

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: '0700000001', password: 'password' });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { phone: '+254700000001' },
      select: expect.any(Object),
    }));
    expect(mockPrisma.user.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { phone: '0700000001' },
      select: expect.any(Object),
    }));
  });

  test('rejects Google-only password login without calling bcrypt', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ passwordHash: null, googleId: 'google-1' }));

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: 'test@example.com', password: 'password' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('PASSWORD_LOGIN_UNAVAILABLE');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('requires verification for a new email account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ emailVerifiedAt: null }));

    const response = await request(app)
      .post('/auth/login')
      .send({ identifier: 'test@example.com', password: 'password' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('Google authentication', () => {
  const verifiedPayload = {
    sub: 'google-subject',
    email: 'test@example.com',
    email_verified: true,
    name: 'Google User',
  };

  beforeEach(() => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => verifiedPayload });
  });

  test('requires profile completion for a new Google account without phone', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GOOGLE_PROFILE_INCOMPLETE');
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-credential',
      audience: 'google-client-id',
    });
  });

  test('rejects a Google identity whose email is not verified', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...verifiedPayload, email_verified: false }),
    });

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential', phone: '0700000001', role: 'BUYER' });

    expect(response.status).toBe(401);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  test.each([
    ['consumer', 'CONSUMER'],
    ['FARMER', 'FARMER'],
    ['CoOpErAtIvE', 'COOPERATIVE_STAFF'],
  ])('creates a new Google account from the %s alias as %s', async (role, expectedRole) => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async ({ data }) => user({
      ...data,
      cooperative: null,
      isActive: true,
    }));

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential', phone: '0700000001', role });

    expect(response.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: expectedRole, cooperativeId: null }),
    }));
    expect(response.body.data.user.role).toBe(expectedRole);
  });

  test('rejects ADMIN for a new Google account before creation', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential', phone: '0700000001', role: 'ADMIN' });

    expect(response.status).toBe(400);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  test('authenticates an existing ADMIN without applying the supplied role', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({
      role: 'ADMIN',
      googleId: 'google-subject',
    }));

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential', role: 'consumer' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('ADMIN');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  test('links a matching verified Google email without changing its role or cooperative', async () => {
    const existing = user({
      role: 'COOPERATIVE_STAFF',
      cooperativeId: 8,
      emailVerifiedAt: null,
    });
    const linked = user({
      ...existing,
      googleId: 'google-subject',
      emailVerifiedAt: new Date(),
    });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mockPrisma.user.update.mockResolvedValue(linked);

    const response = await request(app)
      .post('/auth/google')
      .send({ credential: 'google-credential', role: 'ADMIN' });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existing.id },
      data: expect.objectContaining({ googleId: 'google-subject' }),
    }));
    expect(response.body.data.user).toEqual(expect.objectContaining({
      role: 'COOPERATIVE_STAFF',
      cooperativeId: 8,
      isGoogleLinked: true,
    }));
    expect(response.body.data.user).not.toHaveProperty('googleId');
  });
});

test('GET /auth/me exposes verification and Google-link state without googleId', async () => {
  const authenticatedUser = user({ id: 21, cooperativeId: 7, role: 'COOPERATIVE_STAFF' });
  const profile = user({
    ...authenticatedUser,
    googleId: 'linked-google-id',
    ussdPinHash: 'must-not-leak',
    cooperative: {
      id: 7,
      name: 'Honey Cooperative',
      commissionPercent: 12,
      verifiedAt: new Date(),
    },
  });

  verifyToken.mockReturnValue({ userId: authenticatedUser.id });
  mockPrisma.user.findUnique
    .mockResolvedValueOnce(authenticatedUser)
    .mockResolvedValueOnce(profile);

  const response = await request(app)
    .get('/auth/me')
    .set('Authorization', 'Bearer test-token');

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(expect.objectContaining({
    cooperativeId: 7,
    emailVerifiedAt: expect.any(String),
    isGoogleLinked: true,
  }));
  expect(response.body.data).not.toHaveProperty('googleId');
  expect(response.body.data).not.toHaveProperty('ussdPinHash');
  expect(response.body.data.cooperative).not.toHaveProperty('commissionPercent');
  expect(response.body.data.cooperative).not.toHaveProperty('verifiedAt');
});
