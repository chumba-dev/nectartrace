let mockPayments;
let mockOffers;
let mockUsers;
let nextPaymentId;

function clone(value) {
  return value ? { ...value } : value;
}

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (expected.in) return expected.in.includes(actual);
    if (Object.prototype.hasOwnProperty.call(expected, 'not')) return actual !== expected.not;
  }
  return actual === expected;
}

function matches(document, where) {
  if (where.OR && !where.OR.some((part) => matches(document, part))) return false;
  return Object.entries(where).every(([key, value]) => (
    key === 'OR' || matchesValue(document[key], value)
  ));
}

const mockPrisma = {
  payment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  offer: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockDaraja = {
  normalizePartyB: jest.fn((value) => {
    if (!/^\+254\d{9}$/.test(value || '')) throw new Error('invalid');
    return value.slice(1);
  }),
  requestB2CPayout: jest.fn(),
};

const mockOfferService = { loadManagedOffer: jest.fn() };

const mockSmsService = {
  sendConsignmentSale: jest.fn(),
  sendPayoutFailure: jest.fn(),
  sendPayoutSuccess: jest.fn(),
};

const mockBcrypt = { compare: jest.fn() };

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/darajaService', () => mockDaraja);
jest.mock('../src/services/offerService', () => mockOfferService);
jest.mock('../src/services/smsService', () => mockSmsService);
jest.mock('bcryptjs', () => mockBcrypt);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const paymentService = require('../src/services/paymentService');

const OFFER_ID = 41;

function baseOffer(overrides = {}) {
  return {
    id: OFFER_ID,
    reference: 'NTO-20261123-ABC123',
    farmerId: 4,
    cooperativeId: 2,
    offeredKg: 999,
    tradeType: 'direct',
    commissionPercent: 12.5,
    agreedPricePerKg: 100,
    weighedKg: 10,
    status: 'verified',
    saleAmount: null,
    paymentDetailsConfirmedAt: new Date('2026-11-23T10:00:00.000Z'),
    ...overrides,
  };
}

function farmer(overrides = {}) {
  return {
    id: 4,
    role: 'FARMER',
    phone: '+254700000004',
    farmerVerifiedAt: new Date('2026-11-23T09:00:00.000Z'),
    mpesaNumber: '+254712345678',
    ussdPinHash: 'pin-hash',
    ...overrides,
  };
}

function staff() {
  return { id: 9, role: 'COOPERATIVE_STAFF', cooperativeId: 2 };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPayments = [];
  mockOffers = [baseOffer()];
  mockUsers = new Map([[4, farmer()], [5, farmer({ id: 5 })]]);
  nextPaymentId = 1;

  mockPrisma.$transaction.mockImplementation(async (operation) => operation(mockPrisma));
  mockPrisma.payment.findUnique.mockImplementation(async ({ where }) => (
    clone(mockPayments.find((payment) => matches(payment, where)) || null)
  ));
  mockPrisma.payment.findFirst.mockImplementation(async ({ where }) => (
    clone(mockPayments.find((payment) => matches(payment, where)) || null)
  ));
  mockPrisma.payment.create.mockImplementation(async ({ data }) => {
    if (
      mockPayments.some((payment) => payment.reference === data.reference)
      || mockPayments.some((payment) => (
        payment.offerId === data.offerId && payment.purpose === data.purpose
      ))
    ) {
      const error = new Error('Unique constraint');
      error.code = 'P2002';
      throw error;
    }
    const now = new Date();
    const payment = {
      id: nextPaymentId,
      createdAt: now,
      updatedAt: now,
      originatorConversationId: null,
      conversationId: null,
      transactionId: null,
      resultCode: null,
      resultDescription: null,
      submittedAt: null,
      completedAt: null,
      failedAt: null,
      ...data,
    };
    nextPaymentId += 1;
    mockPayments.push(payment);
    return clone(payment);
  });
  mockPrisma.payment.updateMany.mockImplementation(async ({ where, data }) => {
    let count = 0;
    for (const payment of mockPayments) {
      if (!matches(payment, where)) continue;
      Object.assign(payment, data, { updatedAt: new Date() });
      count += 1;
    }
    return { count };
  });

  mockPrisma.offer.findFirst.mockImplementation(async ({ where }) => (
    clone(mockOffers.find((item) => matches(item, where)) || null)
  ));
  mockPrisma.offer.findUnique.mockImplementation(async ({ where }) => (
    clone(mockOffers.find((item) => matches(item, where)) || null)
  ));
  mockPrisma.offer.updateMany.mockImplementation(async ({ where, data }) => {
    let count = 0;
    for (const item of mockOffers) {
      if (!matches(item, where)) continue;
      Object.assign(item, data);
      count += 1;
    }
    return { count };
  });

  mockPrisma.user.findUnique.mockImplementation(async ({ where }) => clone(mockUsers.get(where.id)));
  mockOfferService.loadManagedOffer.mockImplementation(async (identifier) => {
    const selected = mockOffers.find((item) => (
      item.id === identifier || item.reference === identifier
    ));
    if (!selected) throw new Error('missing offer');
    return { offer: clone(selected), cooperative: { id: selected.cooperativeId, isVerified: true } };
  });
  mockDaraja.requestB2CPayout.mockResolvedValue({
    originatorConversationId: 'origin-1',
    conversationId: 'conversation-1',
  });
  mockSmsService.sendConsignmentSale.mockResolvedValue({});
  mockSmsService.sendPayoutFailure.mockResolvedValue({});
  mockSmsService.sendPayoutSuccess.mockResolvedValue({});
  mockBcrypt.compare.mockImplementation(async (pin, hash) => pin === '2468' && hash === 'pin-hash');
});

