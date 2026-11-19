const mockPrisma = {
  $transaction: jest.fn(),
};

jest.mock('../src/config/db', () => mockPrisma);

const { createOrder, updateOrderStatus } = require('../src/controllers/orderController');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
});

test.each([0, -1, '0', '-2.5'])(
  'order creation rejects nonpositive quantity %p before a transaction',
  async (quantityKg) => {
    const req = {
      body: { listingId: 4, quantityKg },
      user: { id: 8, role: 'BUYER' },
    };
    const res = createResponse();
    const next = jest.fn();

    await createOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'quantityKg must be a positive finite number',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  }
);

test('order creation reserves inventory atomically before creating the order', async () => {
  const order = { id: 31, listingId: 4, buyerId: 8, quantityKg: 2, totalPrice: 1200 };
  const tx = {
    listing: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: 4,
        quantityKg: 0,
        pricePerKg: 600,
        isAvailable: true,
      }),
      update: jest.fn().mockResolvedValue({
        id: 4,
        quantityKg: 0,
        pricePerKg: 600,
        isAvailable: false,
      }),
    },
    order: {
      create: jest.fn().mockResolvedValue(order),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(tx));
  const req = {
    body: { listingId: '4', quantityKg: '2', notes: 'Deliver Friday' },
    user: { id: 8, role: 'BUYER' },
  };
  const res = createResponse();
  const next = jest.fn();

  await createOrder(req, res, next);

  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.listing.updateMany).toHaveBeenCalledWith({
    where: { id: 4, isAvailable: true, quantityKg: { gte: 2 } },
    data: { quantityKg: { decrement: 2 } },
  });
  expect(tx.listing.update).toHaveBeenCalledWith({
    where: { id: 4 },
    data: { isAvailable: false },
  });
  expect(tx.order.create).toHaveBeenCalledWith({
    data: {
      listingId: 4,
      buyerId: 8,
      quantityKg: 2,
      totalPrice: 1200,
      notes: 'Deliver Friday',
    },
    include: { listing: true },
  });
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ success: true, data: order });
  expect(next).not.toHaveBeenCalled();
});

test('cancelling an order restores inventory in the status transaction', async () => {
  const existingOrder = {
    id: 31,
    status: 'PENDING',
    quantityKg: 2,
    listing: { id: 4, cooperativeId: 12 },
  };
  const cancelledOrder = { ...existingOrder, status: 'CANCELLED' };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn().mockResolvedValue(existingOrder),
      update: jest.fn().mockResolvedValue(cancelledOrder),
    },
    listing: {
      update: jest.fn().mockResolvedValue({ id: 4, quantityKg: 2, isAvailable: true }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (operation) => operation(tx));
  const req = {
    params: { id: '31' },
    body: { status: 'CANCELLED' },
    user: { id: 5, role: 'COOPERATIVE_STAFF', cooperativeId: 12 },
  };
  const res = createResponse();
  const next = jest.fn();

  await updateOrderStatus(req, res, next);

  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  expect(tx.listing.update).toHaveBeenCalledWith({
    where: { id: 4 },
    data: {
      quantityKg: { increment: 2 },
      isAvailable: true,
    },
  });
  expect(tx.order.update).toHaveBeenCalledWith({
    where: { id: 31 },
    data: { status: 'CANCELLED' },
  });
  expect(res.json).toHaveBeenCalledWith({ success: true, data: cancelledOrder });
  expect(next).not.toHaveBeenCalled();
});
