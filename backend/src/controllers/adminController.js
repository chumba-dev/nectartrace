const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

const USER_ROLES = ['FARMER', 'COOPERATIVE_STAFF', 'BUYER', 'ADMIN', 'CONSUMER'];

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseCommissionPercent(value) {
  if (value === undefined) return 0;
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseOptionalWard(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    return { error: 'ward must be a non-empty string of at most 120 characters' };
  }
  return { value: value.trim() };
}

function rejectSelfManagement(req, res, userId, action) {
  if (userId !== req.user.id) return false;

  res.status(403).json({
    success: false,
    message: `Administrators cannot ${action} their own account`,
  });
  return true;
}

// GET /api/admin/users
async function listUsers(req, res, next) {
  try {
    const { role } = req.query;
    if (role !== undefined && !USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${USER_ROLES.join(', ')}`,
      });
    }
    const users = await prisma.user.findMany({
      where: role ? { role } : {},
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        cooperativeId: true,
        isActive: true,
        createdAt: true,
        cooperative: {
          select: { id: true, name: true, village: true },
        },
        cooperativeMembership: {
          select: { role: true, isActive: true, cooperativeId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/active
async function toggleUserActive(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.params.id);
    const { isActive } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID must be a positive integer' });
    }
    if (rejectSelfManagement(req, res, userId, 'change the active status of')) return;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/cooperatives
// Creation is intentionally off-chain until an administrator verifies the cooperative.
async function createCooperative(req, res, next) {
  try {
    const {
      name,
      village,
      ward,
      county,
      walletAddress,
      registrationNumber,
      phone,
      commissionPercent,
    } = req.body;

    if (!name || !village || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'name, village, and walletAddress are required',
      });
    }
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress must be a valid blockchain address',
      });
    }
    const normalizedWalletAddress = ethers.getAddress(walletAddress);
    const parsedWard = parseOptionalWard(ward);
    if (parsedWard.error) {
      return res.status(400).json({ success: false, message: parsedWard.error });
    }
    const parsedCommissionPercent = parseCommissionPercent(commissionPercent);
    if (parsedCommissionPercent === null) {
      return res.status(400).json({
        success: false,
        message: 'commissionPercent must be between 0 and 100',
      });
    }

    // Check wallet isn't already used
    const existing = await prisma.cooperative.findUnique({
      where: { walletAddress: normalizedWalletAddress },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A cooperative with this wallet already exists',
      });
    }

    // Save to database
    const coop = await prisma.cooperative.create({
      data: {
        name,
        village,
        ward: parsedWard.value,
        county: county || 'Baringo',
        walletAddress: normalizedWalletAddress,
        registrationNumber: registrationNumber || null,
        phone: phone || null,
        commissionPercent: parsedCommissionPercent,
        isVerified: false,
        verifiedAt: null,
      },
    });

    res.status(201).json({
      success: true,
      data: coop,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/cooperatives/:id/verify
async function verifyCooperative(req, res, next) {
  try {
    const cooperativeId = parsePositiveInteger(req.params.id);
    if (!cooperativeId) {
      return res.status(400).json({
        success: false,
        message: 'Cooperative ID must be a positive integer',
      });
    }

    const existing = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
      select: { id: true, walletAddress: true, isVerified: true, verifiedAt: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cooperative not found' });
    }

    let roleGrant;
    try {
      // Migrated verified rows may not yet have this role; re-verification reconciles them safely.
      roleGrant = await blockchain.addCooperativeOnChain(existing.walletAddress);
    } catch (err) {
      logger.error('Cooperative blockchain role grant failed', { cooperativeId });
      return res.status(502).json({
        success: false,
        message: 'Failed to grant the cooperative blockchain role',
      });
    }

    const cooperative = await prisma.cooperative.update({
      where: { id: cooperativeId },
      data: {
        isVerified: true,
        verifiedAt: existing.verifiedAt || new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Cooperative verified',
      data: cooperative,
      blockchain: roleGrant,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/stats
async function getPlatformStats(req, res, next) {
  try {
    const [
      users,
      cooperatives,
      batches,
      listings,
      orders,
      pendingCooperativeApplications,
      unreadAdminNotifications,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.cooperative.count(),
      prisma.honeyBatch.count(),
      prisma.listing.count(),
      prisma.order.count(),
      prisma.cooperativeApplication.count({ where: { status: 'PENDING' } }),
      prisma.notificationRecipient.count({
        where: {
          readAt: null,
          user: { role: 'ADMIN', isActive: true },
        },
      }),
    ]);

    const totalWeight = await prisma.honeyBatch.aggregate({
      _sum: { weightKg: true },
    });

    res.json({
      success: true,
      data: {
        users,
        cooperatives,
        batches,
        listings,
        orders,
        pendingCooperativeApplications,
        unreadAdminNotifications,
        totalWeightKg: totalWeight._sum.weightKg || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  toggleUserActive,
  createCooperative,
  verifyCooperative,
  getPlatformStats,
};
