const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../config/db');
const env = require('../config/env');
const { signToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const {
  normalizeEmail,
  normalizePhone,
  phoneLookupCandidates,
  normalizePublicRole,
} = require('../utils/normalization');

const PUBLIC_ROLES = ['COOPERATIVE_STAFF', 'BUYER', 'FARMER', 'CONSUMER'];
const GENERIC_RESEND_MESSAGE = 'If an eligible account exists, a verification email has been sent.';
const SAFE_COOPERATIVE_SELECT = {
  id: true,
  name: true,
  village: true,
  ward: true,
  county: true,
  walletAddress: true,
  registrationNumber: true,
  phone: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
};
const AUTH_USER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  passwordHash: true,
  googleId: true,
  emailVerifiedAt: true,
  role: true,
  cooperativeId: true,
  walletAddress: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  cooperative: { select: SAFE_COOPERATIVE_SELECT },
};
let googleClient;

function getGoogleClient() {
  if (!googleClient) googleClient = new OAuth2Client(env.google.clientId);
  return googleClient;
}

function publicCooperative(cooperative) {
  if (!cooperative) return cooperative;
  return {
    id: cooperative.id,
    name: cooperative.name,
    village: cooperative.village,
    ward: cooperative.ward,
    county: cooperative.county,
    walletAddress: cooperative.walletAddress,
    registrationNumber: cooperative.registrationNumber,
    phone: cooperative.phone,
    isVerified: cooperative.isVerified,
    createdAt: cooperative.createdAt,
    updatedAt: cooperative.updatedAt,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    cooperativeId: user.cooperativeId,
    ...(user.cooperative !== undefined && { cooperative: publicCooperative(user.cooperative) }),
    ...(user.walletAddress !== undefined && { walletAddress: user.walletAddress }),
    ...(user.createdAt !== undefined && { createdAt: user.createdAt }),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    isGoogleLinked: Boolean(user.googleId),
  };
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashVerificationToken(token);
  const ttlMinutes = Number.isFinite(env.emailVerification.ttlMinutes)
    && env.emailVerification.ttlMinutes > 0
    ? env.emailVerification.ttlMinutes
    : 60;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await prisma.emailVerificationToken.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash, expiresAt },
    update: { tokenHash, expiresAt },
  });

  try {
    return await emailService.sendVerificationEmail({ to: user.email, token });
  } catch (err) {
    logger.warn('Verification email delivery failed', { userId: user.id });
    return false;
  }
}

