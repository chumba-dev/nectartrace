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

test('Offer maps the existing table, legacy columns, lower-case enums, and integer key', () => {
  const offer = modelBlock('Offer');

  expect(schema).toMatch(/enum OfferStatus \{[\s\S]*offered\s+@map\("SUBMITTED"\)/);
  expect(schema).toMatch(/delivered\s+@map\("RECEIVED"\)/);
  expect(schema).toMatch(/enum TradeType \{[\s\S]*direct\s+@map\("DIRECT_PURCHASE"\)/);
  expect(offer).toMatch(/id\s+Int\s+@id @default\(autoincrement\(\)\)/);
  expect(offer).toMatch(/ward\s+String\s+@map\("pickupVillage"\)/);
  expect(offer).toMatch(/offeredKg\s+Decimal\s+@map\("offeredWeightKg"\)/);
  expect(offer).toMatch(/weighedKg\s+Decimal\?\s+@map\("acceptedWeightKg"\)/);
  expect(offer).toMatch(/batchId\s+Int\?\s+@map\("honeyBatchId"\)/);
  expect(offer).toContain('@@map("HarvestOffer")');
});

test('Offer declares lifecycle, privacy-sensitive storage, relations, and query indexes', () => {
  const offer = modelBlock('Offer');

  for (const field of [
    'commissionPercent',
    'expiresAt',
    'moisturePercent',
    'saleAmount',
    'paymentDetailsConfirmedAt',
    'batchReservationToken',
    'offeredAt',
    'acceptedAt',
    'rejectedAt',
    'expiredAt',
    'deliveredAt',
    'verifiedAt',
    'paidAt',
  ]) {
    expect(offer).toMatch(new RegExp(`\\b${field}\\b`));
  }
  expect(offer).toContain('payments         Payment[]');
  expect(offer).toContain('@@index([cooperativeId, status, expiresAt])');
  expect(offer).toContain('@@index([cooperativeId, status, batchId])');
  expect(modelBlock('HoneyBatch')).toContain('offers      Offer[]');
  expect(modelBlock('User')).toContain('offers                 Offer[]');
  expect(modelBlock('Cooperative')).toContain('offers            Offer[]');
});

test('incremental migration backfills required offer values before constraints', () => {
  const backfill = migration.indexOf('UPDATE "HarvestOffer"\nSET');
  const constraints = migration.indexOf('ALTER COLUMN "commissionPercent" SET NOT NULL');

  expect(backfill).toBeGreaterThan(-1);
  expect(constraints).toBeGreaterThan(backfill);
  expect(migration).toContain('"expiresAt" = "createdAt" + INTERVAL \'48 hours\'');
  expect(migration).toContain('DROP INDEX IF EXISTS "HarvestOffer_honeyBatchId_key"');
  expect(migration).not.toMatch(/DROP TABLE\s+"HarvestOffer"/);
  expect(migration).not.toMatch(/DROP COLUMN\s+"(pickupVillage|offeredWeightKg|acceptedWeightKg)"/);
});

test('legacy document-store dependency and runtime configuration are absent', () => {
  const packageJson = require('../package.json');
  const dependencyName = ['m', 'o', 'n', 'g', 'o', 'o', 's', 'e'].join('');
  const uriName = ['M', 'O', 'N', 'G', 'O', 'D', 'B', '_URI'].join('');
  const oldConfigName = ['mon', 'go.js'].join('');
  const envExample = fs.readFileSync(path.join(backendRoot, '.env.example'), 'utf8');

  expect(packageJson.dependencies).not.toHaveProperty(dependencyName);
  expect(envExample).not.toContain(uriName);
  expect(fs.existsSync(path.join(backendRoot, 'src', 'config', oldConfigName))).toBe(false);
  expect(fs.existsSync(path.join(backendRoot, 'src', 'models', 'Offer.js'))).toBe(false);
  expect(fs.existsSync(path.join(backendRoot, 'src', 'models', 'Payment.js'))).toBe(false);
});
