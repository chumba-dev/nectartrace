const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const logger = require('../utils/logger');
const Offer = require('../models/Offer');
const menu = require('./ussdMenu');
const sessionService = require('./ussdSessionService');
const smsService = require('./smsService');
const { BARINGO_WARDS, USSD_PAGE_SIZE } = require('../config/baringoAreas');
const {
  normalizePhone,
  phoneLookupCandidates,
} = require('../utils/normalization');

const OFFER_LIFETIME_MS = 48 * 60 * 60 * 1000;
const OPT_IN_STEPS = new Set(['optin_name', 'optin_ward', 'optin_consent', 'optin_pin']);

function userSelect(includePin = false) {
  return {
    id: true,
    name: true,
    role: true,
    cooperativeId: true,
    ward: true,
    farmerVerifiedAt: true,
    mpesaNumber: true,
    isActive: true,
    ...(includePin ? { ussdPinHash: true } : {}),
    cooperative: { select: { id: true, name: true } },
  };
}

async function findUserByPhone(phoneNumber, { includePin = false } = {}) {
  for (const phone of phoneLookupCandidates(phoneNumber)) {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: userSelect(includePin),
    });
    if (user) return user;
  }
  return null;
}

function isActiveFarmer(user) {
  return Boolean(user && user.isActive && user.role === 'FARMER');
}

function cleanSingleLine(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function parseFiniteInput(value) {
  const input = String(value ?? '').trim();
  if (!input) return NaN;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function compactNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  if (Math.abs(parsed) >= 1e9) return parsed.toExponential(2);
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function maskPhone(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  return `******${normalized.slice(-4)}`;
}

function normalizeKenyanPhone(value) {
  const normalized = normalizePhone(value);
  return normalized && /^\+254\d{9}$/.test(normalized) ? normalized : null;
}

function wardLabels() {
  return BARINGO_WARDS.map((area) => `${area.ward} (${area.subCounty})`);
}

function pageChoice(input, page, itemCount) {
  if (!/^[1-4]$/.test(input)) return null;
  const index = page * USSD_PAGE_SIZE + Number(input) - 1;
  return index < itemCount ? index : null;
}

function hasMore(itemCount, page) {
  return itemCount > (page + 1) * USSD_PAGE_SIZE;
}

function setMain(runtime, error) {
  runtime.step = 'main';
  runtime.context = { userId: runtime.farmer.id };
  runtime.response = menu.mainMenu(error);
}

function finish(runtime, response) {
  runtime.step = 'terminal';
  runtime.context = {};
  runtime.terminal = true;
  runtime.response = response;
}

function renderWardList(runtime, kind, error) {
  const pageKey = kind === 'optin' ? 'wardPage' : 'offerWardPage';
  const page = Number(runtime.context[pageKey]) || 0;
  runtime.response = menu.numberedList({
    title: 'Select ward / sub-county:',
    items: wardLabels(),
    page,
    error,
  });
}

function cooperativeLabels(options) {
  return options.map((cooperative) => cooperative.name);
}

function renderCooperatives(runtime, error) {
  const offer = runtime.context.offer;
  const options = offer.cooperativeOptions || [];
  if (options.length === 0) {
    runtime.response = menu.con([
      ...(error ? [menu.safeText(error, 44)] : []),
      `No verified cooperatives in ${menu.safeText(offer.ward, 34)}.`,
      '0 Back',
    ]);
    return;
  }
  runtime.response = menu.numberedList({
    title: 'Verified cooperatives:',
    items: cooperativeLabels(options),
    page: offer.cooperativePage || 0,
    error,
  });
}

function renderOfferHistory(runtime, error) {
  const history = runtime.context.offerHistory || { items: [], page: 0, hasMore: false };
  if (history.items.length === 0) {
    runtime.response = menu.con([
      ...(error ? [menu.safeText(error, 44)] : []),
      'No offers found.',
      '0 Back',
    ]);
    return;
  }
  const lines = [
    ...(error ? [menu.safeText(error, 28)] : []),
    `My offers (page ${history.page + 1}):`,
    ...history.items.map((offer, index) => (
      `${index + 1} ${menu.safeText(offer.reference, 22)} ${menu.safeText(offer.status, 10)}`
    )),
    ...(history.hasMore ? ['98 More'] : []),
    '0 Back',
  ];
  runtime.response = menu.con(lines);
}

async function initializeRuntime(phoneNumber) {
  const user = await findUserByPhone(phoneNumber);
  if (!user) {
    return {
      step: 'optin_name',
      context: {},
      terminal: false,
      farmer: null,
      response: menu.optInName(),
    };
  }
  if (!isActiveFarmer(user)) {
    return {
      step: 'terminal',
      context: {},
      terminal: true,
      farmer: null,
      response: menu.end('This service is only available to active farmer accounts.'),
    };
  }
  return {
    step: 'main',
    context: { userId: user.id },
    terminal: false,
    farmer: user,
    response: menu.mainMenu(),
  };
}

async function restoreRuntime(session, data, phoneNumber) {
  if (!session.currentStep) return initializeRuntime(phoneNumber);

  const runtime = {
    step: session.currentStep,
    context: data.context || {},
    terminal: Boolean(data.terminal),
    farmer: null,
    response: data.cachedResponse,
  };
  if (!OPT_IN_STEPS.has(runtime.step) && !runtime.terminal) {
    const user = await findUserByPhone(phoneNumber);
    if (!isActiveFarmer(user) || user.id !== runtime.context.userId) {
      finish(runtime, menu.end('Your farmer account is unavailable or inactive.'));
    } else {
      runtime.farmer = user;
    }
  }
  return runtime;
}

async function createOptInFarmer(runtime, phoneNumber, pinValue) {
  const pinHash = await bcrypt.hash(pinValue, 10);
  const now = new Date();
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: runtime.context.optInName,
        phone: phoneNumber,
        email: null,
        passwordHash: null,
        role: 'FARMER',
        ward: runtime.context.ward,
        dataConsentAt: now,
        ussdPinHash: pinHash,
        farmerVerifiedAt: null,
        isActive: true,
      },
      select: { id: true, role: true, isActive: true },
    });
  } catch (err) {
    if (err?.code !== 'P2002') throw err;
    user = await findUserByPhone(phoneNumber);
  }

  if (!isActiveFarmer(user)) {
    finish(runtime, menu.end('An account already uses this number and cannot opt in.'));
    return;
  }
  finish(runtime, menu.end('Registration complete. Dial again to use NectarTrace.'));
}

