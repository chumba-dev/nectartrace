const express = require('express');
const {
  addMember,
  listMembers,
  updateMemberActive,
  updateMemberRole,
} = require('../controllers/cooperativeMemberController');
const {
  authenticate,
  authorize,
  requireActiveCooperativeMembership,
} = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('COOPERATIVE_STAFF'));
router.use(requireActiveCooperativeMembership);
router.get('/', listMembers);
router.post('/', addMember);
router.put('/:userId/role', updateMemberRole);
router.put('/:userId/active', updateMemberActive);

module.exports = router;
