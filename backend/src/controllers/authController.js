const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');
const logger = require('../utils/logger');

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const { name, phone, email, password, role, cooperativeId } = req.body;

    // Validate
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, and password are required',
      });
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already registered',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash,
        role: role || 'FARMER',
        cooperativeId: cooperativeId || null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        cooperativeId: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = signToken({ userId: user.id, role: user.role });

    logger.info('User registered', { userId: user.id, phone: user.phone });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, token },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      include: { cooperative: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = signToken({ userId: user.id, role: user.role });

    logger.info('User logged in', { userId: user.id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          cooperativeId: user.cooperativeId,
          cooperative: user.cooperative,
        },
        token,
      },
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
      include: { cooperative: true },
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        cooperative: user.cooperative,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/me
async function updateMe(req, res, next) {
  try {
    const { name, email, walletAddress } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(walletAddress && { walletAddress }),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        walletAddress: true,
      },
    });

    res.json({
      success: true,
      message: 'Profile updated',
      data: user,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, getMe, updateMe };