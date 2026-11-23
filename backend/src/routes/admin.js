const express = require('express');
const {
  listUsers,
  assignCooperative,
  changeUserRole,
  toggleUserActive,
  createCooperative,
  verifyCooperative,
  getPlatformStats,
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/users', listUsers);
router.put('/users/:id/cooperative', assignCooperative);
router.put('/users/:id/role', changeUserRole);
router.put('/users/:id/active', toggleUserActive);
router.post('/cooperatives', createCooperative);
router.put('/cooperatives/:id/verify', verifyCooperative);
router.get('/stats', getPlatformStats);

module.exports = router;
