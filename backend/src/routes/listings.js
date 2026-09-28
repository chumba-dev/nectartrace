const express = require('express');
const {
  listListings,
  getListing,
  createListing,
  updateListing,
} = require('../controllers/listingController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.get('/', listListings);
router.get('/:id', getListing);
router.post('/', authenticate, authorize('COOPERATIVE_STAFF', 'ADMIN'), createListing);
router.put('/:id', authenticate, authorize('COOPERATIVE_STAFF', 'ADMIN'), updateListing);
module.exports = router;