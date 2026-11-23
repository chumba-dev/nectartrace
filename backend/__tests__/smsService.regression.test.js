const mockSend = jest.fn();
const mockSmsLogCreate = jest.fn();
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../src/config/africastalking', () => ({
  getSMS: () => ({ send: mockSend }),
}));
jest.mock('../src/config/db', () => ({
  smsLog: { create: mockSmsLogCreate },
}));
jest.mock('../src/config/env', () => ({
  africasTalking: { senderId: '' },
}));
jest.mock('../src/utils/logger', () => mockLogger);

const {
  sendConsignmentSale,
  sendOfferAccepted,
  sendOfferRejected,
  sendPayoutFailure,
  sendPayoutSuccess,
} = require('../src/services/smsService');

beforeEach(() => {
  jest.resetAllMocks();
  mockSend.mockResolvedValue({ SMSMessageData: {} });
  mockSmsLogCreate.mockResolvedValue({ id: 1 });
});

test('direct acceptance SMS states the agreed price before delivery', async () => {
  await sendOfferAccepted('+254700000004', {
    reference: 'NTO-20261123-ABC123',
    tradeType: 'direct',
    agreedPricePerKg: 680,
    commissionPercent: 0,
  });

  expect(mockSend).toHaveBeenCalledWith({
    to: ['+254700000004'],
    message: 'NectarTrace: Offer NTO-20261123-ABC123 accepted at KES 680 per kg before delivery. Deliver honey for weighing.',
  });
  expect(mockLogger.info).toHaveBeenCalledWith('SMS sent');
});

test('consignment acceptance SMS states the snapshotted commission', async () => {
  await sendOfferAccepted('+254700000004', {
    reference: 'NTO-20261123-ABC123',
    tradeType: 'consignment',
    agreedPricePerKg: null,
    commissionPercent: 9.75,
  });

  expect(mockSend.mock.calls[0][0].message).toContain('9.75% commission');
  expect(mockSend.mock.calls[0][0].message).not.toContain('null');
});

test('rejection SMS normalizes whitespace without logging offer or phone data', async () => {
  await sendOfferRejected('+254700000004', {
    reference: 'NTO-20261123-ABC123',
    rejectionReason: '  Capacity\n is full  ',
  });

  expect(mockSend.mock.calls[0][0].message).toContain('Reason: Capacity is full');
  expect(mockLogger.info).toHaveBeenCalledWith('SMS sent');
  expect(mockLogger.info.mock.calls[0]).toHaveLength(1);
});

test('consignment sale SMS states gross sale, commission, and whole-KES payout', async () => {
  await sendConsignmentSale('+254700000004', {
    reference: 'NTO-20261123-ABC123',
    saleAmount: 10001,
    commissionAmount: 1250.125,
    payoutAmount: 8751,
  });

  const message = mockSend.mock.calls[0][0].message;
  expect(message).toContain('Sale KES 10001');
  expect(message).toContain('commission KES 1250.13');
  expect(message).toContain('payout KES 8751');
});

test('payout result helpers provide safe success and failure messages', async () => {
  await sendPayoutSuccess('+254700000004', {
    reference: 'PAY-ONE',
    amount: 8751,
    transactionId: 'TX-123',
  });
  await sendPayoutFailure('+254700000004', {
    reference: 'PAY-TWO',
    amount: 8751,
    description: '  Provider\nrejected request  ',
  });

  expect(mockSend.mock.calls[0][0].message).toContain('receipt TX-123');
  expect(mockSend.mock.calls[1][0].message).toContain('Provider rejected request');
});