test('direct payout uses weighedKg, is same-reference idempotent, and blocks another reference', async () => {
  const first = await paymentService.initiatePayout({
    offerIdentifier: String(OFFER_ID),
    user: staff(),
    reference: 'pay-direct-1',
  });
  const retried = await paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-direct-1',
  });

  expect(first.payment).toEqual(expect.objectContaining({ id: 1, offerId: OFFER_ID, amount: 1000 }));
  expect(first.payment.amount).not.toBe(99900);
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledWith(expect.objectContaining({
    amount: 1000,
    partyB: '+254712345678',
    reference: 'PAY-DIRECT-1',
  }));
  expect(retried.idempotent).toBe(true);
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledTimes(1);
  await expect(paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-direct-2',
  })).rejects.toMatchObject({ status: 409, code: 'PAYOUT_ALREADY_EXISTS' });
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledTimes(1);
});

test('a globally reused reference is rejected before any provider call', async () => {
  mockPayments.push({
    id: 9,
    offerId: 99,
    farmerId: 5,
    purpose: 'direct_purchase',
    reference: 'GLOBAL-REFERENCE',
    status: 'submitted',
  });

  await expect(paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'global-reference',
  })).rejects.toMatchObject({ status: 409, code: 'PAYMENT_REFERENCE_CONFLICT' });
  expect(mockDaraja.requestB2CPayout).not.toHaveBeenCalled();
});

test('payout is blocked until the farmer has confirmed payment details', async () => {
  mockOffers[0].paymentDetailsConfirmedAt = null;

  await expect(paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-unconfirmed',
  })).rejects.toMatchObject({ status: 409, code: 'PAYMENT_DETAILS_NOT_CONFIRMED' });
  expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  expect(mockDaraja.requestB2CPayout).not.toHaveBeenCalled();
});

test('an ambiguous provider exception closes the ledger and is never retried automatically', async () => {
  mockDaraja.requestB2CPayout.mockRejectedValue(new Error('network detail must not escape'));

  await expect(paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-ambiguous-1',
  })).rejects.toMatchObject({
    status: 502,
    code: 'DARAJA_SUBMISSION_FAILED',
    message: 'Payout submission failed; manual reconciliation is required',
  });
  expect(mockPayments[0]).toEqual(expect.objectContaining({
    status: 'failed',
    resultDescription: paymentService.SAFE_PROVIDER_FAILURE,
    failedAt: expect.any(Date),
  }));

  const retried = await paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-ambiguous-1',
  });
  expect(retried.payment.status).toBe('failed');
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledTimes(1);
  expect(mockSmsService.sendPayoutFailure).toHaveBeenCalledTimes(1);
});