async function findUserByIdentifier(identifier) {
  if (typeof identifier !== 'string' || !identifier.trim()) return null;

  const rawIdentifier = identifier.trim();
  if (rawIdentifier.includes('@')) {
    const email = normalizeEmail(rawIdentifier);
    if (!email) return null;
    return prisma.user.findUnique({
      where: { email },
      select: AUTH_USER_SELECT,
    });
  }

  for (const phone of phoneLookupCandidates(rawIdentifier)) {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: AUTH_USER_SELECT,
    });
    if (user) return user;
  }

  return null;
}

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const { password, role } = req.body;
    const normalizedRole = normalizePublicRole(role);

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, valid email, phone, and password are required',
      });
    }
    if (name.length > 120) {
      return res.status(400).json({ success: false, message: 'Name must not exceed 120 characters' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }
    if (!normalizedRole) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${PUBLIC_ROLES.join(', ')}`,
      });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const existingPhone = existingEmail
      ? null
      : await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existingEmail || existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'Email or phone number already registered',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash,
        role: normalizedRole,
        cooperativeId: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        cooperativeId: true,
        emailVerifiedAt: true,
        googleId: true,
        createdAt: true,
      },
    });

    const emailSent = Boolean(await issueVerificationEmail(user));
    logger.info('User registered', { userId: user.id });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Verify your email before signing in.',
      data: {
        user: publicUser(user),
        requiresEmailVerification: true,
        emailSent,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-email
async function verifyEmail(req, res, next) {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashVerificationToken(token) },
    });
    if (!record || record.expiresAt <= new Date()) {
      if (record) {
        await prisma.emailVerificationToken.deleteMany({ where: { id: record.id } });
      }
      return res.status(400).json({
        success: false,
        message: 'Verification token is invalid or expired',
      });
    }

    const verifiedAt = new Date();
    const userUpdate = prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: verifiedAt },
      select: AUTH_USER_SELECT,
    });
    const tokenDelete = prisma.emailVerificationToken.delete({ where: { id: record.id } });
    const [user] = await prisma.$transaction([userUpdate, tokenDelete]);

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: { user: publicUser(user) },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/resend-verification
async function resendVerification(req, res, next) {
  try {
    const user = await findUserByIdentifier(req.body.identifier);
    if (user?.isActive && user.email && !user.emailVerifiedAt) {
      try {
        await issueVerificationEmail(user);
      } catch (err) {
        logger.warn('Verification email could not be reissued', { userId: user.id });
      }
    }

    res.json({ success: true, message: GENERIC_RESEND_MESSAGE });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Identifier and password are required',
      });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'Password login is not available for this account',
        code: 'PASSWORD_LOGIN_UNAVAILABLE',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.email && !user.emailVerifiedAt) {
      return res.status(403).json({
        success: false,
        message: 'Verify your email before signing in',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const token = signToken({ userId: user.id, role: user.role });
    logger.info('User logged in', { userId: user.id });
    res.json({
      success: true,
      message: 'Login successful',
      data: { user: publicUser(user), token },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/google
async function googleAuth(req, res, next) {
  try {
    const credential = typeof req.body.credential === 'string' ? req.body.credential.trim() : '';
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential is required' });
    }
    if (!env.google.clientId) {
      return res.status(503).json({ success: false, message: 'Google authentication is not configured' });
    }

    let payload;
    try {
      const ticket = await getGoogleClient().verifyIdToken({
        idToken: credential,
        audience: env.google.clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid Google credential' });
    }

    const email = normalizeEmail(payload?.email);
    if (!payload?.sub || !email || payload.email_verified !== true) {
      return res.status(401).json({
        success: false,
        message: 'Google account must have a verified email',
      });
    }

    let user = await prisma.user.findUnique({
      where: { googleId: payload.sub },
      select: AUTH_USER_SELECT,
    });
    let foundByEmail = false;
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
        select: AUTH_USER_SELECT,
      });
      foundByEmail = Boolean(user);
    }

    let created = false;
    if (user) {
      if (!user.isActive) {
        return res.status(401).json({ success: false, message: 'Account is inactive' });
      }
      if (user.googleId && user.googleId !== payload.sub) {
        return res.status(409).json({
          success: false,
          message: 'This email is linked to another Google account',
        });
      }
      if (foundByEmail && (!user.googleId || !user.emailVerifiedAt)) {
        try {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: payload.sub,
              emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            },
            select: AUTH_USER_SELECT,
          });
          await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
        } catch (err) {
          if (err.code === 'P2002') {
            return res.status(409).json({
              success: false,
              message: 'Google account could not be linked safely',
            });
          }
          throw err;
        }
      }
    } else {
      if (!req.body.phone || !req.body.role) {
        return res.status(409).json({
          success: false,
          message: 'Phone and role are required to complete your Google profile',
          code: 'GOOGLE_PROFILE_INCOMPLETE',
        });
      }
      const normalizedRole = normalizePublicRole(req.body.role);
      if (!normalizedRole) {
        return res.status(400).json({
          success: false,
          message: `Role must be one of: ${PUBLIC_ROLES.join(', ')}`,
        });
      }

      const phone = normalizePhone(req.body.phone);
      if (!phone) {
        return res.status(400).json({ success: false, message: 'A valid phone number is required' });
      }
      const phoneOwner = await prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (phoneOwner) {
        return res.status(409).json({
          success: false,
          message: 'Phone number is already registered',
          code: 'PHONE_IN_USE',
        });
      }

      try {
        user = await prisma.user.create({
          data: {
            name: typeof payload.name === 'string' && payload.name.trim()
              ? payload.name.trim().slice(0, 120)
              : email.split('@')[0],
            email,
            phone,
            role: normalizedRole,
            passwordHash: null,
            googleId: payload.sub,
            emailVerifiedAt: new Date(),
            cooperativeId: null,
          },
          select: AUTH_USER_SELECT,
        });
      } catch (err) {
        if (err.code === 'P2002') {
          return res.status(409).json({
            success: false,
            message: 'Google profile conflicts with an existing account',
          });
        }
        throw err;
      }
      created = true;
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.status(created ? 201 : 200).json({
      success: true,
      message: 'Google authentication successful',
      data: { user: publicUser(user), token },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: AUTH_USER_SELECT,
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/me
async function updateMe(req, res, next) {
  try {
    const data = {};
    if (req.body.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name || name.length > 120) {
        return res.status(400).json({
          success: false,
          message: 'Name is required and must not exceed 120 characters',
        });
      }
      data.name = name;
    }
    if (req.body.walletAddress !== undefined) {
      data.walletAddress = req.body.walletAddress || null;
    }

    let emailChanged = false;
    if (req.body.email !== undefined) {
      const email = normalizeEmail(req.body.email);
      if (!email) {
        return res.status(400).json({ success: false, message: 'A valid email is required' });
      }
      if (email !== req.user.email) {
        data.email = email;
        data.emailVerifiedAt = null;
        emailChanged = true;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: AUTH_USER_SELECT,
    });
    const emailSent = emailChanged ? await issueVerificationEmail(user) : undefined;

    res.json({
      success: true,
      message: 'Profile updated',
      data: publicUser(user),
      ...(emailChanged && { requiresEmailVerification: true, emailSent }),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  googleAuth,
  getMe,
  updateMe,
};
