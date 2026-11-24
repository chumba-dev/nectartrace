const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(
  backendRoot,
  'prisma',
  'migrations',
  '20261124093000_postgresql_offers_and_payments',
  'migration.sql'
), 'utf8');

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing ${name} model`);
  return match[1];
}

test('Payment declares whole-KES identity, provider metadata, and lower-case lifecycle enums', () => {
  const payment = modelBlock('Payment');

  expect(payment).toMatch(/id\s+Int\s+@id @default\(autoincrement\(\)\)/);
  expect(payment).toMatch(/offerId\s+Int/);
  expect(payment).toMatch(/farmerId\s+Int/);
  expect(payment).toMatch(/amount\s+Int/);
  expect(schema).toMatch(/enum PaymentPurpose \{\s+direct_purchase\s+consignment\s+\}/);
  expect(schema).toMatch(/enum PaymentStatus \{\s+pending\s+submitted\s+succeeded\s+failed\s+timeout\s+\}/);
  for (const field of [
    'originatorConversationId',
    'conversationId',
    'transactionId',
    'resultCode',
    'resultDescription',
    'requestedAt',
    'submittedAt',
    'completedAt',
    'failedAt',
  ]) {
    expect(payment).toMatch(new RegExp(`\\b${field}\\b`));
  }
});

test('Payment enforces global reference and offer-purpose uniqueness with useful relations', () => {
  const payment = modelBlock('Payment');

  expect(payment).toMatch(/reference\s+String\s+@unique/);
  expect(payment).toContain('@@unique([offerId, purpose])');
  expect(payment).toContain('@@index([farmerId, status])');
  expect(payment).toContain('@@index([cooperativeId, status])');
  expect(payment).toContain('offer       Offer');
  expect(payment).toContain('farmer      User');
  expect(payment).toContain('cooperative Cooperative');
  expect(modelBlock('Offer')).toContain('payments         Payment[]');
  expect(modelBlock('User')).toContain('payments               Payment[]');
  expect(modelBlock('Cooperative')).toContain('payments          Payment[]');
});

test('Payment schema and migration contain no payout credentials', () => {
  const payment = modelBlock('Payment').toLowerCase();

  expect(payment).not.toContain('pin');
  expect(payment).not.toContain('consumersecret');
  expect(payment).not.toContain('securitycredential');
  expect(migration).toContain('CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0)');
  expect(migration).toContain('CREATE UNIQUE INDEX "Payment_reference_key"');
  expect(migration).toContain('CREATE UNIQUE INDEX "Payment_offerId_purpose_key"');
  expect(migration).toContain('FOREIGN KEY ("offerId") REFERENCES "HarvestOffer"("id")');
});

test('legacy settlement table is retained and explicitly inactive', () => {
  expect(schema).toContain('Legacy compatibility only. Active payout code uses Payment.');
  expect(schema).toContain('model FarmerSettlement');
  expect(migration).toContain('Legacy compatibility only; active payouts use Payment.');
  expect(migration).not.toMatch(/DROP TABLE\s+"FarmerSettlement"/);
});