async function handleOptIn(runtime, input, phoneNumber) {
  if (runtime.step === 'optin_name') {
    const name = cleanSingleLine(input, 121);
    if (name.length < 2 || name.length > 120) {
      runtime.response = menu.optInName('Name must contain 2 to 120 characters.');
      return { sensitive: true };
    }
    runtime.context = { optInName: name, wardPage: 0 };
    runtime.step = 'optin_ward';
    renderWardList(runtime, 'optin');
    return { sensitive: true };
  }

  if (runtime.step === 'optin_ward') {
    const value = input.trim();
    if (value === '0') {
      runtime.step = 'optin_name';
      runtime.context = {};
      runtime.response = menu.optInName();
      return {};
    }
    if (value === '98') {
      if (hasMore(BARINGO_WARDS.length, runtime.context.wardPage || 0)) {
        runtime.context.wardPage = (runtime.context.wardPage || 0) + 1;
        renderWardList(runtime, 'optin');
      } else {
        renderWardList(runtime, 'optin', 'No more choices.');
      }
      return {};
    }
    const selectedIndex = pageChoice(
      value,
      runtime.context.wardPage || 0,
      BARINGO_WARDS.length
    );
    if (selectedIndex === null) {
      renderWardList(runtime, 'optin', 'Invalid choice.');
      return {};
    }
    runtime.context.ward = BARINGO_WARDS[selectedIndex].ward;
    runtime.step = 'optin_consent';
    runtime.response = menu.consent();
    return {};
  }

  if (runtime.step === 'optin_consent') {
    const value = input.trim();
    if (value === '0') {
      delete runtime.context.ward;
      runtime.step = 'optin_ward';
      renderWardList(runtime, 'optin');
    } else if (value === '1') {
      runtime.step = 'optin_pin';
      runtime.response = menu.pin();
    } else if (value === '2') {
      runtime.context = {};
      finish(runtime, menu.end('Consent declined. No farmer account was created.'));
    } else {
      runtime.response = menu.con([
        'Consent is required to opt in.',
        '1 Yes',
        '2 No',
        '0 Back',
      ]);
    }
    return {};
  }

  const value = input.trim();
  if (value === '0') {
    runtime.step = 'optin_consent';
    runtime.response = menu.consent();
    return { sensitive: true };
  }
  if (!/^\d{4}$/.test(value)) {
    runtime.response = menu.pin('PIN must be exactly 4 digits.');
    return { sensitive: true };
  }
  await createOptInFarmer(runtime, phoneNumber, value);
  return { sensitive: true };
}

