const crypto = require('crypto');
const prisma = require('../config/db');
const logger = require('../utils/logger');
const menu = require('./ussdMenu');
const smsService = require('./smsService');
const { phoneLookupCandidates } = require('../utils/normalization');

/**
 * Find user by phone number
 */
async function findUserByPhone(phoneNumber) {
  for (const phone of phoneLookupCandidates(phoneNumber)) {
    const user = await prisma.user.findUnique({
      where: { phone },
      include: { cooperative: true },
    });
    if (user) return user;
  }

  return null;
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
 * Handle "Offer harvest to cooperative" option (4)
 */
async function handleHarvestOffer(inputs, phoneNumber, sessionId) {
  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    return menu.errorMessage(
      'Phone not registered. Please contact your cooperative.'
    );
  }

  if (
    !user.isActive
    || user.role !== 'FARMER'
  ) {
    return menu.errorMessage(
      'Only active farmer accounts can submit harvest offers.'
    );
  }

  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalizedSessionId) {
    return menu.errorMessage('Invalid USSD session.');
  }

  const existingOffer = await prisma.harvestOffer.findUnique({
    where: { ussdSessionId: normalizedSessionId },
    include: { cooperative: true },
  });
  if (existingOffer) {
    if (existingOffer.farmerId !== user.id) {
      return menu.errorMessage('This USSD session cannot be used for this account.');
    }
    return menu.offerConfirmation(existingOffer.reference, existingOffer.cooperative.name);
  }

  if (inputs.length === 1) {
    return menu.askPickupVillage();
  }

  const pickupVillage = typeof inputs[1] === 'string' ? inputs[1].trim() : '';
  if (pickupVillage.length < 2 || pickupVillage.length > 80) {
    return menu.errorMessage('Enter a valid village or pickup area.');
  }

  const allCooperatives = await prisma.cooperative.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, village: true },
  });
  const normalizedVillage = pickupVillage.toLowerCase();
  const cooperatives = allCooperatives
    .sort((left, right) => {
      const leftNearby = left.village.toLowerCase() === normalizedVillage ? 0 : 1;
      const rightNearby = right.village.toLowerCase() === normalizedVillage ? 0 : 1;
      return leftNearby - rightNearby || left.name.localeCompare(right.name);
    })
    .slice(0, 9);
  if (cooperatives.length === 0) {
    return menu.errorMessage('No cooperatives are currently available.');
  }
  if (inputs.length === 2) {
    return menu.cooperativeSelection(cooperatives, pickupVillage);
  }

  const selectedIndex = Number(inputs[2]);
  if (!/^\d+$/.test(inputs[2] || '') || selectedIndex < 1 || selectedIndex > cooperatives.length) {
    return menu.errorMessage('Invalid cooperative selection.');
  }
  const cooperative = cooperatives[selectedIndex - 1];
  if (inputs.length === 3) {
    return menu.askOfferWeight(cooperative.name);
  }

  const offeredWeightKg = Number(inputs[3]);
  if (!Number.isFinite(offeredWeightKg) || offeredWeightKg <= 0) {
    return menu.errorMessage('Invalid weight. Please enter a positive number.');
  }
  if (inputs.length === 4) {
    return menu.askExpectedPrice(offeredWeightKg);
  }

  const expectedPriceText = String(inputs[4] ?? '').trim();
  const expectedPricePerKg = expectedPriceText === '' || expectedPriceText === '0'
    ? null
    : Number(expectedPriceText);
  if (expectedPricePerKg !== null
    && (!Number.isFinite(expectedPricePerKg) || expectedPricePerKg <= 0)) {
    return menu.errorMessage('Expected price must be positive, or enter 0 to skip.');
  }
  if (inputs.length === 5) {
    return menu.askSettlementType();
  }

  const settlementTypes = {
    1: 'DIRECT_PURCHASE',
    2: 'CONSIGNMENT',
  };
  const settlementType = settlementTypes[inputs[5]];
  if (!settlementType || inputs.length !== 6) {
    return menu.errorMessage('Invalid settlement type. Select 1 or 2.');
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reference = `NTO-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  let offer;
  try {
    offer = await prisma.harvestOffer.create({
      data: {
        reference,
        ussdSessionId: normalizedSessionId,
        farmerId: user.id,
        cooperativeId: cooperative.id,
        pickupVillage,
        offeredWeightKg,
        expectedPricePerKg,
        settlementType,
      },
      include: { cooperative: true },
    });
  } catch (err) {
    if (err.code !== 'P2002') throw err;

    offer = await prisma.harvestOffer.findUnique({
      where: { ussdSessionId: normalizedSessionId },
      include: { cooperative: true },
    });
    if (!offer || offer.farmerId !== user.id) throw err;
    return menu.offerConfirmation(offer.reference, offer.cooperative.name);
  }

  smsService
    .sendHarvestOfferConfirmation(phoneNumber, offer.reference, offer.cooperative.name)
    .catch((err) => logger.error('Offer confirmation SMS failed', { error: err.message }));

  return menu.offerConfirmation(offer.reference, offer.cooperative.name);
}

module.exports = {
  handleLogHarvest,
  handleCheckPrice,
  handleMyAccount,
  handleHarvestOffer,
  findUserByPhone,
};
