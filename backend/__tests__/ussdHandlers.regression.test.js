const mockPrisma = {
  ussdSession: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  cooperative: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  harvestLog: {
    create: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
  },
  priceHistory: {
    findFirst: jest.fn(),
  },
  offer: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockSmsService = {
  sendHarvestConfirmation: jest.fn(),
  sendHarvestOfferConfirmation: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/smsService', () => mockSmsService);
jest.mock('../src/utils/logger', () => mockLogger);
jest.mock('bcryptjs', () => mockBcrypt);

const express = require('express');
const request = require('supertest');
const menu = require('../src/services/ussdMenu');
const { handleUSSD } = require('../src/controllers/ussdController');
const {
  findUserByPhone,
  processUssdEvent,
} = require('../src/services/ussdHandlers');

const FARMER_PHONE = '+254700000006';
const OTHER_PHONE = '+254700000007';

let sessions;
let users;
let cooperatives;
let harvestLogs;
let offers;
let sessionClock;
let nextUserId;
let nextOfferId;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cloneSession(session) {
  if (!session) return null;
  return {
    ...session,
    data: clone(session.data),
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

function activeFarmer(overrides = {}) {
  return {
    id: 6,
    name: 'Farmer One',
    phone: FARMER_PHONE,
    role: 'FARMER',
    cooperativeId: null,
    ward: 'Kabarnet',
    farmerVerifiedAt: null,
    mpesaNumber: null,
    ussdPinHash: 'pin-hash',
    isActive: true,
    cooperative: null,
    ...overrides,
  };
}

function addUser(user = activeFarmer()) {
  users.set(user.phone, user);
  return user;
}

function verifiedCooperative(overrides = {}) {
  return {
    id: 14,
    name: 'Baringo Honey',
    ward: 'Kabarnet',
    isVerified: true,
    commissionPercent: 12.5,
    ...overrides,
  };
}

function event(sessionId, text, phoneNumber = FARMER_PHONE) {
  return processUssdEvent({ sessionId, phoneNumber, text });
}

function listItemLines(screen) {
  return screen.split('\n').filter((line) => /^[1-4] /.test(line));
}

beforeEach(() => {
  jest.resetAllMocks();
  sessions = new Map();
  users = new Map();
  cooperatives = [];
  harvestLogs = new Map();
  offers = [];
  sessionClock = 0;
  nextUserId = 100;
  nextOfferId = 1;

  mockPrisma.ussdSession.upsert.mockImplementation(async ({ where, create }) => {
    let session = sessions.get(where.id);
    if (!session) {
      const now = new Date(1700000000000 + sessionClock);
      sessionClock += 1;
      session = {
        id: create.id,
        phoneNumber: create.phoneNumber,
        currentStep: null,
        data: clone(create.data),
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(session.id, session);
    }
    return cloneSession(session);
  });
  mockPrisma.ussdSession.updateMany.mockImplementation(async ({ where, data }) => {
    const session = sessions.get(where.id);
    const expectedTime = new Date(where.updatedAt).getTime();
    if (
      !session
      || session.phoneNumber !== where.phoneNumber
      || session.updatedAt.getTime() !== expectedTime
    ) {
      return { count: 0 };
    }
    sessionClock += 1;
    sessions.set(where.id, {
      ...session,
      currentStep: data.currentStep,
      data: clone(data.data),
      updatedAt: new Date(1700000000000 + sessionClock),
    });
    return { count: 1 };
  });
  mockPrisma.ussdSession.findUnique.mockImplementation(async ({ where }) => (
    cloneSession(sessions.get(where.id))
  ));

  mockPrisma.user.findUnique.mockImplementation(async ({ where }) => users.get(where.phone) || null);
  mockPrisma.user.create.mockImplementation(async ({ data }) => {
    if (users.has(data.phone)) {
      const error = new Error('Unique constraint');
      error.code = 'P2002';
      throw error;
    }
    const user = {
      id: nextUserId,
      cooperativeId: null,
      cooperative: null,
      ...data,
    };
    nextUserId += 1;
    users.set(user.phone, user);
    return { id: user.id, role: user.role, isActive: user.isActive };
  });
  mockPrisma.user.update.mockImplementation(async ({ where, data }) => {
    const user = [...users.values()].find((candidate) => candidate.id === where.id);
    Object.assign(user, data);
    return { id: user.id };
  });

  mockPrisma.cooperative.findMany.mockImplementation(async () => cooperatives);
  mockPrisma.cooperative.findUnique.mockImplementation(async ({ where }) => (
    cooperatives.find((cooperative) => cooperative.id === where.id) || null
  ));

  mockPrisma.harvestLog.create.mockImplementation(async ({ data }) => {
    if (harvestLogs.has(data.ussdSessionId)) {
      const error = new Error('Unique constraint');
      error.code = 'P2002';
      throw error;
    }
    harvestLogs.set(data.ussdSessionId, { id: harvestLogs.size + 1, ...data });
    return harvestLogs.get(data.ussdSessionId);
  });
  mockPrisma.harvestLog.findUnique.mockImplementation(async ({ where }) => (
    harvestLogs.get(where.ussdSessionId) || null
  ));
  mockPrisma.harvestLog.aggregate.mockResolvedValue({ _sum: { weightKg: 0 } });
  mockPrisma.priceHistory.findFirst.mockResolvedValue({ pricePerKg: 750 });

  mockPrisma.offer.findUnique.mockImplementation(async ({ where }) => offers.find((offer) => (
    (where.id === undefined || offer.id === where.id)
    && (where.ussdSessionId === undefined || offer.ussdSessionId === where.ussdSessionId)
    && (where.reference === undefined || offer.reference === where.reference)
  )) || null);
  mockPrisma.offer.findFirst.mockImplementation(async ({ where }) => offers.find((offer) => (
    (where.id === undefined || offer.id === where.id)
    && (where.reference === undefined || offer.reference === where.reference)
    && (where.farmerId === undefined || offer.farmerId === where.farmerId)
  )) || null);
  mockPrisma.offer.updateMany.mockImplementation(async ({ where, data }) => {
    let count = 0;
    for (const selected of offers) {
      if (where.id !== undefined && selected.id !== where.id) continue;
      if (where.reference !== undefined && selected.reference !== where.reference) continue;
      if (where.farmerId !== undefined && selected.farmerId !== where.farmerId) continue;
      if (where.status?.not !== undefined && selected.status === where.status.not) continue;
      if (
        where.paymentDetailsConfirmedAt?.not === null
        && (selected.paymentDetailsConfirmedAt === null
          || selected.paymentDetailsConfirmedAt === undefined)
      ) continue;
      Object.assign(selected, data);
      count += 1;
    }
    return { count };
  });
  mockPrisma.offer.create.mockImplementation(async ({ data }) => {
    if (offers.some((offer) => offer.ussdSessionId === data.ussdSessionId)) {
      const error = new Error('Unique constraint');
      error.code = 'P2002';
      throw error;
    }
    const created = {
      id: nextOfferId,
      createdAt: new Date(),
      ...data,
    };
    nextOfferId += 1;
    offers.push(created);
    return created;
  });
  mockPrisma.offer.findMany.mockImplementation(async ({ where, orderBy, skip, take }) => offers
    .filter((offer) => offer.farmerId === where.farmerId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(skip, skip + take));

  mockSmsService.sendHarvestConfirmation.mockResolvedValue({});
  mockSmsService.sendHarvestOfferConfirmation.mockResolvedValue({});
  mockBcrypt.hash.mockResolvedValue('$2b$10$secure-test-hash');
  mockBcrypt.compare.mockImplementation(async (pin, hash) => pin === '2468' && hash === 'pin-hash');
});

test('an unregistered number enters stateful farmer opt-in immediately', async () => {
  const response = await event('optin-start', '', '0700000099');

  expect(response).toContain('CON Welcome to NectarTrace farmer opt-in.');
  expect(sessions.get('optin-start').phoneNumber).toBe('+254700000099');
  expect(sessions.get('optin-start').currentStep).toBe('optin_name');
});

test.each([
  [{ role: 'BUYER' }, 'only available to active farmer'],
  [{ isActive: false }, 'only available to active farmer'],
])('known non-farmer or inactive accounts end safely', async (overrides, message) => {
  addUser(activeFarmer(overrides));

  const response = await event(`blocked-${overrides.role || 'inactive'}`, '');

  expect(response).toContain(message);
  expect(response.startsWith('END ')).toBe(true);
});

test('opt-in requires consent, hashes the PIN, and never persists raw PIN or name history', async () => {
  const sessionId = 'optin-complete';
  await event(sessionId, '');
  const ward = await event(sessionId, 'Alice Farmer');
  expect(ward).toContain('Select ward / sub-county');
  const consent = await event(sessionId, 'Alice Farmer*1');
  expect(consent).toContain('Consent to store your details');
  expect(mockPrisma.user.create).not.toHaveBeenCalled();
  const pin = await event(sessionId, 'Alice Farmer*1*1');
  expect(pin).toContain('exactly 4-digit');
  expect(mockPrisma.user.create).not.toHaveBeenCalled();

  const completed = await event(sessionId, 'Alice Farmer*1*1*2468');

  expect(completed).toBe('END Registration complete. Dial again to use NectarTrace.');
  expect(mockBcrypt.hash).toHaveBeenCalledWith('2468', 10);
  expect(mockPrisma.user.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      name: 'Alice Farmer',
      phone: FARMER_PHONE,
      email: null,
      passwordHash: null,
      role: 'FARMER',
      ward: 'Kabarnet',
      dataConsentAt: expect.any(Date),
      ussdPinHash: '$2b$10$secure-test-hash',
      farmerVerifiedAt: null,
    }),
    select: { id: true, role: true, isActive: true },
  });
  const persisted = JSON.stringify(sessions.get(sessionId).data);
  expect(persisted).not.toContain('2468');
  expect(persisted).not.toContain('Alice Farmer');
  expect(sessions.get(sessionId).data.lastProcessedText).toBe('[redacted]*1*1*[redacted]');
});

test('declining consent creates no user and terminates opt-in', async () => {
  const sessionId = 'consent-no';
  await event(sessionId, '');
  await event(sessionId, 'No Consent');
  await event(sessionId, 'No Consent*1');

  const response = await event(sessionId, 'No Consent*1*2');

  expect(response).toContain('No farmer account was created');
  expect(mockPrisma.user.create).not.toHaveBeenCalled();
  expect(JSON.stringify(sessions.get(sessionId).data)).not.toContain('No Consent');
});

test('ward pages show four choices and cumulative 98 More and 0 Back work', async () => {
  const sessionId = 'ward-pages';
  await event(sessionId, '');
  const first = await event(sessionId, 'Page Tester');
  const second = await event(sessionId, 'Page Tester*98');
  const back = await event(sessionId, 'Page Tester*98*0');

  expect(listItemLines(first)).toHaveLength(4);
  expect(first).toContain('98 More');
  expect(listItemLines(second)).toHaveLength(4);
  expect(second).toContain('Kabartonjo');
  expect(back).toContain('Enter your full name');
});

test('offer cooperative lookup hides unverified records and paginates stable snapshots', async () => {
  addUser();
  cooperatives = [
    verifiedCooperative({ id: 1, name: 'Alpha Honey' }),
    verifiedCooperative({ id: 2, name: 'Beta Honey' }),
    verifiedCooperative({ id: 3, name: 'Delta Honey' }),
    verifiedCooperative({ id: 4, name: 'Gamma Honey' }),
    verifiedCooperative({ id: 5, name: 'Zeta Honey' }),
    verifiedCooperative({ id: 6, name: 'Hidden Honey', isVerified: false }),
  ];
  const sessionId = 'coop-pages';
  await event(sessionId, '');
  await event(sessionId, '4');
  const first = await event(sessionId, '4*1');
  const second = await event(sessionId, '4*1*98');
  const back = await event(sessionId, '4*1*98*0');

  expect(mockPrisma.cooperative.findMany).toHaveBeenCalledWith({
    where: { isVerified: true, ward: 'Kabarnet' },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      ward: true,
      isVerified: true,
      commissionPercent: true,
    },
  });
  expect(first).not.toContain('Hidden Honey');
  expect(listItemLines(first)).toHaveLength(4);
  expect(first).toContain('98 More');
  expect(second).toContain('Zeta Honey');
  expect(back).toContain('Select ward / sub-county');
});

test('offer flow rejects non-finite, zero, and excessive kilograms', async () => {
  addUser();
  cooperatives = [verifiedCooperative()];
  const invalidValues = ['0', '10000.1', 'Infinity'];

  for (const [index, kilograms] of invalidValues.entries()) {
    const sessionId = `invalid-kg-${index}`;
    await event(sessionId, '');
    await event(sessionId, '4');
    await event(sessionId, '4*1');
    await event(sessionId, '4*1*1');
    const response = await event(sessionId, `4*1*1*${kilograms}`);
    if (kilograms === '0') {
      expect(response).toContain('Verified cooperatives');
    } else {
      expect(response).toContain('up to 10000');
    }
  }
  expect(mockPrisma.offer.create).not.toHaveBeenCalled();
});

test('offer confirmation uses Prisma, snapshots current commission, and identical retry is idempotent', async () => {
  addUser();
  cooperatives = [verifiedCooperative({ commissionPercent: 9.75 })];
  const sessionId = 'offer-idempotent';
  const steps = ['', '4', '4*1', '4*1*1', '4*1*1*25', '4*1*1*25*0'];
  for (const text of steps) await event(sessionId, text);
  const confirmation = await event(sessionId, '4*1*1*25*0*2');

  expect(confirmation).toContain('Price: Any');
  expect(confirmation).toContain('consignment');
  expect(confirmation).toContain('Comm 9.75%');
  const cumulative = '4*1*1*25*0*2*1';
  const submitted = await event(sessionId, cumulative);
  const retried = await event(sessionId, cumulative);

  expect(retried).toBe(submitted);
  expect(mockPrisma.offer.create).toHaveBeenCalledTimes(1);
  const created = mockPrisma.offer.create.mock.calls[0][0].data;
  expect(created).toEqual(expect.objectContaining({
    farmerId: 6,
    cooperativeId: 14,
    ward: 'Kabarnet',
    offeredKg: 25,
    expectedPricePerKg: 0,
    tradeType: 'consignment',
    commissionPercent: 9.75,
    status: 'offered',
    ussdSessionId: sessionId,
    reference: expect.stringMatching(/^NTO-\d{8}-[A-F0-9]{8}$/),
  }));
  expect(created.expiresAt.getTime() - created.offeredAt.getTime()).toBe(48 * 60 * 60 * 1000);
  expect(mockSmsService.sendHarvestOfferConfirmation).toHaveBeenCalledTimes(1);
});

test('harvest final write and SMS are replay safe', async () => {
  addUser();
  mockPrisma.harvestLog.aggregate.mockResolvedValue({ _sum: { weightKg: 12.5 } });
  const sessionId = 'harvest-idempotent';
  await event(sessionId, '');
  await event(sessionId, '1');
  const first = await event(sessionId, '1*12.5');
  const retry = await event(sessionId, '1*12.5');

  expect(retry).toBe(first);
  expect(mockPrisma.harvestLog.create).toHaveBeenCalledTimes(1);
  expect(mockPrisma.harvestLog.create).toHaveBeenCalledWith({
    data: {
      userId: 6,
      weightKg: 12.5,
      loggedVia: 'USSD',
      ussdSessionId: sessionId,
    },
  });
  expect(mockSmsService.sendHarvestConfirmation).toHaveBeenCalledTimes(1);
});

test('harvest response does not wait for slow SMS delivery', async () => {
  addUser();
  mockPrisma.harvestLog.aggregate.mockResolvedValue({ _sum: { weightKg: 8 } });
  let releaseSms;
  mockSmsService.sendHarvestConfirmation.mockReturnValue(
    new Promise((resolve) => {
      releaseSms = resolve;
    })
  );

  const sessionId = 'harvest-slow-sms';
  await event(sessionId, '');
  await event(sessionId, '1');

  let timer;
  try {
    const response = await Promise.race([
      event(sessionId, '1*8'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('USSD waited for SMS')), 500);
      }),
    ]);
    expect(response).toContain('END Harvest 8kg recorded.');
  } finally {
    clearTimeout(timer);
    releaseSms({});
  }
});

