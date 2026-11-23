const express = require('express');
const {
  acceptOffer,
  getMyOffer,
  listOffers,
  listMyOffers,
  recordConsignmentSale,
  recordDelivery,
  rejectOffer,
  updateOfferStatus,
  verifyFarmer,
  verifyOffer,
} = require('../controllers/harvestOfferController');
const {
  authenticate,
  authorize,
  requireVerifiedCooperative,
} = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/my', authorize('FARMER'), listMyOffers);
router.get('/my/:id', authorize('FARMER'), getMyOffer);

const manageOffer = [
  authorize('COOPERATIVE_STAFF', 'ADMIN'),
  requireVerifiedCooperative,
];

router.get('/', ...manageOffer, listOffers);
router.put('/farmers/:farmerId/verify', ...manageOffer, verifyFarmer);
router.put('/:id/accept', ...manageOffer, acceptOffer);
router.put('/:id/reject', ...manageOffer, rejectOffer);
router.put('/:id/delivery', ...manageOffer, recordDelivery);
router.put('/:id/verify', ...manageOffer, verifyOffer);
router.put('/:id/sold', ...manageOffer, recordConsignmentSale);
router.put('/:id/status', ...manageOffer, updateOfferStatus);

module.exports = router;
