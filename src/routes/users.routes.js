const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../validators/users.schema');
const ctrl = require('../controllers/users.controller');

router.get('/', requireAuth, asyncHandler(ctrl.list));
router.post('/', requireAuth, requireAdmin, validate(createUserSchema), asyncHandler(ctrl.create));
router.put('/:id', requireAuth, requireAdmin, validate(updateUserSchema), asyncHandler(ctrl.update));

module.exports = router;
