const express = require('express');
const {
  createBatch,
  listBatches,
  getBatch,
  verifyBatch,
  getMyBatches,
  updateStatus,
} = require('../controllers/batchController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', listBatches);
router.get('/:batchId', getBatch);
router.get('/:batchId/verify', verifyBatch);

// Protected routes
router.use(authenticate);

router.get('/my', getMyBatches);
router.post('/', authorize('COOPERATIVE_STAFF', 'ADMIN'), createBatch);
router.put('/:batchId/status', authorize('COOPERATIVE_STAFF', 'ADMIN'), updateStatus);

module.exports = router;