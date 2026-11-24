const express = require('express');
const {
  createApplication,
  getMyApplications,
} = require('../controllers/cooperativeApplicationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('COOPERATIVE_STAFF'));
router.post('/', createApplication);
router.get('/mine', getMyApplications);

module.exports = router;
