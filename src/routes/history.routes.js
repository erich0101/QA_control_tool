const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const ctrl = require('../controllers/history.controller');

router.get('/history', requireAuth, asyncHandler(ctrl.getHistory));
router.get('/runs/:id/bugs', requireAuth, asyncHandler(ctrl.getRunBugs));

module.exports = router;