test('consignment sale snapshots gross, commission, and rounded payout before one provider call', async () => {
  mockOffers[0] = baseOffer({
    tradeType: 'consignment',
    agreedPricePerKg: null,
    commissionPercent: 12.5,
  });

  const first = await paymentService.recordConsignmentSaleAndPayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    saleAmount: 10001,
    reference: 'pay-consignment-1',
  });
  const retried = await paymentService.recordConsignmentSaleAndPayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    saleAmount: 10001,
    reference: 'pay-consignment-1',
  });

  expect(first.amounts).toEqual({
    grossAmount: 10001,
    commissionAmount: 1250.125,
    payoutAmount: 8751,
  });
  expect(mockOffers[0].saleAmount).toBe(10001);
  expect(mockSmsService.sendConsignmentSale).toHaveBeenCalledTimes(1);
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledTimes(1);
  expect(retried.idempotent).toBe(true);
});

test('duplicate success callbacks atomically mark the offer paid and send one SMS', async () => {
  await paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-callback-1',
  });
  const payload = {
    Body: {
      Result: {
        ResultCode: 0,
        ResultDesc: 'Completed',
        OriginatorConversationID: 'origin-1',
        ConversationID: 'conversation-1',
        TransactionID: 'TX123',
      },
    },
  };

  const first = await paymentService.processDarajaCallback({ payload, type: 'result' });
  const duplicate = await paymentService.processDarajaCallback({ payload, type: 'result' });

  expect(first).toEqual(expect.objectContaining({ changed: true, status: 'succeeded' }));
  expect(duplicate).toEqual(expect.objectContaining({ changed: false, status: 'succeeded' }));
  expect(mockPayments[0].status).toBe('succeeded');
  expect(mockOffers[0].status).toBe('paid');
  expect(mockSmsService.sendPayoutSuccess).toHaveBeenCalledTimes(1);
});

test('timeout callback never marks the offer paid', async () => {
  await paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-timeout-1',
  });

  await paymentService.processDarajaCallback({
    type: 'timeout',
    payload: {
      Result: {
        OriginatorConversationID: 'origin-1',
        ConversationID: 'conversation-1',
        ResultDesc: 'Timed out',
      },
    },
  });

  expect(mockPayments[0].status).toBe('timeout');
  expect(mockOffers[0].status).toBe('verified');
  expect(mockSmsService.sendPayoutFailure).toHaveBeenCalledTimes(1);
});

test('farmer cannot inspect or confirm another farmer offer', async () => {
  mockPayments.push({
    id: 7,
    offerId: OFFER_ID,
    farmerId: 4,
    amount: 1000,
    method: 'daraja_b2c',
    reference: 'PAY-EXISTING',
    purpose: 'direct_purchase',
    status: 'submitted',
  });
  const otherFarmer = { id: 5, role: 'FARMER' };

  await expect(paymentService.getOfferPayment({
    offerIdentifier: OFFER_ID,
    user: otherFarmer,
  })).rejects.toMatchObject({ status: 404, code: 'OFFER_NOT_FOUND' });
  await expect(paymentService.confirmPaymentDetails({
    offerIdentifier: OFFER_ID,
    farmerId: 5,
    pin: '2468',
  })).rejects.toMatchObject({ status: 404, code: 'OFFER_NOT_FOUND' });
  expect(mockBcrypt.compare).not.toHaveBeenCalled();
});

test('confirmation requires a PIN and stores only the confirmation timestamp', async () => {
  await expect(paymentService.confirmPaymentDetails({
    offerIdentifier: OFFER_ID,
    farmerId: 4,
  })).rejects.toMatchObject({ status: 400, code: 'PIN_REQUIRED' });

  const now = new Date('2026-11-23T12:00:00.000Z');
  const result = await paymentService.confirmPaymentDetails({
    offerIdentifier: OFFER_ID,
    farmerId: 4,
    pin: '2468',
    now,
  });

  expect(mockBcrypt.compare).toHaveBeenCalledWith('2468', 'pin-hash');
  expect(result).toEqual({ offerId: OFFER_ID, paymentDetailsConfirmedAt: now });
  const update = mockPrisma.offer.updateMany.mock.calls.at(-1)[0];
  expect(update).toEqual({
    where: { id: OFFER_ID, farmerId: 4, status: { not: 'paid' } },
    data: { paymentDetailsConfirmedAt: now },
  });
  expect(update.data).not.toHaveProperty('pin');
  expect(update.data).not.toHaveProperty('mpesaNumber');
});
