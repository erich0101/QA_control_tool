const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const ctrl = require('../controllers/stats.controller');

router.get('/stats/jira-daily', requireAuth, asyncHandler(ctrl.jiraDaily));
router.get('/stats/jira-productivity', requireAuth, asyncHandler(ctrl.jiraProductivity));
router.get('/stats/suites', requireAuth, asyncHandler(ctrl.suitesStats));
router.get('/stats/overview', requireAuth, asyncHandler(ctrl.overview));

module.exports = router;
