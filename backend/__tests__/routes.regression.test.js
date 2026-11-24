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
  listAdminOrders: jest.fn((req, res) => res.json({ handler: 'listAdminOrders' })),
  getOrder: jest.fn((req, res) => res.json({ handler: 'getOrder' })),
  updateOrderStatus: jest.fn((req, res) => res.json({ handler: 'updateOrderStatus' })),
}));

jest.mock('../src/controllers/harvestOfferController', () => ({
  acceptOffer: jest.fn((req, res) => res.json({ handler: 'acceptOffer' })),
  getMyOffer: jest.fn((req, res) => res.json({ handler: 'getMyOffer' })),
  listOffers: jest.fn((req, res) => res.json({ handler: 'listOffers' })),
  listMyOffers: jest.fn((req, res) => res.json({ handler: 'listMyOffers' })),
  recordConsignmentSale: jest.fn((req, res) => res.json({ handler: 'recordConsignmentSale' })),
  recordDelivery: jest.fn((req, res) => res.json({ handler: 'recordDelivery' })),
  rejectOffer: jest.fn((req, res) => res.json({ handler: 'rejectOffer' })),
  updateOfferStatus: jest.fn((req, res) => res.json({ handler: 'updateOfferStatus' })),
  verifyFarmer: jest.fn((req, res) => res.json({ handler: 'verifyFarmer' })),
  verifyOffer: jest.fn((req, res) => res.json({ handler: 'verifyOffer' })),
}));

jest.mock('../src/controllers/adminController', () => ({
  listUsers: jest.fn((req, res) => res.json({ handler: 'listUsers' })),
  toggleUserActive: jest.fn((req, res) => res.json({ handler: 'toggleUserActive' })),
  createCooperative: jest.fn((req, res) => res.status(201).json({ handler: 'createCooperative' })),
  verifyCooperative: jest.fn((req, res) => res.json({ handler: 'verifyCooperative' })),
  getPlatformStats: jest.fn((req, res) => res.json({ handler: 'getPlatformStats' })),
}));

jest.mock('../src/controllers/cooperativeApplicationController', () => ({
  approveApplication: jest.fn((req, res) => res.json({ handler: 'approveApplication' })),
  listApplications: jest.fn((req, res) => res.json({ handler: 'listApplications' })),
  rejectApplication: jest.fn((req, res) => res.json({ handler: 'rejectApplication' })),
}));

jest.mock('../src/controllers/paymentController', () => ({
  confirmOfferPaymentDetails: jest.fn((req, res) => res.json({ handler: 'confirmOfferPaymentDetails' })),
  darajaResult: jest.fn((req, res) => res.json({ handler: 'darajaResult' })),
  darajaTimeout: jest.fn((req, res) => res.json({ handler: 'darajaTimeout' })),
  getOfferPayment: jest.fn((req, res) => res.json({ handler: 'getOfferPayment' })),
  initiateOfferPayout: jest.fn((req, res) => res.json({ handler: 'initiateOfferPayout' })),
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
  attachActiveMembershipForCooperativeStaff: jest.fn((req, res, next) => {
    if (req.user.role === 'COOPERATIVE_STAFF') {
      req.cooperativeMembership = { cooperativeId: 2, role: 'OWNER', isActive: true };
    }
    next();
  }),
  requireActiveCooperativeMembership: jest.fn((req, res, next) => {
    req.cooperativeMembership = { cooperativeId: 2, role: 'OWNER', isActive: true };
    next();
  }),
  requireVerifiedCooperative: jest.fn((req, res, next) => next()),
}));

const express = require('express');
const request = require('supertest');
const batchController = require('../src/controllers/batchController');
const orderController = require('../src/controllers/orderController');
const harvestOfferController = require('../src/controllers/harvestOfferController');
const adminController = require('../src/controllers/adminController');
const paymentController = require('../src/controllers/paymentController');
const authMiddleware = require('../src/middleware/auth');
const batchRouter = require('../src/routes/batches');
const orderRouter = require('../src/routes/orders');
const harvestOfferRouter = require('../src/routes/harvestOffers');
const adminRouter = require('../src/routes/admin');
const paymentRouter = require('../src/routes/payments');

const app = express();
app.use(express.json());
app.use('/batches', batchRouter);
app.use('/orders', orderRouter);
app.use('/offers', harvestOfferRouter);
app.use('/harvest-offers', harvestOfferRouter);
app.use('/admin', adminRouter);
app.use('/payments', paymentRouter);

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

