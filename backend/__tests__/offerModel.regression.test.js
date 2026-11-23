const Offer = require('../src/models/Offer');

function validOffer(overrides = {}) {
  return new Offer({
    farmerId: 4,
    cooperativeId: 2,
    ward: 'Kabarnet',
    offeredKg: 50,
    expectedPricePerKg: 0,
    tradeType: 'consignment',
    commissionPercent: 12.5,
    reference: 'NTO-20261123-ABC123',
    ussdSessionId: 'session-private',
    ...overrides,
  });
}

test('Offer defaults to the lower-case offered lifecycle and expires after 48 hours', async () => {
  const offer = validOffer();

  await expect(offer.validate()).resolves.toBeUndefined();
  expect(offer.status).toBe('offered');
  expect(offer.expiresAt.getTime() - offer.offeredAt.getTime()).toBe(48 * 60 * 60 * 1000);
  expect(Offer.schema.path('status').enumValues).toEqual([
    'offered',
    'accepted',
    'rejected',
    'expired',
    'delivered',
    'verified',
    'paid',
  ]);
});

test.each([
  ['offeredKg', 0],
  ['offeredKg', 10000.01],
  ['expectedPricePerKg', -1],
  ['commissionPercent', -0.1],
  ['commissionPercent', 100.1],
  ['agreedPricePerKg', -1],
  ['weighedKg', 0],
  ['weighedKg', 10001],
  ['moisturePercent', 0],
  ['moisturePercent', 100],
  ['saleAmount', -1],
  ['farmerId', 1.5],
  ['cooperativeId', 0],
])('Offer rejects invalid %s value %p', async (field, value) => {
  let validation;
  try {
    await validOffer({ [field]: value }).validate();
  } catch (err) {
    validation = err;
  }

  expect(validation?.errors[field]).toBeDefined();
});

test('commissionPercent remains immutable after creation', () => {
  const offer = validOffer({ commissionPercent: 8 });
  offer.$isNew = false;

  offer.commissionPercent = 20;

  expect(offer.commissionPercent).toBe(8);
});

test('Offer JSON never exposes the USSD session identifier', () => {
  const json = validOffer({
    batchId: 'BAR-2026-001',
    batchReservationToken: '11111111-1111-4111-8111-111111111111',
  }).toJSON();

  expect(json.id).toBeDefined();
  expect(json).not.toHaveProperty('_id');
  expect(json).not.toHaveProperty('__v');
  expect(json).not.toHaveProperty('ussdSessionId');
  expect(json).not.toHaveProperty('batchReservationToken');
  expect(Offer.schema.path('paymentDetailsConfirmedAt')).toBeDefined();
  expect(Offer.schema.paths).not.toHaveProperty('mpesaNumber');
  expect(Offer.schema.paths).not.toHaveProperty('pin');
});

test('Offer declares the lifecycle query and farmer history indexes', () => {
  const indexes = Offer.schema.indexes().map(([definition]) => definition);

  expect(indexes).toContainEqual({ cooperativeId: 1, status: 1, expiresAt: 1 });
  expect(indexes).toContainEqual({ cooperativeId: 1, status: 1, batchId: 1 });
  expect(indexes).toContainEqual({ farmerId: 1, createdAt: -1 });
  expect(indexes).toContainEqual({ ussdSessionId: 1 });
  expect(indexes).toContainEqual({ reference: 1 });
});

test('Offer validates final batch IDs and request-scoped reservation tokens', async () => {
  await expect(validOffer({
    batchId: 'BAR-2026-001',
    batchReservationToken: '11111111-1111-4111-8111-111111111111',
  }).validate()).resolves.toBeUndefined();

  await expect(validOffer({ batchId: 'temporary-or-invalid' }).validate())
    .rejects.toMatchObject({ name: 'ValidationError' });
  await expect(validOffer({ batchReservationToken: 'not-a-uuid' }).validate())
    .rejects.toMatchObject({ name: 'ValidationError' });
});
