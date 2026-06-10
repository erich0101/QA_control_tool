const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/useCases.controller');
const { startAll } = require('../controllers/testSuites.controller');
const {
    listUseCasesSchema,
    createUseCaseSchema,
    updateUseCaseSchema,
    idParamSchema
} = require('../validators/useCases.schema');

router.get('/', requireAuth, validate(listUseCasesSchema, 'query'), asyncHandler(ctrl.list));
router.post('/', requireAuth, validate(createUseCaseSchema), asyncHandler(ctrl.create));
router.put('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), validate(updateUseCaseSchema), asyncHandler(ctrl.update));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.remove));
router.post('/:id/start-all', requireAuth, validate(idParamSchema, 'params'), asyncHandler(startAll));

module.exports = router;
