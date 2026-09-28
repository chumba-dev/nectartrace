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
router.get('/', listOrders);
router.get('/:id', getOrder);
router.put('/:id/status', updateOrderStatus);
module.exports = router;