test('PUT /admin/cooperatives/:id/verify dispatches to the admin verification controller', async () => {
  const response = await request(app)
    .put('/admin/cooperatives/9/verify')
    .set('x-test-role', 'ADMIN')
    .send({});

  expect(response.status).toBe(200);
  expect(response.body.handler).toBe('verifyCooperative');
  expect(adminController.verifyCooperative).toHaveBeenCalledTimes(1);
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

  test('active cooperative staff can update order status', async () => {
    const response = await request(app)
      .put('/orders/9/status')
      .set('x-test-role', 'COOPERATIVE_STAFF')
      .send({ status: 'CONFIRMED' });

    expect(response.status).toBe(200);
    expect(orderController.updateOrderStatus).toHaveBeenCalledTimes(1);
  });

  test.each(['BUYER', 'FARMER', 'ADMIN'])(
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

  test('FARMER can only read their offer detail through /my/:id', async () => {
    const response = await request(app)
      .get('/offers/my/NTO-20261123-ABC123')
      .set('x-test-role', 'FARMER');

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe('getMyOffer');
    expect(harvestOfferController.getMyOffer).toHaveBeenCalledTimes(1);
  });

  test('cooperative staff can use the explicit offer lifecycle routes', async () => {
      const role = 'COOPERATIVE_STAFF';
      const listResponse = await request(app)
        .get('/offers')
        .set('x-test-role', role);
      const lifecycleResponses = await Promise.all([
        request(app).put('/offers/offer-id/accept').set('x-test-role', role).send({}),
        request(app).put('/offers/offer-id/reject').set('x-test-role', role).send({}),
        request(app).put('/offers/offer-id/delivery').set('x-test-role', role).send({}),
        request(app).put('/offers/offer-id/verify').set('x-test-role', role).send({}),
        request(app).put('/offers/offer-id/sold').set('x-test-role', role).send({}),
        request(app).put('/offers/offer-id/status').set('x-test-role', role).send({}),
        request(app).put('/offers/farmers/9/verify').set('x-test-role', role).send({}),
      ]);

      expect(listResponse.status).toBe(200);
      lifecycleResponses.forEach((response) => expect(response.status).toBe(200));
  });

  test('ADMIN cannot use cooperative offer lifecycle routes', async () => {
    const response = await request(app)
      .put('/offers/offer-id/accept')
      .set('x-test-role', 'ADMIN')
      .send({});

    expect(response.status).toBe(403);
    expect(harvestOfferController.acceptOffer).not.toHaveBeenCalled();
  });

  test('the same router is available under the legacy harvest-offers prefix', async () => {
    const response = await request(app)
      .get('/harvest-offers')
      .set('x-test-role', 'COOPERATIVE_STAFF');

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe('listOffers');
  });

  test('removed settlement and POST verification routes are not preserved', async () => {
    const settlement = await request(app)
      .put('/offers/offer-id/settlement')
      .set('x-test-role', 'COOPERATIVE_STAFF')
      .send({});
    const postVerify = await request(app)
      .post('/offers/offer-id/verify')
      .set('x-test-role', 'COOPERATIVE_STAFF')
      .send({});

    expect(settlement.status).toBe(404);
    expect(postVerify.status).toBe(404);
  });

  test('FARMER cannot use staff harvest-offer routes', async () => {
    const response = await request(app)
      .get('/harvest-offers')
      .set('x-test-role', 'FARMER');

    expect(response.status).toBe(403);
    expect(harvestOfferController.listOffers).not.toHaveBeenCalled();
  });
});

describe('payment route role gates', () => {
  test.each(['/payments/daraja/result', '/payments/daraja/timeout'])(
    '%s is a public callback route',
    async (path) => {
      const response = await request(app).post(path).send({});

      expect(response.status).toBe(200);
      expect(authMiddleware.authenticate).not.toHaveBeenCalled();
    }
  );

  test('FARMER can confirm and inspect only through authenticated payment routes', async () => {
    const confirm = await request(app)
      .post('/payments/offers/offer-id/confirm-details')
      .set('x-test-role', 'FARMER')
      .send({ pin: '2468' });
    const inspect = await request(app)
      .get('/payments/offers/offer-id')
      .set('x-test-role', 'FARMER');
    const payout = await request(app)
      .post('/payments/offers/offer-id/payout')
      .set('x-test-role', 'FARMER')
      .send({ reference: 'PAY-1' });

    expect(confirm.body.handler).toBe('confirmOfferPaymentDetails');
    expect(inspect.body.handler).toBe('getOfferPayment');
    expect(payout.status).toBe(403);
    expect(paymentController.initiateOfferPayout).not.toHaveBeenCalled();
  });

  test('cooperative staff can initiate a payout', async () => {
      const role = 'COOPERATIVE_STAFF';
      const response = await request(app)
        .post('/payments/offers/offer-id/payout')
        .set('x-test-role', role)
        .send({ reference: 'PAY-1' });

      expect(response.status).toBe(200);
      expect(response.body.handler).toBe('initiateOfferPayout');
  });

  test('ADMIN cannot initiate a cooperative payout', async () => {
    const response = await request(app)
      .post('/payments/offers/offer-id/payout')
      .set('x-test-role', 'ADMIN')
      .send({ reference: 'PAY-1' });

    expect(response.status).toBe(403);
    expect(paymentController.initiateOfferPayout).not.toHaveBeenCalled();
  });
});

test('admin role and cooperative assignment routes were removed', async () => {
  const roleResponse = await request(app)
    .put('/admin/users/9/role')
    .set('x-test-role', 'ADMIN')
    .send({ role: 'BUYER' });
  const cooperativeResponse = await request(app)
    .put('/admin/users/9/cooperative')
    .set('x-test-role', 'ADMIN')
    .send({ cooperativeId: 2 });

  expect(roleResponse.status).toBe(404);
  expect(cooperativeResponse.status).toBe(404);
});

test('GET /admin/orders is a dedicated read-only admin order list', async () => {
  const response = await request(app)
    .get('/admin/orders?status=PENDING')
    .set('x-test-role', 'ADMIN');

  expect(response.status).toBe(200);
  expect(response.body.handler).toBe('listAdminOrders');
  expect(orderController.listAdminOrders).toHaveBeenCalledTimes(1);
});
