const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/defects.controller');
const {
    listDefectsSchema,
    createDefectSchema,
    updateStatusSchema,
    assignDefectSchema,
    idParamSchema
} = require('../validators/defects.schema');

router.get('/', requireAuth, validate(listDefectsSchema, 'query'), asyncHandler(ctrl.list));
router.post('/', requireAuth, validate(createDefectSchema), asyncHandler(ctrl.create));
router.put('/:id/status', requireAuth, validate(idParamSchema, 'params'), validate(updateStatusSchema), asyncHandler(ctrl.updateStatus));
router.put('/:id/assign', requireAuth, validate(idParamSchema, 'params'), validate(assignDefectSchema), asyncHandler(ctrl.assign));

module.exports = router;
