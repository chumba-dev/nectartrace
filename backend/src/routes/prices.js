const express = require('express');
const { getCurrentPrice, getPriceHistory } = require('../controllers/priceController');
const router = express.Router();
router.get('/current', getCurrentPrice);
router.get('/history', getPriceHistory);
module.exports = router;