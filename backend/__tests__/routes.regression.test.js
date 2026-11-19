jest.mock('../src/controllers/batchController', () => ({
  createBatch: jest.fn((req, res) => res.json({ handler: 'createBatch' })),
  listBatches: jest.fn((req, res) => res.json({ handler: 'listBatches' })),
  getBatch: jest.fn((req, res) => res.json({ handler: 'getBatch' })),
  verifyBatch: jest.fn((req, res) => res.json({ handler: 'verifyBatch' })),
  getMyBatches: jest.fn((req, res) => res.json({ handler: 'getMyBatches' })),
  updateStatus: jest.fn((req, res) => res.json({ handler: 'updateStatus' })),
  getBatchQR: jest.fn((req, res) => res.json({ handler: 'getBatchQR' })),
}));

jest.mock('../src/controllers/orderController', () => ({
  createOrder: jest.fn((req, res) => res.status(201).json({ handler: 'createOrder' })),
  listOrders: jest.fn((req, res) => res.json({ handler: 'listOrders' })),
  getOrder: jest.fn((req, res) => res.json({ handler: 'getOrder' })),
  updateOrderStatus: jest.fn((req, res) => res.json({ handler: 'updateOrderStatus' })),
}));

jest.mock('../src/controllers/harvestOfferController', () => ({
  listOffers: jest.fn((req, res) => res.json({ handler: 'listOffers' })),
  listMyOffers: jest.fn((req, res) => res.json({ handler: 'listMyOffers' })),
  updateOfferStatus: jest.fn((req, res) => res.json({ handler: 'updateOfferStatus' })),
  verifyOffer: jest.fn((req, res) => res.status(201).json({ handler: 'verifyOffer' })),
  upsertSettlement: jest.fn((req, res) => res.json({ handler: 'upsertSettlement' })),
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = {
      id: 1,
      role: req.get('x-test-role') || 'COOPERATIVE_STAFF',
      cooperativeId: 2,
    };
    next();
  }),
  authorize: jest.fn((...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false });
    }
    return next();
  }),
}));

const express = require('express');
const request = require('supertest');
const batchController = require('../src/controllers/batchController');
const orderController = require('../src/controllers/orderController');
const harvestOfferController = require('../src/controllers/harvestOfferController');
const batchRouter = require('../src/routes/batches');
const orderRouter = require('../src/routes/orders');
const harvestOfferRouter = require('../src/routes/harvestOffers');

const app = express();
app.use(express.json());
app.use('/batches', batchRouter);
app.use('/orders', orderRouter);
app.use('/harvest-offers', harvestOfferRouter);

beforeEach(() => {
  jest.clearAllMocks();
});

test('GET /batches/my dispatches to getMyBatches before the parameter route', async () => {
  const response = await request(app).get('/batches/my');

  expect(response.status).toBe(200);
  expect(response.body.handler).toBe('getMyBatches');
  expect(batchController.getMyBatches).toHaveBeenCalledTimes(1);
  expect(batchController.getBatch).not.toHaveBeenCalled();
});

describe('order route role gates', () => {
  test('BUYER can create an order', async () => {
    const response = await request(app)
      .post('/orders')
      .set('x-test-role', 'BUYER')
      .send({});

    expect(response.status).toBe(201);
    expect(orderController.createOrder).toHaveBeenCalledTimes(1);
  });

  test.each(['COOPERATIVE_STAFF', 'ADMIN', 'FARMER'])(
    '%s cannot create an order',
    async (role) => {
      const response = await request(app)
        .post('/orders')
        .set('x-test-role', role)
        .send({});

      expect(response.status).toBe(403);
      expect(orderController.createOrder).not.toHaveBeenCalled();
    }
  );

  test.each(['BUYER', 'COOPERATIVE_STAFF', 'ADMIN'])(
    '%s can use both order read routes',
    async (role) => {
      const listResponse = await request(app).get('/orders').set('x-test-role', role);
      const detailResponse = await request(app).get('/orders/9').set('x-test-role', role);

      expect(listResponse.status).toBe(200);
      expect(detailResponse.status).toBe(200);
      expect(orderController.listOrders).toHaveBeenCalledTimes(1);
      expect(orderController.getOrder).toHaveBeenCalledTimes(1);
    }
  );

  test('FARMER cannot use either order read route', async () => {
    const listResponse = await request(app).get('/orders').set('x-test-role', 'FARMER');
    const detailResponse = await request(app).get('/orders/9').set('x-test-role', 'FARMER');

    expect(listResponse.status).toBe(403);
    expect(detailResponse.status).toBe(403);
    expect(orderController.listOrders).not.toHaveBeenCalled();
    expect(orderController.getOrder).not.toHaveBeenCalled();
  });

  test.each(['COOPERATIVE_STAFF', 'ADMIN'])(
    '%s can update order status',
    async (role) => {
      const response = await request(app)
        .put('/orders/9/status')
        .set('x-test-role', role)
        .send({ status: 'CONFIRMED' });

      expect(response.status).toBe(200);
      expect(orderController.updateOrderStatus).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['BUYER', 'FARMER'])(
    '%s cannot update order status',
    async (role) => {
      const response = await request(app)
        .put('/orders/9/status')
        .set('x-test-role', role)
        .send({ status: 'CONFIRMED' });

      expect(response.status).toBe(403);
      expect(orderController.updateOrderStatus).not.toHaveBeenCalled();
    }
  );
});

describe('harvest-offer route role gates', () => {
  test('FARMER reaches /my before staff-only routes', async () => {
    const response = await request(app)
      .get('/harvest-offers/my')
      .set('x-test-role', 'FARMER');

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe('listMyOffers');
    expect(harvestOfferController.listMyOffers).toHaveBeenCalledTimes(1);
    expect(harvestOfferController.listOffers).not.toHaveBeenCalled();
  });

  test.each(['COOPERATIVE_STAFF', 'ADMIN'])(
    '%s can list and manage harvest offers',
    async (role) => {
      const listResponse = await request(app)
        .get('/harvest-offers')
        .set('x-test-role', role);
      const statusResponse = await request(app)
        .put('/harvest-offers/9/status')
        .set('x-test-role', role)
        .send({});

      expect(listResponse.status).toBe(200);
      expect(statusResponse.status).toBe(200);
    }
  );

  test('FARMER cannot use staff harvest-offer routes', async () => {
    const response = await request(app)
      .get('/harvest-offers')
      .set('x-test-role', 'FARMER');

    expect(response.status).toBe(403);
    expect(harvestOfferController.listOffers).not.toHaveBeenCalled();
  });
});
