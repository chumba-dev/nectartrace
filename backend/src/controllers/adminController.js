const prisma = require('../config/db');

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    const users = await prisma.user.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/cooperative
async function assignCooperative(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.params.id);
    const { cooperativeId } = req.body;
    const parsedCooperativeId = parsePositiveInteger(cooperativeId);

    if (!userId || !parsedCooperativeId) {
      return res.status(400).json({
        success: false,
        message: 'User and cooperative IDs must be positive integers',
      });
    }
    if (rejectSelfManagement(req, res, userId, 'assign a cooperative to')) return;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (targetUser.role !== 'COOPERATIVE_STAFF') {
      return res.status(400).json({
        success: false,
        message: 'Only cooperative staff accounts can be assigned to a cooperative',
      });
    }

    const coop = await prisma.cooperative.findUnique({
      where: { id: parsedCooperativeId },
    });
    if (!coop) {
      return res.status(404).json({
        success: false,
        message: 'Cooperative not found',
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { cooperativeId: parsedCooperativeId },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        cooperativeId: true,
        cooperative: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/role
async function changeUserRole(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.params.id);
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID must be a positive integer' });
    }
    if (rejectSelfManagement(req, res, userId, 'change the role of')) return;

    const allowed = ['FARMER', 'COOPERATIVE_STAFF', 'BUYER', 'ADMIN'];
    if (!allowed.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowed.join(', ')}`,
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        role,
        cooperativeId: null,
      },
      select: { id: true, name: true, role: true, cooperativeId: true },
    });

    res.json({ success: true, data: user });
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
// Create a cooperative AND register it on-chain in one step
async function createCooperative(req, res, next) {
  try {
    const { name, village, county, walletAddress, registrationNumber, phone } = req.body;

    if (!name || !village || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'name, village, and walletAddress are required',
      });
    }

    // Check wallet isn't already used
    const existing = await prisma.cooperative.findUnique({
      where: { walletAddress },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A cooperative with this wallet already exists',
      });
    }

    // Register on-chain
    const blockchain = require('../config/blockchain');
    let blockchainTx;
    try {
      const contract = blockchain.getContract();
      const tx = await contract.addCooperative(walletAddress);
      const receipt = await tx.wait();
      blockchainTx = receipt.hash;
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: 'Failed to register cooperative on blockchain',
        error: err.message,
      });
    }

    // Save to database
    const coop = await prisma.cooperative.create({
      data: {
        name,
        village,
        county: county || 'Baringo',
        walletAddress,
        registrationNumber: registrationNumber || null,
        phone: phone || null,
      },
    });

    res.status(201).json({
      success: true,
      data: coop,
      blockchainTx,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/stats
async function getPlatformStats(req, res, next) {
  try {
    const [users, cooperatives, batches, listings, orders] = await Promise.all([
      prisma.user.count(),
      prisma.cooperative.count(),
      prisma.honeyBatch.count(),
      prisma.listing.count(),
      prisma.order.count(),
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
        totalWeightKg: totalWeight._sum.weightKg || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  assignCooperative,
  changeUserRole,
  toggleUserActive,
  createCooperative,
  getPlatformStats,
};
