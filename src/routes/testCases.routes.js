const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/testCases.controller');
const {
    createTestCaseSchema,
    updateTestCaseSchema,
    moveTestCaseSchema,
    idParamSchema
} = require('../validators/testCases.schema');

router.post('/:id/start-execution', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.startExecution));
router.post('/', requireAuth, validate(createTestCaseSchema), asyncHandler(ctrl.create));
router.put('/:id/move', requireAuth, validate(idParamSchema, 'params'), validate(moveTestCaseSchema), asyncHandler(ctrl.move));
router.put('/:id', requireAuth, validate(idParamSchema, 'params'), validate(updateTestCaseSchema), asyncHandler(ctrl.update));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.remove));

module.exports = router;
