const express = require('express');
const {
  listOffers,
  listMyOffers,
  updateOfferStatus,
  verifyOffer,
  upsertSettlement,
} = require('../controllers/harvestOfferController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/my', authorize('FARMER'), listMyOffers);
router.get('/', authorize('COOPERATIVE_STAFF', 'ADMIN'), listOffers);
router.put('/:id/status', authorize('COOPERATIVE_STAFF', 'ADMIN'), updateOfferStatus);
router.post('/:id/verify', authorize('COOPERATIVE_STAFF', 'ADMIN'), verifyOffer);
router.put('/:id/settlement', authorize('COOPERATIVE_STAFF', 'ADMIN'), upsertSettlement);

module.exports = router;
