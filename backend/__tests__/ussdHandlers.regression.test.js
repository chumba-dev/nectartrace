const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  honeyBatch: {
    findFirst: jest.fn(),
  },
  listing: {
    create: jest.fn(),
  },
};

jest.mock('../src/config/db', () => mockPrisma);
jest.mock('../src/services/smsService', () => ({
  sendHarvestConfirmation: jest.fn(),
  sendListingConfirmation: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { handleListHoney } = require('../src/services/ussdHandlers');

const linkedStaff = {
  id: 6,
  name: 'Cooperative Staff',
  role: 'COOPERATIVE_STAFF',
  isActive: true,
  cooperativeId: 14,
  cooperative: { id: 14, name: 'Honey Cooperative' },
};

beforeEach(() => {
  jest.resetAllMocks();
});

test.each(['FARMER', 'BUYER', 'ADMIN'])(
  'USSD listing rejects %s without creating a listing',
  async (role) => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...linkedStaff, role });

    const response = await handleListHoney(['4', '10', '750'], '254700000006');

    expect(response).toBe(
      'END Only active cooperative staff linked to a cooperative can list honey.'
    );
    expect(mockPrisma.honeyBatch.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.listing.create).not.toHaveBeenCalled();
  }
);

test.each([
  ['inactive staff', { isActive: false }],
  ['staff without cooperativeId', { cooperativeId: null }],
  ['staff without a linked cooperative', { cooperative: null }],
])('USSD listing rejects %s', async (description, override) => {
  mockPrisma.user.findUnique.mockResolvedValue({ ...linkedStaff, ...override });

  const response = await handleListHoney(['4'], '+254700000006');

  expect(response).toBe(
    'END Only active cooperative staff linked to a cooperative can list honey.'
  );
  expect(mockPrisma.listing.create).not.toHaveBeenCalled();
});

test('active linked cooperative staff reaches the dashboard image requirement without a DB write', async () => {
  mockPrisma.user.findUnique.mockResolvedValue(linkedStaff);

  const response = await handleListHoney(['4', '10', '750'], '254700000006');

  expect(response).toBe(
    'END Use the NectarTrace web dashboard to add the required honey photo and publish a listing.'
  );
  expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
    where: { phone: '+254700000006' },
    include: { cooperative: true },
  });
  expect(mockPrisma.honeyBatch.findFirst).not.toHaveBeenCalled();
  expect(mockPrisma.listing.create).not.toHaveBeenCalled();
});
