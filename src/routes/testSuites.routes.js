const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/testSuites.controller');
const {
    listTestSuitesSchema,
    createTestSuiteSchema,
    startExecutionSchema,
    idParamSchema,
    moveSuiteSchema,
    assignAllSchema,
    inconsistenciesSchema
} = require('../validators/testSuites.schema');

router.get('/', requireAuth, validate(listTestSuitesSchema, 'query'), asyncHandler(ctrl.list));
router.post('/', requireAuth, validate(createTestSuiteSchema), asyncHandler(ctrl.create));
router.post('/:id/start-execution', requireAuth, validate(idParamSchema, 'params'), validate(startExecutionSchema), asyncHandler(ctrl.startExecution));
router.post('/:id/finish-execution', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.finishExecution));
router.put('/:id/inconsistencies', requireAuth, validate(idParamSchema, 'params'), validate(inconsistenciesSchema), asyncHandler(ctrl.updateInconsistencies));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.remove));
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getOne));
router.put('/:id/move', requireAuth, validate(idParamSchema, 'params'), validate(moveSuiteSchema), asyncHandler(ctrl.move));
router.put('/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.update));
router.put('/:id/assign-all', requireAuth, validate(idParamSchema, 'params'), validate(assignAllSchema), asyncHandler(ctrl.assignAll));

module.exports = router;
