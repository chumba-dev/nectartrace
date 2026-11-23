let mockPayments;
let mockOffers;
let mockUsers;
let nextPaymentId;

function clone(value) {
  if (!value) return value;
  return { ...value };
}

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (expected.$in) return expected.$in.includes(actual);
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return actual !== expected.$ne;
  }
  return String(actual) === String(expected);
}

function matches(document, query) {
  if (query.$or && !query.$or.some((part) => matches(document, part))) return false;
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return true;
    return matchesValue(document[key], value);
  });
}

const mockPaymentModel = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
};

const mockOfferModel = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
};

const mockDaraja = {
  normalizePartyB: jest.fn((value) => {
    if (!/^\+254\d{9}$/.test(value || '')) throw new Error('invalid');
    return value.slice(1);
  }),
  requestB2CPayout: jest.fn(),
};

const mockOfferService = {
  loadManagedOffer: jest.fn(),
};

const mockSmsService = {
  sendConsignmentSale: jest.fn(),
  sendPayoutFailure: jest.fn(),
  sendPayoutSuccess: jest.fn(),
};

const mockBcrypt = {
  compare: jest.fn(),
};

jest.mock('../src/models/Payment', () => mockPaymentModel);
jest.mock('../src/models/Offer', () => mockOfferModel);
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

const OFFER_ID = '64b64c2f3f3f3f3f3f3f3f3f';

function baseOffer(overrides = {}) {
  return {
    _id: OFFER_ID,
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

  mockPaymentModel.findOne.mockImplementation(async (query) => (
    clone(mockPayments.find((payment) => matches(payment, query)) || null)
  ));
  mockPaymentModel.create.mockImplementation(async (data) => {
    if (
      mockPayments.some((payment) => payment.reference === data.reference)
      || mockPayments.some((payment) => (
        String(payment.offerId) === String(data.offerId) && payment.purpose === data.purpose
      ))
    ) {
      const error = new Error('duplicate');
      error.code = 11000;
      throw error;
    }
    const now = new Date();
    const payment = {
      _id: `payment-${nextPaymentId}`,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    nextPaymentId += 1;
    mockPayments.push(payment);
    return clone(payment);
  });
  mockPaymentModel.findOneAndUpdate.mockImplementation(async (query, update) => {
    const payment = mockPayments.find((candidate) => matches(candidate, query));
    if (!payment) return null;
    Object.assign(payment, update.$set, { updatedAt: new Date() });
    return clone(payment);
  });

  mockOfferModel.findOne.mockImplementation(async (query) => (
    clone(mockOffers.find((offer) => matches(offer, query)) || null)
  ));
  mockOfferModel.findOneAndUpdate.mockImplementation(async (query, update) => {
    const offer = mockOffers.find((candidate) => matches(candidate, query));
    if (!offer) return null;
    Object.assign(offer, update.$set);
    return clone(offer);
  });
  mockOfferModel.updateOne.mockImplementation(async (query, update) => {
    const offer = mockOffers.find((candidate) => matches(candidate, query));
    if (!offer) return { modifiedCount: 0 };
    Object.assign(offer, update.$set);
    return { modifiedCount: 1 };
  });
  mockOfferModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

  mockPrisma.user.findUnique.mockImplementation(async ({ where }) => clone(mockUsers.get(where.id)));
  mockOfferService.loadManagedOffer.mockImplementation(async (identifier) => {
    const offer = mockOffers.find((candidate) => (
      candidate.reference === identifier || String(candidate._id) === String(identifier)
    ));
    if (!offer) throw new Error('missing offer');
    return { offer: clone(offer), cooperative: { id: offer.cooperativeId, isVerified: true } };
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
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-direct-1',
  });
  const retried = await paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-direct-1',
  });

  expect(first.payment.amount).toBe(1000);
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

test('payout is blocked until the farmer has confirmed payment details', async () => {
  mockOffers[0].paymentDetailsConfirmedAt = null;

  await expect(paymentService.initiatePayout({
    offerIdentifier: OFFER_ID,
    user: staff(),
    reference: 'pay-unconfirmed',
  })).rejects.toMatchObject({
    status: 409,
    code: 'PAYMENT_DETAILS_NOT_CONFIRMED',
  });
  expect(mockPaymentModel.create).not.toHaveBeenCalled();
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
  expect(mockSmsService.sendConsignmentSale).toHaveBeenCalledWith(
    '+254700000004',
    expect.objectContaining({
      saleAmount: 10001,
      commissionAmount: 1250.125,
      payoutAmount: 8751,
    })
  );
  expect(mockSmsService.sendConsignmentSale).toHaveBeenCalledTimes(1);
  expect(mockDaraja.requestB2CPayout).toHaveBeenCalledTimes(1);
  expect(retried.idempotent).toBe(true);
});

test('duplicate success callbacks mark the offer paid and send one SMS', async () => {
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
  expect(mockOfferModel.updateOne).toHaveBeenCalledTimes(1);
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
  expect(mockOfferModel.updateOne).not.toHaveBeenCalled();
  expect(mockSmsService.sendPayoutFailure).toHaveBeenCalledTimes(1);
});

test('farmer cannot inspect or confirm another farmer offer', async () => {
  mockPayments.push({
    _id: 'payment-existing',
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

  const result = await paymentService.confirmPaymentDetails({
    offerIdentifier: OFFER_ID,
    farmerId: 4,
    pin: '2468',
    now: new Date('2026-11-23T12:00:00.000Z'),
  });

  expect(mockBcrypt.compare).toHaveBeenCalledWith('2468', 'pin-hash');
  expect(result.paymentDetailsConfirmedAt).toEqual(new Date('2026-11-23T12:00:00.000Z'));
  const update = mockOfferModel.findOneAndUpdate.mock.calls.at(-1)[1].$set;
  expect(update).toEqual({
    paymentDetailsConfirmedAt: new Date('2026-11-23T12:00:00.000Z'),
  });
  expect(update).not.toHaveProperty('pin');
  expect(update).not.toHaveProperty('mpesaNumber');
});
