const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { normalizeEmail, normalizePhone } = require('../src/utils/normalization');

const DEVELOPMENT_DEFAULTS = Object.freeze({
  SEED_ADMIN_NAME: 'Development Admin',
  SEED_ADMIN_EMAIL: 'admin@nectartrace.local',
  SEED_ADMIN_PHONE: '+254700000001',
  SEED_ADMIN_PASSWORD: 'development-admin-password',
  SEED_COOPERATIVE_NAME: 'NectarTrace Development Cooperative',
  SEED_COOPERATIVE_VILLAGE: 'Kabarnet',
  SEED_COOPERATIVE_WARD: 'Kabarnet',
  SEED_COOPERATIVE_COUNTY: 'Baringo',
  SEED_COOPERATIVE_WALLET_ADDRESS: '0x0000000000000000000000000000000000000001',
  SEED_COOPERATIVE_REGISTRATION_NUMBER: 'DEV-COOP-001',
  SEED_COOPERATIVE_PHONE: '+254700000002',
  SEED_COOPERATIVE_COMMISSION_PERCENT: '0',
  SEED_STAFF_NAME: 'Development Cooperative Staff',
  SEED_STAFF_EMAIL: 'staff@nectartrace.local',
  SEED_STAFF_PHONE: '+254700000003',
  SEED_STAFF_PASSWORD: 'development-staff-password',
  SEED_FARMER_NAME: 'Development Farmer',
  SEED_FARMER_EMAIL: 'farmer@nectartrace.local',
  SEED_FARMER_PHONE: '+254700000004',
  SEED_FARMER_PASSWORD: 'development-farmer-password',
  SEED_BUYER_NAME: 'Development Buyer',
  SEED_BUYER_EMAIL: 'buyer@nectartrace.local',
  SEED_BUYER_PHONE: '+254700000005',
  SEED_BUYER_PASSWORD: 'development-buyer-password',
  SEED_CONSUMER_NAME: 'Development Consumer',
  SEED_CONSUMER_EMAIL: 'consumer@nectartrace.local',
  SEED_CONSUMER_PHONE: '+254700000006',
  SEED_CONSUMER_PASSWORD: 'development-consumer-password',
});

function readSeedValue(env, key) {
  const value = typeof env[key] === 'string' ? env[key].trim() : '';
  if (value) return value;
  if (env.NODE_ENV !== 'production') return DEVELOPMENT_DEFAULTS[key];
  throw new Error(`${key} is required when NODE_ENV=production`);
}

function readAccount(env, prefix, role) {
  const emailKey = `SEED_${prefix}_EMAIL`;
  const phoneKey = `SEED_${prefix}_PHONE`;
  const passwordKey = `SEED_${prefix}_PASSWORD`;
  const email = normalizeEmail(readSeedValue(env, emailKey));
  const phone = normalizePhone(readSeedValue(env, phoneKey));
  const password = readSeedValue(env, passwordKey);

  if (!email) throw new Error(`${emailKey} must be a valid email address`);
  if (!phone) throw new Error(`${phoneKey} must be a valid phone number`);
  if (password.length < 8) throw new Error(`${passwordKey} must contain at least 8 characters`);

  return {
    name: readSeedValue(env, `SEED_${prefix}_NAME`),
    email,
    phone,
    password,
    role,
  };
}

function loadSeedConfig(env = process.env) {
  const admin = readAccount(env, 'ADMIN', 'ADMIN');
  const mode = String(
    env.SEED_MODE || (env.NODE_ENV === 'production' ? 'admin-only' : 'full')
  )
    .trim()
    .toLowerCase();
  if (!['admin-only', 'full'].includes(mode)) {
    throw new Error('SEED_MODE must be admin-only or full');
  }
  if (mode === 'admin-only') {
    return { mode, cooperative: null, accounts: [admin] };
  }

  const commissionPercent = Number(readSeedValue(env, 'SEED_COOPERATIVE_COMMISSION_PERCENT'));
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error('SEED_COOPERATIVE_COMMISSION_PERCENT must be between 0 and 100');
  }

  return {
    mode,
    cooperative: {
      name: readSeedValue(env, 'SEED_COOPERATIVE_NAME'),
      village: readSeedValue(env, 'SEED_COOPERATIVE_VILLAGE'),
      ward: readSeedValue(env, 'SEED_COOPERATIVE_WARD'),
      county: readSeedValue(env, 'SEED_COOPERATIVE_COUNTY'),
      walletAddress: readSeedValue(env, 'SEED_COOPERATIVE_WALLET_ADDRESS'),
      registrationNumber: readSeedValue(env, 'SEED_COOPERATIVE_REGISTRATION_NUMBER'),
      phone: normalizePhone(readSeedValue(env, 'SEED_COOPERATIVE_PHONE')),
      commissionPercent,
    },
    accounts: [
      admin,
      readAccount(env, 'STAFF', 'COOPERATIVE_STAFF'),
      readAccount(env, 'FARMER', 'FARMER'),
      readAccount(env, 'BUYER', 'BUYER'),
      readAccount(env, 'CONSUMER', 'CONSUMER'),
    ],
  };
}

async function upsertSeedUser(prisma, account, cooperativeId, verifiedAt) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  const data = {
    name: account.name,
    phone: account.phone,
    passwordHash,
    role: account.role,
    cooperativeId: account.role === 'COOPERATIVE_STAFF' ? cooperativeId : null,
    emailVerifiedAt: verifiedAt,
    isActive: true,
  };

  return prisma.user.upsert({
    where: { email: account.email },
    create: { ...data, email: account.email },
    update: data,
    select: { id: true, email: true, role: true, cooperativeId: true },
  });
}

async function seedDatabase(prisma, config) {
  const now = new Date();
  let cooperative = null;
  if (config.cooperative) {
    const existingCooperative = await prisma.cooperative.findUnique({
      where: { name: config.cooperative.name },
      select: { id: true, verifiedAt: true },
    });
    cooperative = await prisma.cooperative.upsert({
      where: { name: config.cooperative.name },
      create: {
        ...config.cooperative,
        isVerified: true,
        verifiedAt: now,
      },
      update: {
        ...config.cooperative,
        isVerified: true,
        verifiedAt: existingCooperative?.verifiedAt || now,
      },
      select: { id: true, name: true, isVerified: true },
    });
  }

  const users = [];
  for (const account of config.accounts) {
    users.push(await upsertSeedUser(prisma, account, cooperative?.id || null, now));
  }

  return { cooperative, users };
}

async function main() {
  const config = loadSeedConfig(process.env);
  const prisma = new PrismaClient();
  try {
    const result = await seedDatabase(prisma, config);
    console.log(
      result.cooperative
        ? `Seeded ${result.users.length} users and cooperative ${result.cooperative.name}`
        : `Seeded ${result.users.length} administrator account`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { loadSeedConfig, seedDatabase, main };
