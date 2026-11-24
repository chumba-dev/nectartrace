const express = require('express');
const {
  listUsers,
  toggleUserActive,
  createCooperative,
  verifyCooperative,
  getPlatformStats,
} = require('../controllers/adminController');
const {
  approveApplication,
  listApplications,
  rejectApplication,
} = require('../controllers/cooperativeApplicationController');
const { listAdminOrders } = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/users', listUsers);
router.put('/users/:id/active', toggleUserActive);
router.get('/cooperative-applications', listApplications);
router.put('/cooperative-applications/:id/approve', approveApplication);
router.put('/cooperative-applications/:id/reject', rejectApplication);
router.get('/orders', listAdminOrders);
router.post('/cooperatives', createCooperative);
router.put('/cooperatives/:id/verify', verifyCooperative);
router.get('/stats', getPlatformStats);

module.exports = router;
