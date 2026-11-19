const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  harvestOffer: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  cooperative: {
    findMany: jest.fn(),
  },
};
const mockSmsService = {
  sendHarvestConfirmation: jest.fn(),
  sendHarvestOfferConfirmation: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/smsService', () => mockSmsService);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { handleHarvestOffer } = require('../src/services/ussdHandlers');

const farmer = {
  id: 6,
  name: 'Farmer',
  role: 'FARMER',
  isActive: true,
  cooperativeId: null,
  cooperative: null,
};
const cooperatives = [
  { id: 14, name: 'Baringo Honey', village: 'Kabarnet' },
  { id: 15, name: 'Highland Bees', village: 'Eldama Ravine' },
];

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(farmer);
  mockPrisma.harvestOffer.findUnique.mockResolvedValue(null);
  mockPrisma.cooperative.findMany.mockResolvedValue(cooperatives);
  mockSmsService.sendHarvestOfferConfirmation.mockResolvedValue({});
});

test.each(['BUYER', 'COOPERATIVE_STAFF', 'ADMIN'])(
  'USSD harvest offers reject active %s accounts',
  async (role) => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...farmer, role });

    const response = await handleHarvestOffer(['4'], '254700000006', 'session-1');

    expect(response).toBe('END Only active farmer accounts can submit harvest offers.');
    expect(mockPrisma.harvestOffer.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.harvestOffer.create).not.toHaveBeenCalled();
  }
);

test('option 4 asks for a pickup village before cooperative selection', async () => {
  const response = await handleHarvestOffer(['4'], '254700000006', 'session-1');

  expect(response).toBe('CON Enter your village or pickup area:');
  expect(mockPrisma.cooperative.findMany).not.toHaveBeenCalled();
});

test('option 4 prioritizes cooperatives in the pickup village', async () => {
  const response = await handleHarvestOffer(
    ['4', 'Kabarnet'],
    '254700000006',
    'session-1'
  );

  expect(response).toContain('CON Cooperatives near Kabarnet:');
  expect(response).toContain('1. Baringo Honey (Kabarnet)');
  expect(mockPrisma.cooperative.findMany).toHaveBeenCalledWith({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, village: true },
  });
});

test('creates a consignment offer without a marketplace listing and sends confirmation', async () => {
  mockPrisma.harvestOffer.create.mockImplementation(async ({ data }) => ({
    id: 21,
    ...data,
    cooperative: cooperatives[0],
  }));

  const response = await handleHarvestOffer(
    ['4', 'Kabarnet', '1', '25.5', '', '2'],
    '254700000006',
    'session-2'
  );

  expect(mockPrisma.harvestOffer.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      reference: expect.stringMatching(/^NTO-\d{8}-[A-F0-9]{8}$/),
      ussdSessionId: 'session-2',
      farmerId: farmer.id,
      cooperativeId: cooperatives[0].id,
      pickupVillage: 'Kabarnet',
      offeredWeightKg: 25.5,
      expectedPricePerKg: null,
      settlementType: 'CONSIGNMENT',
    }),
    include: { cooperative: true },
  });
  expect(response).toMatch(/^END Offer NTO-/);
  expect(mockSmsService.sendHarvestOfferConfirmation).toHaveBeenCalledWith(
    '254700000006',
    expect.stringMatching(/^NTO-/),
    'Baringo Honey'
  );
});

test("a replay of the same Africa's Talking session returns the existing offer", async () => {
  mockPrisma.harvestOffer.findUnique.mockResolvedValue({
    id: 21,
    reference: 'NTO-20261119-ABC123',
    ussdSessionId: 'session-replay',
    farmerId: farmer.id,
    cooperative: cooperatives[1],
  });

  const response = await handleHarvestOffer(
    ['4', '2', '40', '700', '1'],
    '+254700000006',
    'session-replay'
  );

  expect(response).toBe(
    'END Offer NTO-20261119-ABC123 submitted to Highland Bees.\nConfirmation sent via SMS.'
  );
  expect(mockPrisma.harvestOffer.create).not.toHaveBeenCalled();
  expect(mockSmsService.sendHarvestOfferConfirmation).not.toHaveBeenCalled();
});

test('phone lookup falls back to an exact legacy number', async () => {
  mockPrisma.user.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(farmer);

  await handleHarvestOffer(['4'], '0700000006', 'session-legacy');

  expect(mockPrisma.user.findUnique).toHaveBeenNthCalledWith(1, {
    where: { phone: '+254700000006' },
    include: { cooperative: true },
  });
  expect(mockPrisma.user.findUnique).toHaveBeenNthCalledWith(2, {
    where: { phone: '0700000006' },
    include: { cooperative: true },
  });
});
