const express = require('express');
const {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);

module.exports = router;
