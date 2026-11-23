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
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (req.user.role === 'ADMIN') return next();

    if (
      req.user.role !== 'COOPERATIVE_STAFF'
      || req.user.isActive === false
      || !req.user.cooperativeId
    ) {
      return res.status(403).json({
        success: false,
        message: 'A verified cooperative assignment is required',
        code: 'COOPERATIVE_NOT_VERIFIED',
      });
    }

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: req.user.cooperativeId },
      select: { id: true, isVerified: true },
    });
    if (!cooperative?.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'A verified cooperative assignment is required',
        code: 'COOPERATIVE_NOT_VERIFIED',
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate, authorize, requireVerifiedCooperative };
