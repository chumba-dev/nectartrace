const mockPrisma = {
  $transaction: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);

const { createListing } = require('../src/controllers/listingController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const validListing = {
  batchId: 3,
  quantityKg: 10,
  pricePerKg: 750,
  imageUrl: 'https://images.example.com/honey.jpg',
};

beforeEach(() => {
  jest.resetAllMocks();
});

test.each([
  ['missing imageUrl', { imageUrl: undefined }, 'imageUrl is required and must be a non-empty string'],
  ['blank imageUrl', { imageUrl: '   ' }, 'imageUrl is required and must be a non-empty string'],
  [
    'non-HTTPS imageUrl',
    { imageUrl: 'http://images.example.com/honey.jpg' },
    'imageUrl must be an HTTPS URL or a JPEG, PNG, or WebP data image',
  ],
  [
    'invalid base64 imageUrl',
    { imageUrl: 'data:image/png;base64,not*base64' },
    'imageUrl must contain valid base64 image data',
  ],
])('listing creation rejects %s before a transaction', async (description, override, message) => {
  const req = {
    body: { ...validListing, ...override },
    user: { id: 2, role: 'COOPERATIVE_STAFF', cooperativeId: 4 },
  };
  const res = createResponse();
  const next = jest.fn();

  await createListing(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, message });
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('batch capacity excludes cancelled orders when creating a listing', async () => {
  const listing = { id: 8, ...validListing, cooperativeId: 4 };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    honeyBatch: {
      findUnique: jest.fn().mockResolvedValue({
        id: 3,
        cooperativeId: 4,
        status: 'AVAILABLE',
        weightKg: 100,
      }),
    },
    listing: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 20 } }),
      create: jest.fn().mockResolvedValue(listing),
    },
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 10 } }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(tx));
  const req = {
    body: validListing,
    user: { id: 2, role: 'COOPERATIVE_STAFF', cooperativeId: 4 },
  };
  const res = createResponse();
  const next = jest.fn();

  await createListing(req, res, next);

  expect(tx.order.aggregate).toHaveBeenCalledWith({
    where: {
      listing: { batchId: 3 },
      status: { not: 'CANCELLED' },
    },
    _sum: { quantityKg: true },
  });
  expect(tx.listing.create).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(next).not.toHaveBeenCalled();
});

test.each([
  ['non-integer batchId', { batchId: 1.5 }, 'batchId must be a positive integer'],
  ['zero quantityKg', { quantityKg: 0 }, 'quantityKg must be a positive finite number'],
  ['negative pricePerKg', { pricePerKg: -1 }, 'pricePerKg must be a positive finite number'],
  ['non-finite pricePerKg', { pricePerKg: 'Infinity' }, 'pricePerKg must be a positive finite number'],
])('listing creation rejects %s before a transaction', async (description, override, message) => {
  const req = {
    body: { ...validListing, ...override },
    user: { id: 2, role: 'COOPERATIVE_STAFF', cooperativeId: 4 },
  };
  const res = createResponse();
  const next = jest.fn();

  await createListing(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, message });
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});