test('My Offers is newest-first, farmer-scoped, and paginated four at a time', async () => {
  addUser();
  offers = [
    ...Array.from({ length: 5 }, (_, index) => ({
      farmerId: 6,
      reference: `NTO-MINE-${index + 1}`,
      status: 'offered',
      createdAt: new Date(2026, 0, index + 1),
    })),
    {
      farmerId: 999,
      reference: 'NTO-OTHER-1',
      status: 'paid',
      createdAt: new Date(2027, 0, 1),
    },
  ];
  const sessionId = 'my-offers';
  await event(sessionId, '');
  const first = await event(sessionId, '5');
  const second = await event(sessionId, '5*98');
  const back = await event(sessionId, '5*98*0');

  expect(mockPrisma.offer.findMany.mock.calls[0][0].where).toEqual({ farmerId: 6 });
  expect(first).toContain('NTO-MINE-5');
  expect(first).not.toContain('NTO-OTHER');
  expect(listItemLines(first)).toHaveLength(4);
  expect(first).toContain('98 More');
  expect(second).toContain('NTO-MINE-1');
  expect(back).toContain('1 Log harvest');
});

test('My Offers confirms payout details with the correct PIN and never initiates payment', async () => {
  addUser(activeFarmer({ mpesaNumber: '+254712345678' }));
  offers = [{
    id: 22,
    farmerId: 6,
    reference: 'NTO-MINE-CONFIRM',
    status: 'verified',
    tradeType: 'direct',
    weighedKg: 12.5,
    agreedPricePerKg: 680,
    commissionPercent: 0,
    paymentDetailsConfirmedAt: null,
    createdAt: new Date(2026, 0, 2),
  }];
  const sessionId = 'offer-payment-confirm';
  await event(sessionId, '');
  const list = await event(sessionId, '5');
  const detail = await event(sessionId, '5*1');
  const pinPrompt = await event(sessionId, '5*1*1');
  const wrongPin = await event(sessionId, '5*1*1*0000');
  const confirmed = await event(sessionId, '5*1*1*0000*2468');

  expect(list).toContain('NTO-MINE-CONFIRM');
  expect(detail).toContain('Confirm payout details');
  expect(detail).toContain('12.5kg @ KES 680/kg');
  expect(pinPrompt).toContain('4-digit PIN');
  expect(wrongPin).toContain('Incorrect PIN');
  expect(confirmed).toContain('Payout details confirmed');
  expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
    where: {
      reference: 'NTO-MINE-CONFIRM',
      farmerId: 6,
      status: { not: 'paid' },
    },
    data: { paymentDetailsConfirmedAt: expect.any(Date) },
  });
  expect(offers[0].paymentDetailsConfirmedAt).toEqual(expect.any(Date));
  expect(mockSmsService.sendHarvestConfirmation).not.toHaveBeenCalled();
  expect(mockSmsService.sendHarvestOfferConfirmation).not.toHaveBeenCalled();
  const persisted = JSON.stringify(sessions.get(sessionId).data);
  expect(persisted).not.toContain('0000');
  expect(persisted).not.toContain('2468');
  expect(persisted).not.toContain('+254712345678');
});

