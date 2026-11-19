const prisma = require('../config/db');
const logger = require('../utils/logger');
const menu = require('./ussdMenu');
const smsService = require('./smsService');

/**
 * Find user by phone number
 */
async function findUserByPhone(phoneNumber) {
  // Normalize phone (Africa's Talking sends +254...)
  const normalized = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+${phoneNumber}`;

  return prisma.user.findUnique({
    where: { phone: normalized },
    include: { cooperative: true },
  });
}

/**
 * Handle "Log harvest" option (1)
 */
async function handleLogHarvest(inputs, phoneNumber, sessionId) {
  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    return menu.errorMessage(
      'Phone not registered. Please contact your cooperative.'
    );
  }

  // Level 1: user just chose option 1
  if (inputs.length === 1) {
    return menu.askHarvestWeight();
  }

  // Level 2: user entered weight
  if (inputs.length === 2) {
    const weightKg = parseFloat(inputs[1]);

    if (isNaN(weightKg) || weightKg <= 0 || weightKg > 10000) {
      return menu.errorMessage('Invalid weight. Please enter a number.');
    }

    // Save harvest
    await prisma.harvestLog.create({
      data: {
        userId: user.id,
        weightKg,
        loggedVia: 'USSD',
      },
    });

    // Calculate total this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const totalResult = await prisma.harvestLog.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: startOfMonth },
      },
      _sum: { weightKg: true },
    });

    const totalThisMonth = totalResult._sum.weightKg || 0;

    // Send SMS asynchronously (don't block USSD)
    smsService
      .sendHarvestConfirmation(phoneNumber, weightKg, totalThisMonth)
      .catch((err) => logger.error('SMS failed', { error: err.message }));

    return menu.harvestConfirmation(weightKg, totalThisMonth);
  }

  return menu.errorMessage('Invalid input');
}

/**
 * Handle "Check market price" option (2)
 */
async function handleCheckPrice(phoneNumber) {
  const latest = await prisma.priceHistory.findFirst({
    where: { grade: 'A' },
    orderBy: { recordedAt: 'desc' },
  });

  const gradeA = latest?.pricePerKg || 750;
  const gradeB = 550;

  return menu.marketPrice(gradeA, gradeB);
}

/**
 * Handle "My account" option (3)
 */
async function handleMyAccount(phoneNumber) {
  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    return menu.errorMessage(
      'Phone not registered. Please contact your cooperative.'
    );
  }

  // Total this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const totalResult = await prisma.harvestLog.aggregate({
    where: {
      userId: user.id,
      createdAt: { gte: startOfMonth },
    },
    _sum: { weightKg: true },
  });

  const totalWeightKg = totalResult._sum.weightKg || 0;

  // Estimate earnings at current price
  const latestPrice = await prisma.priceHistory.findFirst({
    where: { grade: 'A' },
    orderBy: { recordedAt: 'desc' },
  });
  const pricePerKg = latestPrice?.pricePerKg || 750;
  const estimatedEarnings = Math.round(totalWeightKg * pricePerKg);

  return menu.accountSummary(
    user,
    totalWeightKg,
    estimatedEarnings,
    user.cooperative?.name
  );
}

/**
 * Handle "List honey for sale" option (4)
 */
async function handleListHoney(inputs, phoneNumber) {
  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    return menu.errorMessage(
      'Phone not registered. Please contact your cooperative.'
    );
  }

  if (
    !user.isActive
    || user.role !== 'COOPERATIVE_STAFF'
    || !user.cooperativeId
    || !user.cooperative
  ) {
    return menu.errorMessage(
      'Only active cooperative staff linked to a cooperative can list honey.'
    );
  }

  return menu.errorMessage(
    'Use the NectarTrace web dashboard to add the required honey photo and publish a listing.'
  );
}

module.exports = {
  handleLogHarvest,
  handleCheckPrice,
  handleMyAccount,
  handleListHoney,
  findUserByPhone,
};
