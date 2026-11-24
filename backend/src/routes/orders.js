const express = require('express');
const {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
} = require('../controllers/orderController');
const {
  attachActiveMembershipForCooperativeStaff,
  authenticate,
  authorize,
  requireActiveCooperativeMembership,
} = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.post('/', authorize('BUYER'), createOrder);
router.get(
  '/',
  authorize('BUYER', 'COOPERATIVE_STAFF', 'ADMIN'),
  attachActiveMembershipForCooperativeStaff,
  listOrders
);
router.get(
  '/:id',
  authorize('BUYER', 'COOPERATIVE_STAFF', 'ADMIN'),
  attachActiveMembershipForCooperativeStaff,
  getOrder
);
router.put(
  '/:id/status',
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  updateOrderStatus
);
module.exports = router;
