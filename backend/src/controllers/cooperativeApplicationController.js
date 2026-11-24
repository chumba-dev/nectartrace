const { ethers } = require('ethers');
const prisma = require('../config/db');
const blockchain = require('../config/blockchain');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const APPLICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const applicationSelect = {
  id: true,
  applicantId: true,
  name: true,
  village: true,
  ward: true,
  county: true,
  walletAddress: true,
  registrationNumber: true,
  phone: true,
  commissionPercent: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  cooperativeId: true,
  createdAt: true,
  updatedAt: true,
};

class ApplicationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredText(value, name, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApplicationError(400, `${name} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApplicationError(400, `${name} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

function parseApplicationInput(body) {
  const walletAddress = requiredText(body.walletAddress, 'walletAddress', 100);
  if (!ethers.isAddress(walletAddress)) {
    throw new ApplicationError(400, 'walletAddress must be a valid Ethereum address');
  }

  const rawCommission = body.commissionPercent === undefined ? 0 : body.commissionPercent;
  if (
    !['number', 'string'].includes(typeof rawCommission)
    || String(rawCommission).trim() === ''
  ) {
    throw new ApplicationError(400, 'commissionPercent must be between 0 and 100');
  }
  const commissionPercent = Number(rawCommission);
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new ApplicationError(400, 'commissionPercent must be between 0 and 100');
  }

  return {
    name: requiredText(body.name, 'name', 200),
    village: requiredText(body.village, 'village', 120),
    ward: requiredText(body.ward, 'ward', 120),
    county: body.county === undefined
      ? 'Baringo'
      : requiredText(body.county, 'county', 120),
    walletAddress: ethers.getAddress(walletAddress),
    registrationNumber: requiredText(body.registrationNumber, 'registrationNumber', 120),
    phone: requiredText(body.phone, 'phone', 40),
    commissionPercent,
  };
}

async function findCooperativeConflict(client, input) {
  return client.cooperative.findFirst({
    where: {
      OR: [
        { name: { equals: input.name, mode: 'insensitive' } },
        { walletAddress: { equals: input.walletAddress, mode: 'insensitive' } },
        { registrationNumber: { equals: input.registrationNumber, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
}

function handleApplicationError(err, res, next) {
  if (err instanceof ApplicationError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  if (err?.code === 'P2002' || err?.code === 'P2034') {
    return res.status(409).json({
      success: false,
      message: 'The application conflicts with an existing cooperative or membership',
    });
  }
  return next(err);
}

async function createApplication(req, res, next) {
  try {
    const input = parseApplicationInput(req.body);
    const application = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user.id} FOR UPDATE`;
      const applicant = await tx.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          role: true,
          isActive: true,
          cooperativeId: true,
          cooperativeMembership: { select: { id: true, isActive: true } },
        },
      });
      if (!applicant || applicant.role !== 'COOPERATIVE_STAFF' || !applicant.isActive) {
        throw new ApplicationError(403, 'An active cooperative staff account is required');
      }
      if (applicant.cooperativeId || applicant.cooperativeMembership) {
        throw new ApplicationError(409, 'You already belong to a cooperative');
      }

      const pending = await tx.cooperativeApplication.findFirst({
        where: { applicantId: applicant.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) {
        throw new ApplicationError(409, 'You already have a pending cooperative application');
      }
      if (await findCooperativeConflict(tx, input)) {
        throw new ApplicationError(409, 'A cooperative with these details already exists');
      }

      const created = await tx.cooperativeApplication.create({
        data: { applicantId: applicant.id, ...input, status: 'PENDING' },
        select: applicationSelect,
      });
      await notificationService.notifyActiveAdmins({
        client: tx,
        type: 'COOPERATIVE_APPLICATION_SUBMITTED',
        title: 'New cooperative application',
        message: `${created.name} submitted a cooperative application for review.`,
        entityType: 'CooperativeApplication',
        entityId: created.id,
      });
      return created;
    });

    return res.status(201).json({ success: true, data: application });
  } catch (err) {
    return handleApplicationError(err, res, next);
  }
}

async function getMyApplications(req, res, next) {
  try {
    const applications = await prisma.cooperativeApplication.findMany({
      where: { applicantId: req.user.id },
      select: {
        ...applicationSelect,
        cooperative: {
          select: { id: true, name: true, isVerified: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return res.json({
      success: true,
      data: {
        current: applications.find((application) => application.status === 'PENDING') || null,
        applications,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listApplications(req, res, next) {
  try {
    const status = req.query.status;
    if (status !== undefined && !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${APPLICATION_STATUSES.join(', ')}`,
      });
    }
    const applications = await prisma.cooperativeApplication.findMany({
      where: status ? { status } : {},
      select: {
        ...applicationSelect,
        reviewedById: true,
        applicant: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            walletAddress: true,
            isActive: true,
          },
        },
        reviewedBy: { select: { id: true, name: true } },
        cooperative: { select: { id: true, name: true, isVerified: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return res.json({ success: true, data: applications });
  } catch (err) {
    return next(err);
  }
}

async function loadPendingApplication(applicationId) {
  const application = await prisma.cooperativeApplication.findUnique({
    where: { id: applicationId },
    include: {
      applicant: {
        select: {
          id: true,
          role: true,
          isActive: true,
          cooperativeId: true,
          cooperativeMembership: { select: { id: true } },
        },
      },
    },
  });
  if (!application) throw new ApplicationError(404, 'Cooperative application not found');
  if (application.status !== 'PENDING') {
    throw new ApplicationError(409, `Application is already ${application.status.toLowerCase()}`);
  }
  if (
    !application.applicant.isActive
    || application.applicant.role !== 'COOPERATIVE_STAFF'
    || application.applicant.cooperativeId
    || application.applicant.cooperativeMembership
  ) {
    throw new ApplicationError(409, 'The applicant is no longer eligible to own a cooperative');
  }
  if (await findCooperativeConflict(prisma, application)) {
    throw new ApplicationError(409, 'The application conflicts with an existing cooperative');
  }
  return application;
}

async function approveApplication(req, res, next) {
  const applicationId = parsePositiveInteger(req.params.id);
  if (!applicationId) {
    return res.status(400).json({
      success: false,
      message: 'Application id must be a positive integer',
    });
  }

  try {
    const pending = await loadPendingApplication(applicationId);
    let blockchainResult;
    try {
      blockchainResult = await blockchain.addCooperativeOnChain(pending.walletAddress);
    } catch (err) {
      logger.error('Cooperative application blockchain role grant failed', { applicationId });
      return res.status(502).json({
        success: false,
        message: 'Failed to grant the cooperative blockchain role',
      });
    }

    const reviewedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CooperativeApplication" WHERE "id" = ${applicationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${pending.applicantId} FOR UPDATE`;
      const current = await tx.cooperativeApplication.findUnique({
        where: { id: applicationId },
        include: {
          applicant: {
            select: {
              id: true,
              role: true,
              isActive: true,
              cooperativeId: true,
              cooperativeMembership: { select: { id: true } },
            },
          },
        },
      });
      if (!current || current.status !== 'PENDING') {
        throw new ApplicationError(409, 'The application is no longer pending');
      }
      if (
        !current.applicant.isActive
        || current.applicant.role !== 'COOPERATIVE_STAFF'
        || current.applicant.cooperativeId
        || current.applicant.cooperativeMembership
      ) {
        throw new ApplicationError(409, 'The applicant is no longer eligible to own a cooperative');
      }
      if (await findCooperativeConflict(tx, current)) {
        throw new ApplicationError(409, 'The application conflicts with an existing cooperative');
      }

      const cooperative = await tx.cooperative.create({
        data: {
          name: current.name,
          village: current.village,
          ward: current.ward,
          county: current.county,
          walletAddress: current.walletAddress,
          registrationNumber: current.registrationNumber,
          phone: current.phone,
          commissionPercent: current.commissionPercent,
          isVerified: true,
          verifiedAt: reviewedAt,
        },
      });
      const membership = await tx.cooperativeMembership.create({
        data: {
          cooperativeId: cooperative.id,
          userId: current.applicantId,
          role: 'OWNER',
          isActive: true,
          invitedByUserId: null,
        },
      });
      const synced = await tx.user.updateMany({
        where: {
          id: current.applicantId,
          role: 'COOPERATIVE_STAFF',
          isActive: true,
          cooperativeId: null,
        },
        data: { cooperativeId: cooperative.id },
      });
      if (synced.count !== 1) {
        throw new ApplicationError(409, 'The applicant changed before approval completed');
      }
      const application = await tx.cooperativeApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          rejectionReason: null,
          reviewedById: req.user.id,
          reviewedAt,
          cooperativeId: cooperative.id,
        },
        select: applicationSelect,
      });
      await notificationService.createForUsers({
        client: tx,
        userIds: [current.applicantId],
        type: 'COOPERATIVE_APPLICATION_APPROVED',
        title: 'Cooperative application approved',
        message: `${current.name} has been approved and is ready to operate.`,
        entityType: 'CooperativeApplication',
        entityId: current.id,
      });
      return { application, cooperative, membership };
    });

    return res.json({
      success: true,
      data: { ...result, blockchain: blockchainResult },
    });
  } catch (err) {
    return handleApplicationError(err, res, next);
  }
}

async function rejectApplication(req, res, next) {
  const applicationId = parsePositiveInteger(req.params.id);
  if (!applicationId) {
    return res.status(400).json({
      success: false,
      message: 'Application id must be a positive integer',
    });
  }
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 1000) {
    return res.status(400).json({
      success: false,
      message: 'reason is required and must not exceed 1000 characters',
    });
  }

  try {
    const reviewedAt = new Date();
    const application = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CooperativeApplication" WHERE "id" = ${applicationId} FOR UPDATE`;
      const current = await tx.cooperativeApplication.findUnique({ where: { id: applicationId } });
      if (!current) throw new ApplicationError(404, 'Cooperative application not found');
      if (current.status !== 'PENDING') {
        throw new ApplicationError(409, `Application is already ${current.status.toLowerCase()}`);
      }
      const updated = await tx.cooperativeApplication.update({
        where: { id: applicationId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          reviewedById: req.user.id,
          reviewedAt,
          cooperativeId: null,
        },
        select: applicationSelect,
      });
      await notificationService.createForUsers({
        client: tx,
        userIds: [current.applicantId],
        type: 'COOPERATIVE_APPLICATION_REJECTED',
        title: 'Cooperative application rejected',
        message: `${current.name} was not approved. Review the reason and submit a new application if needed.`,
        entityType: 'CooperativeApplication',
        entityId: current.id,
      });
      return updated;
    });
    return res.json({ success: true, data: application });
  } catch (err) {
    return handleApplicationError(err, res, next);
  }
}

module.exports = {
  approveApplication,
  createApplication,
  getMyApplications,
  listApplications,
  rejectApplication,
};
