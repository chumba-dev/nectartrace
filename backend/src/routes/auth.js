const express = require('express');
const {
  register,
  verifyEmail,
  resendVerification,
  login,
  googleAuth,
  getMe,
  updateMe,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);

module.exports = router;
