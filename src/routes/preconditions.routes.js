const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/preconditions.controller');
const {
    listPreconditionsSchema,
    createPreconditionSchema,
    linkPreconditionSchema,
    idParamSchema
} = require('../validators/preconditions.schema');

router.get('/', requireAuth, validate(listPreconditionsSchema, 'query'), asyncHandler(ctrl.list));
router.post('/', requireAuth, validate(createPreconditionSchema), asyncHandler(ctrl.create));
router.post('/link', requireAuth, validate(linkPreconditionSchema), asyncHandler(ctrl.link));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.remove));

module.exports = router;
