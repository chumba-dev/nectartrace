const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');

function validPayment(overrides = {}) {
  return new Payment({
    offerId: new mongoose.Types.ObjectId(),
    farmerId: 4,
    amount: 1250,
    reference: 'PAY-20261123-ABC123',
    purpose: 'direct_purchase',
    ...overrides,
  });
}

test('Payment declares the Daraja ledger lifecycle and whole-KES constraints', async () => {
  const payment = validPayment();

  await expect(payment.validate()).resolves.toBeUndefined();
  expect(payment.method).toBe('daraja_b2c');
  expect(payment.status).toBe('pending');
  expect(Payment.schema.path('purpose').enumValues).toEqual([
    'direct_purchase',
    'consignment',
  ]);
  expect(Payment.schema.path('status').enumValues).toEqual([
    'pending',
    'submitted',
    'succeeded',
    'failed',
    'timeout',
  ]);
});

test.each([
  ['farmerId', 0],
  ['farmerId', 1.5],
  ['amount', 0],
  ['amount', 10.5],
])('Payment rejects invalid %s value %p', async (field, value) => {
  let validation;
  try {
    await validPayment({ [field]: value }).validate();
  } catch (err) {
    validation = err;
  }

  expect(validation?.errors[field]).toBeDefined();
});

test('Payment has unique reference and offer-purpose indexes without credential fields', () => {
  const indexes = Payment.schema.indexes();

  expect(indexes).toEqual(expect.arrayContaining([
    [{ reference: 1 }, expect.objectContaining({ unique: true })],
    [{ offerId: 1, purpose: 1 }, expect.objectContaining({ unique: true })],
  ]));
  expect(Payment.schema.path('reference').options.immutable).toBe(true);
  expect(Payment.schema.path('offerId').options.immutable).toBe(true);
  expect(Payment.schema.paths).not.toHaveProperty('pin');
  expect(Payment.schema.paths).not.toHaveProperty('consumerSecret');
  expect(Payment.schema.paths).not.toHaveProperty('securityCredential');
});
