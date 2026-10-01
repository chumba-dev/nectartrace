const express = require('express');
const { handleUSSD } = require('../controllers/ussdController');

const router = express.Router();

// Africa's Talking sends POST requests
router.post('/', handleUSSD);

// Also support GET for manual testing
router.get('/', (req, res) => {
  res.json({
    message: 'NectarTrace USSD endpoint',
    usage: 'POST with sessionId, phoneNumber, text',
  });
});

module.exports = router;