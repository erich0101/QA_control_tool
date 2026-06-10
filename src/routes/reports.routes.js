const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const ctrl = require('../controllers/reports.controller');

router.get('/reports/multi', requireAuth, asyncHandler(ctrl.getMultiReport));
router.get('/reports/:runId', requireAuth, asyncHandler(ctrl.getRunReport));
router.post('/report', requireAuth, asyncHandler(ctrl.generateReport));
router.get('/data', requireAuth, asyncHandler(ctrl.getData));

module.exports = router;
