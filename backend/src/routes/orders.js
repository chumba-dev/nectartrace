const express = require('express');
const {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
} = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.post('/', authorize('BUYER'), createOrder);
router.get('/', authorize('BUYER', 'COOPERATIVE_STAFF', 'ADMIN'), listOrders);
router.get('/:id', authorize('BUYER', 'COOPERATIVE_STAFF', 'ADMIN'), getOrder);
router.put('/:id/status', authorize('COOPERATIVE_STAFF', 'ADMIN'), updateOrderStatus);
module.exports = router;