async function readMarketPrice() {
  const latest = await prisma.priceHistory.findFirst({
    where: { grade: 'A' },
    orderBy: { recordedAt: 'desc' },
  });
  const gradeA = Number.isFinite(latest?.pricePerKg) ? latest.pricePerKg : 750;
  return menu.marketPrice(compactNumber(gradeA), '550');
}

async function recordHarvest(runtime, weightKg, phoneNumber, sessionId) {
  let created = false;
  try {
    await prisma.harvestLog.create({
      data: {
        userId: runtime.farmer.id,
        weightKg,
        loggedVia: 'USSD',
        ussdSessionId: sessionId,
      },
    });
    created = true;
  } catch (err) {
    if (err?.code !== 'P2002') throw err;
    const existing = await prisma.harvestLog.findUnique({
      where: { ussdSessionId: sessionId },
      select: { userId: true, weightKg: true },
    });
    if (!existing || existing.userId !== runtime.farmer.id || existing.weightKg !== weightKg) {
      throw err;
    }
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const totalResult = await prisma.harvestLog.aggregate({
    where: {
      userId: runtime.farmer.id,
      createdAt: { gte: startOfMonth },
    },
    _sum: { weightKg: true },
  });
  const total = Number(totalResult?._sum?.weightKg) || 0;

  if (created) {
    try {
      await smsService.sendHarvestConfirmation(phoneNumber, weightKg, total);
    } catch (err) {
      logger.warn('Harvest confirmation SMS failed');
    }
  }
  finish(runtime, menu.harvestConfirmation(compactNumber(weightKg), compactNumber(total)));
}

async function accountSummary(runtime) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [totalResult, latestPrice] = await Promise.all([
    prisma.harvestLog.aggregate({
      where: {
        userId: runtime.farmer.id,
        createdAt: { gte: startOfMonth },
      },
      _sum: { weightKg: true },
    }),
    prisma.priceHistory.findFirst({
      where: { grade: 'A' },
      orderBy: { recordedAt: 'desc' },
    }),
  ]);
  const totalWeightKg = Number(totalResult?._sum?.weightKg) || 0;
  const pricePerKg = Number.isFinite(latestPrice?.pricePerKg) ? latestPrice.pricePerKg : 750;
  return {
    name: runtime.farmer.name,
    ward: runtime.farmer.ward,
    cooperativeName: runtime.farmer.cooperative?.name,
    totalWeightKg: compactNumber(totalWeightKg),
    estimatedEarnings: compactNumber(Math.round(totalWeightKg * pricePerKg)),
    maskedMpesa: maskPhone(runtime.farmer.mpesaNumber),
  };
}

async function showAccount(runtime, error) {
  runtime.response = menu.accountSummary(await accountSummary(runtime), error);
}

