const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const { createProjectSchema, updateProjectSchema } = require('../validators/projects.schema');
const ctrl = require('../controllers/projects.controller');

router.get('/', requireAuth, asyncHandler(ctrl.list));
router.post('/', requireAuth, requireAdmin, validate(createProjectSchema), asyncHandler(ctrl.create));
router.put('/:id', requireAuth, requireAdmin, validate(updateProjectSchema), asyncHandler(ctrl.update));
router.delete('/:id', requireAuth, requireAdmin, asyncHandler(ctrl.remove));

module.exports = router;
