const express = require('express');
const {
  listListings,
  getListing,
  createListing,
  updateListing,
} = require('../controllers/listingController');
const {
  authenticate,
  authorize,
  requireActiveCooperativeMembership,
} = require('../middleware/auth');

const router = express.Router();
router.get('/', listListings);
router.get('/:id', getListing);
router.post(
  '/',
  authenticate,
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  createListing
);
router.put(
  '/:id',
  authenticate,
  authorize('COOPERATIVE_STAFF'),
  requireActiveCooperativeMembership,
  updateListing
);
module.exports = router;