async function handleAccount(runtime, input, phoneNumber) {
  const value = input.trim();
  if (runtime.step === 'account_menu') {
    if (value === '0') {
      setMain(runtime);
      return {};
    }
    if (value !== '1') {
      await showAccount(runtime, 'Choose 1 or 0.');
      return {};
    }
    const privateUser = await findUserByPhone(phoneNumber, { includePin: true });
    if (!privateUser?.ussdPinHash) {
      finish(runtime, menu.end('M-Pesa change unavailable because no USSD PIN is set.'));
      return {};
    }
    runtime.step = 'account_pin';
    runtime.response = menu.accountPin();
    return {};
  }

  if (runtime.step === 'account_pin') {
    if (value === '0') {
      runtime.step = 'account_menu';
      await showAccount(runtime);
      return { sensitive: true };
    }
    if (!/^\d{4}$/.test(value)) {
      runtime.response = menu.accountPin('PIN must be exactly 4 digits.');
      return { sensitive: true };
    }
    const privateUser = await findUserByPhone(phoneNumber, { includePin: true });
    if (!privateUser?.ussdPinHash) {
      finish(runtime, menu.end('M-Pesa change unavailable because no USSD PIN is set.'));
      return { sensitive: true };
    }
    let matches = false;
    try {
      matches = await bcrypt.compare(value, privateUser.ussdPinHash);
    } catch (err) {
      matches = false;
    }
    if (!matches) {
      runtime.response = menu.accountPin('Incorrect PIN. Try again.');
      return { sensitive: true };
    }
    runtime.step = 'account_mpesa';
    runtime.context.pinVerified = true;
    runtime.response = menu.mpesaNumber();
    return { sensitive: true };
  }

  if (value === '0') {
    delete runtime.context.pinVerified;
    runtime.step = 'account_menu';
    await showAccount(runtime);
    return {};
  }
  const mpesaNumber = normalizeKenyanPhone(value);
  if (!runtime.context.pinVerified || !mpesaNumber) {
    runtime.response = menu.mpesaNumber('Enter a valid Kenyan number.');
    return { sensitive: true };
  }
  const currentUser = await findUserByPhone(phoneNumber);
  const numberChanged = normalizeKenyanPhone(currentUser?.mpesaNumber) !== mpesaNumber;
  if (numberChanged) {
    await Offer.updateMany({
      farmerId: runtime.farmer.id,
      status: { $ne: 'paid' },
      paymentDetailsConfirmedAt: { $ne: null },
    }, {
      $set: { paymentDetailsConfirmedAt: null },
    }, { runValidators: true });
  }
  await prisma.user.update({
    where: { id: runtime.farmer.id },
    data: { mpesaNumber },
    select: { id: true },
  });
  finish(runtime, menu.end(`M-Pesa number updated: ${maskPhone(mpesaNumber)}.`));
  return { sensitive: true };
}

async function loadCooperatives(ward) {
  const cooperatives = await prisma.cooperative.findMany({
    where: { isVerified: true, ward },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      ward: true,
      isVerified: true,
      commissionPercent: true,
    },
  });
  return cooperatives
    .filter((cooperative) => cooperative.isVerified && cooperative.ward === ward)
    .map((cooperative) => ({
      id: cooperative.id,
      name: cleanSingleLine(cooperative.name, 120) || 'Cooperative',
      commissionPercent: Number(cooperative.commissionPercent) || 0,
    }));
}

function makeOfferReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `NTO-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function plainOffer(offer) {
  if (!offer) return null;
  return typeof offer.toObject === 'function' ? offer.toObject() : offer;
}

async function findOfferBySession(sessionId) {
  return plainOffer(await Offer.findOne({ ussdSessionId: sessionId }));
}

async function createMongoOffer(runtime, sessionId) {
  const selected = runtime.context.offer.selectedCooperative;
  const existing = await findOfferBySession(sessionId);
  if (existing) {
    if (existing.farmerId !== runtime.farmer.id) {
      throw new Error('USSD offer session ownership conflict');
    }
    return { offer: existing, cooperativeName: selected.name, created: false };
  }

  const cooperative = await prisma.cooperative.findUnique({
    where: { id: selected.id },
    select: {
      id: true,
      name: true,
      ward: true,
      isVerified: true,
      commissionPercent: true,
    },
  });
  if (!cooperative?.isVerified || cooperative.ward !== runtime.context.offer.ward) {
    return { unavailable: true };
  }
  const commissionPercent = Number(cooperative.commissionPercent);
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { unavailable: true };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offeredAt = new Date();
    try {
      const created = await Offer.create({
        farmerId: runtime.farmer.id,
        cooperativeId: cooperative.id,
        ward: cooperative.ward,
        offeredKg: runtime.context.offer.offeredKg,
        expectedPricePerKg: runtime.context.offer.expectedPricePerKg,
        tradeType: runtime.context.offer.tradeType,
        commissionPercent,
        status: 'offered',
        offeredAt,
        expiresAt: new Date(offeredAt.getTime() + OFFER_LIFETIME_MS),
        ussdSessionId: sessionId,
        reference: makeOfferReference(),
      });
      return {
        offer: plainOffer(created),
        cooperativeName: cleanSingleLine(cooperative.name, 120),
        created: true,
      };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const duplicate = await findOfferBySession(sessionId);
      if (duplicate) {
        if (duplicate.farmerId !== runtime.farmer.id) throw err;
        return {
          offer: duplicate,
          cooperativeName: cleanSingleLine(cooperative.name, 120),
          created: false,
        };
      }
      if (attempt === 2) throw err;
    }
  }
  throw new Error('Offer creation failed');
}

async function confirmOffer(runtime, phoneNumber, sessionId) {
  const result = await createMongoOffer(runtime, sessionId);
  if (result.unavailable) {
    finish(runtime, menu.end('Cooperative is no longer verified in this ward. No offer submitted.'));
    return;
  }
  if (result.created) {
    try {
      await smsService.sendHarvestOfferConfirmation(
        phoneNumber,
        result.offer.reference,
        result.cooperativeName
      );
    } catch (err) {
      logger.warn('Offer submission SMS failed');
    }
  }
  finish(runtime, menu.offerSubmitted(result.offer.reference, result.cooperativeName));
}

async function handleOffer(runtime, input, phoneNumber, sessionId) {
  const value = input.trim();
  const offer = runtime.context.offer;

  if (runtime.step === 'offer_ward') {
    if (value === '0') {
      setMain(runtime);
      return {};
    }
    if (value === '98') {
      if (hasMore(BARINGO_WARDS.length, runtime.context.offerWardPage || 0)) {
        runtime.context.offerWardPage = (runtime.context.offerWardPage || 0) + 1;
        renderWardList(runtime, 'offer');
      } else {
        renderWardList(runtime, 'offer', 'No more choices.');
      }
      return {};
    }
    const selectedIndex = pageChoice(
      value,
      runtime.context.offerWardPage || 0,
      BARINGO_WARDS.length
    );
    if (selectedIndex === null) {
      renderWardList(runtime, 'offer', 'Invalid choice.');
      return {};
    }
    offer.ward = BARINGO_WARDS[selectedIndex].ward;
    offer.cooperativeOptions = await loadCooperatives(offer.ward);
    offer.cooperativePage = 0;
    runtime.step = 'offer_cooperative';
    renderCooperatives(runtime);
    return {};
  }

  if (runtime.step === 'offer_cooperative') {
    if (value === '0') {
      runtime.step = 'offer_ward';
      runtime.context.offerWardPage = 0;
      runtime.context.offer = {
        ward: null,
        cooperativeOptions: [],
        cooperativePage: 0,
        selectedCooperative: null,
        offeredKg: null,
        expectedPricePerKg: null,
        tradeType: null,
      };
      renderWardList(runtime, 'offer');
      return {};
    }
    if (value === '98') {
      if (hasMore(offer.cooperativeOptions.length, offer.cooperativePage || 0)) {
        offer.cooperativePage = (offer.cooperativePage || 0) + 1;
        renderCooperatives(runtime);
      } else {
        renderCooperatives(runtime, 'No more choices.');
      }
      return {};
    }
    const selectedIndex = pageChoice(
      value,
      offer.cooperativePage || 0,
      offer.cooperativeOptions.length
    );
    if (selectedIndex === null) {
      renderCooperatives(runtime, 'Invalid choice.');
      return {};
    }
    offer.selectedCooperative = { ...offer.cooperativeOptions[selectedIndex] };
    runtime.step = 'offer_kg';
    runtime.response = menu.offerWeight(offer.selectedCooperative.name);
    return {};
  }

  if (runtime.step === 'offer_kg') {
    if (value === '0') {
      runtime.step = 'offer_cooperative';
      renderCooperatives(runtime);
      return {};
    }
    const offeredKg = parseFiniteInput(value);
    if (!(offeredKg > 0 && offeredKg <= 10000)) {
      runtime.response = menu.offerWeight(
        offer.selectedCooperative.name,
        'Enter kilograms over 0, up to 10000.'
      );
      return {};
    }
    offer.offeredKg = offeredKg;
    runtime.step = 'offer_price';
    runtime.response = menu.expectedPrice(compactNumber(offeredKg));
    return {};
  }

  if (runtime.step === 'offer_price') {
    const expectedPricePerKg = parseFiniteInput(value);
    if (!(expectedPricePerKg >= 0)) {
      runtime.response = menu.expectedPrice(
        compactNumber(offer.offeredKg),
        'Enter 0 or a positive finite price.'
      );
      return {};
    }
    offer.expectedPricePerKg = expectedPricePerKg;
    runtime.step = 'offer_trade';
    runtime.response = menu.tradeType();
    return {};
  }

  if (runtime.step === 'offer_trade') {
    if (value === '0') {
      runtime.step = 'offer_price';
      runtime.response = menu.expectedPrice(compactNumber(offer.offeredKg));
      return {};
    }
    if (value !== '1' && value !== '2') {
      runtime.response = menu.tradeType('Select 1, 2, or 0.');
      return {};
    }
    offer.tradeType = value === '1' ? 'direct' : 'consignment';
    runtime.step = 'offer_confirm';
    runtime.response = menu.offerConfirmation({
      cooperativeName: offer.selectedCooperative.name,
      offeredKg: compactNumber(offer.offeredKg),
      expectedPricePerKg: offer.expectedPricePerKg === 0
        ? 0
        : compactNumber(offer.expectedPricePerKg),
      tradeType: offer.tradeType,
      commissionPercent: compactNumber(offer.selectedCooperative.commissionPercent),
    });
    return {};
  }

  if (value === '0') {
    runtime.step = 'offer_trade';
    runtime.response = menu.tradeType();
  } else if (value === '2') {
    finish(runtime, menu.end('Offer cancelled. Nothing was submitted.'));
  } else if (value === '1') {
    await confirmOffer(runtime, phoneNumber, sessionId);
  } else {
    runtime.response = menu.offerConfirmation({
      cooperativeName: offer.selectedCooperative.name,
      offeredKg: compactNumber(offer.offeredKg),
      expectedPricePerKg: offer.expectedPricePerKg === 0
        ? 0
        : compactNumber(offer.expectedPricePerKg),
      tradeType: offer.tradeType,
      commissionPercent: compactNumber(offer.selectedCooperative.commissionPercent),
    }, 'Select 1, 2, or 0.');
  }
  return {};
}

async function loadOfferHistory(runtime, page) {
  const documents = await Offer.find(
    { farmerId: runtime.farmer.id },
    {
      reference: 1,
      status: 1,
      tradeType: 1,
      weighedKg: 1,
      agreedPricePerKg: 1,
      saleAmount: 1,
      commissionPercent: 1,
      paymentDetailsConfirmedAt: 1,
      createdAt: 1,
    },
    { sort: { createdAt: -1 }, skip: page * USSD_PAGE_SIZE, limit: USSD_PAGE_SIZE + 1 }
  );
  const offers = documents.map(plainOffer);
  runtime.context.offerHistory = {
    page,
    hasMore: offers.length > USSD_PAGE_SIZE,
    items: offers.slice(0, USSD_PAGE_SIZE).map((offer) => ({
      reference: cleanSingleLine(offer.reference, 80),
      status: cleanSingleLine(offer.status, 20),
      tradeType: offer.tradeType,
      weighedKg: offer.weighedKg ?? null,
      agreedPricePerKg: offer.agreedPricePerKg ?? null,
      saleAmount: offer.saleAmount ?? null,
      commissionPercent: offer.commissionPercent,
      paymentDetailsConfirmedAt: offer.paymentDetailsConfirmedAt ?? null,
    })),
  };
  renderOfferHistory(runtime);
}

function renderSelectedOffer(runtime, error) {
  runtime.response = menu.offerPaymentDetails(runtime.context.selectedOffer, error);
}

async function reloadSelectedOffer(runtime) {
  const reference = runtime.context.selectedOffer?.reference;
  if (!reference) return null;
  return plainOffer(await Offer.findOne({
    reference,
    farmerId: runtime.farmer.id,
  }));
}

async function handleOfferHistory(runtime, input, phoneNumber) {
  const value = input.trim();
  if (runtime.step === 'offers_list') {
    if (value === '0') {
      setMain(runtime);
    } else if (value === '98' && runtime.context.offerHistory?.hasMore) {
      await loadOfferHistory(runtime, runtime.context.offerHistory.page + 1);
    } else if (value === '98') {
      renderOfferHistory(runtime, 'No more offers.');
    } else if (/^[1-4]$/.test(value)) {
      const selected = runtime.context.offerHistory?.items?.[Number(value) - 1];
      if (!selected) {
        renderOfferHistory(runtime, 'Invalid offer choice.');
      } else {
        const current = plainOffer(await Offer.findOne({
          reference: selected.reference,
          farmerId: runtime.farmer.id,
        }));
        if (!current) {
          renderOfferHistory(runtime, 'Offer is unavailable.');
        } else {
          runtime.context.selectedOffer = {
            reference: cleanSingleLine(current.reference, 80),
            status: current.status,
            tradeType: current.tradeType,
            weighedKg: current.weighedKg ?? null,
            agreedPricePerKg: current.agreedPricePerKg ?? null,
            saleAmount: current.saleAmount ?? null,
            commissionPercent: current.commissionPercent,
            paymentDetailsConfirmedAt: current.paymentDetailsConfirmedAt ?? null,
          };
          runtime.step = 'offers_detail';
          renderSelectedOffer(runtime);
        }
      }
    } else {
      renderOfferHistory(runtime, 'Select 1-4, 98, or 0.');
    }
    return {};
  }

  if (runtime.step === 'offers_detail') {
    if (value === '0') {
      delete runtime.context.selectedOffer;
      runtime.step = 'offers_list';
      renderOfferHistory(runtime);
      return {};
    }
    if (value !== '1') {
      renderSelectedOffer(runtime, 'Choose 1 or 0.');
      return {};
    }
    const current = await reloadSelectedOffer(runtime);
    if (!current || current.status === 'paid') {
      renderSelectedOffer(runtime, 'Offer cannot be confirmed.');
      return {};
    }
    const privateUser = await findUserByPhone(phoneNumber, { includePin: true });
    if (!privateUser?.mpesaNumber) {
      renderSelectedOffer(runtime, 'Set M-Pesa in My account first.');
      return {};
    }
    if (!privateUser.ussdPinHash) {
      renderSelectedOffer(runtime, 'No USSD PIN is set.');
      return {};
    }
    runtime.step = 'offers_confirm_pin';
    runtime.response = menu.offerPaymentPin();
    return {};
  }

  if (value === '0') {
    runtime.step = 'offers_detail';
    renderSelectedOffer(runtime);
    return { sensitive: true };
  }
  if (!/^\d{4}$/.test(value)) {
    runtime.response = menu.offerPaymentPin('PIN must be exactly 4 digits.');
    return { sensitive: true };
  }
  const privateUser = await findUserByPhone(phoneNumber, { includePin: true });
  const current = await reloadSelectedOffer(runtime);
  if (!privateUser?.mpesaNumber || !privateUser.ussdPinHash || !current || current.status === 'paid') {
    finish(runtime, menu.end('Payout details could not be confirmed.'));
    return { sensitive: true };
  }
  let matches = false;
  try {
    matches = await bcrypt.compare(value, privateUser.ussdPinHash);
  } catch (err) {
    matches = false;
  }
  if (!matches) {
    runtime.response = menu.offerPaymentPin('Incorrect PIN. Try again.');
    return { sensitive: true };
  }
  const confirmedAt = new Date();
  const confirmed = await Offer.findOneAndUpdate({
    reference: current.reference,
    farmerId: runtime.farmer.id,
    status: { $ne: 'paid' },
  }, {
    $set: { paymentDetailsConfirmedAt: confirmedAt },
  }, { new: true, runValidators: true });
  if (!confirmed) {
    finish(runtime, menu.end('Offer changed before confirmation. Please dial again.'));
    return { sensitive: true };
  }
  finish(runtime, menu.end(`Payout details confirmed for ${cleanSingleLine(current.reference, 40)}.`));
  return { sensitive: true };
}

async function handleMain(runtime, input, phoneNumber, sessionId) {
  const value = input.trim();
  if (value === '1') {
    runtime.step = 'harvest_weight';
    runtime.response = menu.harvestWeight();
  } else if (value === '2') {
    finish(runtime, await readMarketPrice());
  } else if (value === '3') {
    runtime.step = 'account_menu';
    await showAccount(runtime);
  } else if (value === '4') {
    runtime.step = 'offer_ward';
    runtime.context = {
      userId: runtime.farmer.id,
      offerWardPage: 0,
      offer: {
        ward: null,
        cooperativeOptions: [],
        cooperativePage: 0,
        selectedCooperative: null,
        offeredKg: null,
        expectedPricePerKg: null,
        tradeType: null,
      },
    };
    renderWardList(runtime, 'offer');
  } else if (value === '5') {
    runtime.step = 'offers_list';
    runtime.context = { userId: runtime.farmer.id };
    await loadOfferHistory(runtime, 0);
  } else {
    setMain(runtime, 'Invalid option.');
  }
  return {};
}

async function handleFarmerToken(runtime, input, phoneNumber, sessionId) {
  if (runtime.step === 'main') {
    return handleMain(runtime, input, phoneNumber, sessionId);
  }
  if (runtime.step === 'harvest_weight') {
    const value = input.trim();
    if (value === '0') {
      setMain(runtime);
      return {};
    }
    const weightKg = parseFiniteInput(value);
    if (!(weightKg > 0 && weightKg <= 10000)) {
      runtime.response = menu.harvestWeight('Weight must be over 0 and at most 10000.');
      return {};
    }
    await recordHarvest(runtime, weightKg, phoneNumber, sessionId);
    return {};
  }
  if (runtime.step.startsWith('account_')) {
    return handleAccount(runtime, input, phoneNumber);
  }
  if (runtime.step.startsWith('offers_')) {
    return handleOfferHistory(runtime, input, phoneNumber);
  }
  if (runtime.step.startsWith('offer_')) {
    return handleOffer(runtime, input, phoneNumber, sessionId);
  }
  finish(runtime, menu.end('This USSD session is invalid. Please dial again.'));
  return {};
}

function sessionErrorResponse(err) {
  if (err?.code === 'SESSION_PHONE_MISMATCH') {
    return menu.end('This USSD session is not valid for this phone.');
  }
  if (err?.code === 'DIVERGENT_REPLAY') {
    return menu.end('USSD history changed. Please dial again.');
  }
  if (err?.code === 'TERMINAL_REPLAY') {
    return menu.end('This USSD session has already ended.');
  }
  if (['INVALID_TEXT', 'TEXT_TOO_LONG', 'TOO_MANY_TOKENS'].includes(err?.code)) {
    return menu.end('Invalid USSD request. Please dial again.');
  }
  throw err;
}

async function processUssdEvent({ sessionId, phoneNumber, text = '' }) {
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedSessionId || normalizedSessionId.length > 200 || !normalizedPhone) {
    return menu.end('Invalid USSD request.');
  }

  let session;
  let event;
  try {
    session = await sessionService.openSession(normalizedSessionId, normalizedPhone);
    event = sessionService.prepareEvent(session, text);
  } catch (err) {
    return sessionErrorResponse(err);
  }
  if (event.kind === 'retry') return event.response;

  const runtime = await restoreRuntime(session, event.data, phoneNumber);
  const sensitiveTokenIndexes = [...event.data.sensitiveTokenIndexes];
  for (let offset = 0; offset < event.newTokens.length; offset += 1) {
    if (runtime.terminal) {
      for (let remaining = offset; remaining < event.newTokens.length; remaining += 1) {
        sensitiveTokenIndexes.push(event.firstNewTokenIndex + remaining);
      }
      break;
    }
    const tokenIndex = event.firstNewTokenIndex + offset;
    const token = event.newTokens[offset];
    const result = OPT_IN_STEPS.has(runtime.step)
      ? await handleOptIn(runtime, token, normalizedPhone)
      : await handleFarmerToken(runtime, token, normalizedPhone, normalizedSessionId);
    if (result?.sensitive) sensitiveTokenIndexes.push(tokenIndex);
  }

  if (!runtime.response) {
    runtime.response = menu.end('This USSD session is invalid. Please dial again.');
    runtime.step = 'terminal';
    runtime.context = {};
    runtime.terminal = true;
  }
  return sessionService.persistEvent({
    session,
    event,
    currentStep: runtime.step,
    context: runtime.context,
    terminal: runtime.terminal,
    response: runtime.response,
    sensitiveTokenIndexes,
  });
}

module.exports = {
  findUserByPhone,
  processUssdEvent,
};
