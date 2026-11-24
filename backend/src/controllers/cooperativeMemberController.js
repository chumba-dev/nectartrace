const prisma = require('../config/db');
const {
  normalizeEmail,
  phoneLookupCandidates,
} = require('../utils/normalization');

const ASSIGNABLE_ROLES = ['MANAGER', 'STAFF'];
const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      cooperativeId: true,
    },
  },
};

class MembershipError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findUserByIdentifier(client, identifier) {
  if (typeof identifier !== 'string' || !identifier.trim()) return null;
  const email = normalizeEmail(identifier);
  if (email) {
    return client.user.findUnique({
      where: { email },
      include: { cooperativeMembership: true },
    });
  }

  for (const phone of phoneLookupCandidates(identifier)) {
    const user = await client.user.findUnique({
      where: { phone },
      include: { cooperativeMembership: true },
    });
    if (user) return user;
  }
  return null;
}

function canAssignRole(actorRole, role) {
  return actorRole === 'OWNER'
    ? ASSIGNABLE_ROLES.includes(role)
    : actorRole === 'MANAGER' && role === 'STAFF';
}

function handleMembershipError(err, res, next) {
  if (err instanceof MembershipError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  if (err?.code === 'P2002' || err?.code === 'P2034') {
    return res.status(409).json({
      success: false,
      message: 'The user already belongs to a cooperative',
    });
  }
  return next(err);
}

async function listMembers(req, res, next) {
  try {
    const memberships = await prisma.cooperativeMembership.findMany({
      where: { cooperativeId: req.cooperativeMembership.cooperativeId },
      include: memberInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return res.json({ success: true, data: memberships });
  } catch (err) {
    return next(err);
  }
}

async function addMember(req, res, next) {
  try {
    const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
    const role = req.body.role;
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'identifier is required' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'role must be MANAGER or STAFF',
      });
    }
    if (!canAssignRole(req.cooperativeMembership.role, role)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot assign this cooperative role',
      });
    }

    const target = await findUserByIdentifier(prisma, identifier);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.id === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot add yourself' });
    }
    if (target.role !== 'COOPERATIVE_STAFF' || !target.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Target must be an active cooperative staff account',
      });
    }
    if (target.cooperativeId || target.cooperativeMembership) {
      return res.status(409).json({
        success: false,
        message: 'The user already belongs to a cooperative',
      });
    }

    const membership = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: target.id },
        include: { cooperativeMembership: true },
      });
      if (
        !current
        || current.role !== 'COOPERATIVE_STAFF'
        || !current.isActive
        || current.cooperativeId
        || current.cooperativeMembership
      ) {
        throw new MembershipError(409, 'The user is no longer eligible for membership');
      }

      const created = await tx.cooperativeMembership.create({
        data: {
          cooperativeId: req.cooperativeMembership.cooperativeId,
          userId: current.id,
          role,
          isActive: true,
          invitedByUserId: req.user.id,
        },
        include: memberInclude,
      });
      const synced = await tx.user.updateMany({
        where: {
          id: current.id,
          role: 'COOPERATIVE_STAFF',
          cooperativeId: null,
        },
        data: { cooperativeId: req.cooperativeMembership.cooperativeId },
      });
      if (synced.count !== 1) {
        throw new MembershipError(409, 'The user is no longer eligible for membership');
      }
      return created;
    });

    return res.status(201).json({ success: true, data: membership });
  } catch (err) {
    return handleMembershipError(err, res, next);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.params.userId);
    const role = req.body.role;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId must be a positive integer' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'role must be MANAGER or STAFF',
      });
    }
    if (userId === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot change your own role' });
    }

    const membership = await prisma.cooperativeMembership.findFirst({
      where: { cooperativeId: req.cooperativeMembership.cooperativeId, userId },
      include: memberInclude,
    });
    if (!membership) {
      return res.status(404).json({ success: false, message: 'Cooperative member not found' });
    }
    const actorRole = req.cooperativeMembership.role;
    const permitted = actorRole === 'OWNER'
      ? membership.role !== 'OWNER'
      : actorRole === 'MANAGER' && membership.role === 'STAFF' && role === 'STAFF';
    if (!permitted) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change this member role',
      });
    }

    const updated = membership.role === role
      ? membership
      : await prisma.cooperativeMembership.update({
        where: { id: membership.id },
        data: { role },
        include: memberInclude,
      });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return handleMembershipError(err, res, next);
  }
}

async function updateMemberActive(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.params.userId);
    const { isActive } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId must be a positive integer' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    }
    if (userId === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot change your own membership' });
    }

    const membership = await prisma.cooperativeMembership.findFirst({
      where: { cooperativeId: req.cooperativeMembership.cooperativeId, userId },
      include: memberInclude,
    });
    if (!membership) {
      return res.status(404).json({ success: false, message: 'Cooperative member not found' });
    }
    const actorRole = req.cooperativeMembership.role;
    const permitted = actorRole === 'OWNER'
      || (actorRole === 'MANAGER' && membership.role === 'STAFF');
    if (!permitted) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change this membership',
      });
    }

    const updated = membership.isActive === isActive
      ? membership
      : await prisma.cooperativeMembership.update({
        where: { id: membership.id },
        data: { isActive },
        include: memberInclude,
      });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return handleMembershipError(err, res, next);
  }
}

module.exports = {
  addMember,
  listMembers,
  updateMemberActive,
  updateMemberRole,
};
