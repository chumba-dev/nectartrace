const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/db');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const token = header.substring(7);
    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        cooperativeId: true,
        walletAddress: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }

    next();
  };
}

async function requireVerifiedCooperative(req, res, next) {
  if (req.user?.role === 'ADMIN') return next();
  return requireActiveCooperativeMembership(req, res, next);
}

async function requireActiveCooperativeMembership(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (
      req.user.role !== 'COOPERATIVE_STAFF'
      || req.user.isActive === false
    ) {
      return res.status(403).json({
        success: false,
        message: 'A verified cooperative assignment is required',
        code: 'COOPERATIVE_NOT_VERIFIED',
      });
    }

    const membership = await prisma.cooperativeMembership.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        cooperativeId: true,
        userId: true,
        role: true,
        isActive: true,
        cooperative: {
          select: { id: true, name: true, isVerified: true },
        },
      },
    });
    if (!membership?.isActive || !membership.cooperative?.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'A verified cooperative assignment is required',
        code: 'COOPERATIVE_NOT_VERIFIED',
      });
    }

    req.cooperativeMembership = membership;
    req.cooperative = membership.cooperative;
    req.user.cooperativeId = membership.cooperativeId;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function attachActiveMembershipForCooperativeStaff(req, res, next) {
  if (req.user?.role !== 'COOPERATIVE_STAFF') return next();
  return requireActiveCooperativeMembership(req, res, next);
}

module.exports = {
  attachActiveMembershipForCooperativeStaff,
  authenticate,
  authorize,
  requireActiveCooperativeMembership,
  requireVerifiedCooperative,
};
