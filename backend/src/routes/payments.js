const express = require('express');
const {
  confirmOfferPaymentDetails,
  darajaResult,
  darajaTimeout,
  getOfferPayment,
  initiateOfferPayout,
} = require('../controllers/paymentController');
const {
  authenticate,
  authorize,
  requireVerifiedCooperative,
} = require('../middleware/auth');

const router = express.Router();

router.post('/daraja/result', darajaResult);
router.post('/daraja/timeout', darajaTimeout);

router.use(authenticate);
router.post(
  '/offers/:offerId/confirm-details',
  authorize('FARMER'),
  confirmOfferPaymentDetails
);
router.get(
  '/offers/:offerId',
  authorize('FARMER', 'COOPERATIVE_STAFF', 'ADMIN'),
  getOfferPayment
);
router.post(
  '/offers/:offerId/payout',
  authorize('COOPERATIVE_STAFF', 'ADMIN'),
  requireVerifiedCooperative,
  initiateOfferPayout
);

module.exports = router;