test('M-Pesa change requires the correct PIN, stores only normalized number, and masks output', async () => {
  addUser();
  offers = [
    {
      farmerId: 6,
      reference: 'NTO-UNPAID',
      status: 'verified',
      paymentDetailsConfirmedAt: new Date(),
    },
    {
      farmerId: 6,
      reference: 'NTO-PAID',
      status: 'paid',
      paymentDetailsConfirmedAt: new Date(),
    },
  ];
  const sessionId = 'mpesa-change';
  await event(sessionId, '');
  const account = await event(sessionId, '3');
  expect(account).toContain('M-Pesa: Not set');
  await event(sessionId, '3*1');
  const wrong = await event(sessionId, '3*1*0000');
  expect(wrong).toContain('Incorrect PIN');
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  const numberPrompt = await event(sessionId, '3*1*0000*2468');
  expect(numberPrompt).toContain('Enter Kenyan M-Pesa number');
  const updated = await event(sessionId, '3*1*0000*2468*0712345678');

  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: 6 },
    data: { mpesaNumber: '+254712345678' },
    select: { id: true },
  });
  expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
    where: {
      farmerId: 6,
      status: { not: 'paid' },
      paymentDetailsConfirmedAt: { not: null },
    },
    data: { paymentDetailsConfirmedAt: null },
  });
  expect(offers[0].paymentDetailsConfirmedAt).toBeNull();
  expect(offers[1].paymentDetailsConfirmedAt).toEqual(expect.any(Date));
  expect(updated).toContain('******5678');
  expect(updated).not.toContain('+254712345678');
  const persisted = JSON.stringify(sessions.get(sessionId).data);
  expect(persisted).not.toContain('0000');
  expect(persisted).not.toContain('2468');
  expect(persisted).not.toContain('0712345678');
});

