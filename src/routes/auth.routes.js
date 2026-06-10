const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const ctrl = require('../controllers/auth.controller');

router.post('/login', asyncHandler(ctrl.login));
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.post('/logout', asyncHandler(ctrl.logout));

module.exports = router;
