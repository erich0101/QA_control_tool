const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/testSuites.controller');
const { idParamSchema } = require('../validators/testSuites.schema');

router.post('/:id/pause', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.pauseRun));
router.post('/:id/resume', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.resumeRun));
router.post('/:id/retest', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.retest));

module.exports = router;