test('a farmer without a USSD PIN cannot change M-Pesa number', async () => {
  addUser(activeFarmer({ ussdPinHash: null }));
  const sessionId = 'mpesa-no-pin';
  await event(sessionId, '');
  await event(sessionId, '3');

  const response = await event(sessionId, '3*1');

  expect(response).toContain('no USSD PIN is set');
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
});

test('session-phone and divergent cumulative replays are rejected', async () => {
  addUser();
  addUser(activeFarmer({ id: 7, phone: OTHER_PHONE }));
  await event('replay-guard', '');
  const wrongPhone = await event('replay-guard', '', OTHER_PHONE);
  expect(wrongPhone).toContain('not valid for this phone');

  await event('replay-guard', '1');
  const divergent = await event('replay-guard', '2');
  expect(divergent).toContain('history changed');
});

test('all menu renderers cap dynamic screens at 180 characters', () => {
  const longName = 'Cooperative '.repeat(80);
  const screens = [
    menu.mainMenu('Invalid option.'),
    menu.numberedList({ title: longName, items: Array(9).fill(longName), page: 0 }),
    menu.accountSummary({
      name: longName,
      ward: longName,
      totalWeightKg: Number.MAX_VALUE,
      estimatedEarnings: Number.MAX_VALUE,
      cooperativeName: longName,
      maskedMpesa: '******5678',
    }),
    menu.offerConfirmation({
      cooperativeName: longName,
      offeredKg: 10000,
      expectedPricePerKg: Number.MAX_VALUE,
      tradeType: 'consignment',
      commissionPercent: 100,
    }),
    menu.offerSubmitted('NTO-20261123-ABCDEF12', longName),
  ];

  for (const screen of screens) {
    expect(screen).toMatch(/^(CON|END) /);
    expect(screen.length).toBeLessThanOrEqual(180);
  }
});

test('findUserByPhone keeps PIN hash out of its default Prisma selection', async () => {
  addUser();

  await findUserByPhone('0700000006');

  expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { phone: FARMER_PHONE },
    select: expect.not.objectContaining({ ussdPinHash: expect.anything() }),
  }));
});

test('POST /api/ussd accepts Africa\'s Talking URL-encoded form bodies', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.post('/api/ussd', handleUSSD);

  const response = await request(app)
    .post('/api/ussd')
    .type('form')
    .send({
      sessionId: 'form-request',
      phoneNumber: '0700000098',
      text: '',
    });

  expect(response.status).toBe(200);
  expect(response.type).toMatch(/^text\/plain/);
  expect(response.text).toContain('CON Welcome to NectarTrace farmer opt-in.');
});
