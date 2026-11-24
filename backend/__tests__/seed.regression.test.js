const mockPrismaClient = jest.fn();

jest.mock('@prisma/client', () => ({ PrismaClient: mockPrismaClient }));

const { loadSeedConfig } = require('../prisma/seed');

test('importing the seed module does not instantiate Prisma or connect to a database', () => {
  expect(mockPrismaClient).not.toHaveBeenCalled();
});

test('development seed defaults cover every non-admin public role', () => {
  const config = loadSeedConfig({ NODE_ENV: 'development' });

  expect(config.accounts.map(({ role }) => role)).toEqual([
    'ADMIN',
    'COOPERATIVE_STAFF',
    'FARMER',
    'BUYER',
    'CONSUMER',
  ]);
  expect(config.cooperative.commissionPercent).toBe(0);
});

test('production seeding fails when explicit admin credentials are absent', () => {
  expect(() => loadSeedConfig({ NODE_ENV: 'production' })).toThrow(
    'SEED_ADMIN_EMAIL is required when NODE_ENV=production'
  );
  expect(mockPrismaClient).not.toHaveBeenCalled();
});

test('production defaults to an admin-only seed when credentials are supplied', () => {
  const config = loadSeedConfig({
    NODE_ENV: 'production',
    SEED_ADMIN_NAME: 'Production Admin',
    SEED_ADMIN_EMAIL: 'admin@example.com',
    SEED_ADMIN_PHONE: '+254700000001',
    SEED_ADMIN_PASSWORD: 'strong-production-password',
  });

  expect(config.mode).toBe('admin-only');
  expect(config.cooperative).toBeNull();
  expect(config.accounts).toHaveLength(1);
  expect(config.accounts[0].role).toBe('ADMIN');
});
