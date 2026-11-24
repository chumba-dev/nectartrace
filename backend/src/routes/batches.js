const express = require('express');
const {
  createBatch,
  listBatches,
  getBatch,
  verifyBatch,
  getMyBatches,
  updateStatus,
  getBatchQR,
} = require('../controllers/batchController');
const {
  authenticate,
  authorize,
  requireActiveCooperativeMembership,
} = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', listBatches);
router.get(
  '/my',
  authenticate,
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  getMyBatches
);
router.get('/:batchId', getBatch);
router.get('/:batchId/verify', verifyBatch);
router.get('/:batchId/qr', getBatchQR);

// Protected routes
router.post(
  '/',
  authenticate,
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  createBatch
);
router.put(
  '/:batchId/status',
  authenticate,
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  updateStatus
);

module.exports = router;
