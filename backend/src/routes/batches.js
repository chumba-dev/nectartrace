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
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', listBatches);
router.get('/my', authenticate, getMyBatches);
router.get('/:batchId', getBatch);
router.get('/:batchId/verify', verifyBatch);
router.get('/:batchId/qr', getBatchQR);

// Protected routes
router.post('/', authenticate, authorize('COOPERATIVE_STAFF', 'ADMIN'), createBatch);
router.put('/:batchId/status', authenticate, authorize('COOPERATIVE_STAFF', 'ADMIN'), updateStatus);

module.exports = router;
