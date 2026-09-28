const express = require('express');
const {
  listCooperatives,
  getCooperative,
  getCooperativeStats,
  createCooperative,
} = require('../controllers/cooperativeController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.get('/', listCooperatives);
router.get('/:id', getCooperative);
router.get('/:id/stats', getCooperativeStats);
router.post('/', authenticate, authorize('ADMIN'), createCooperative);
module.exports = router;