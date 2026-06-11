const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/hallazgos.controller');
const {
    idParamSchema,
    projectIdQuerySchema,
    createHallazgoSchema,
    updateHallazgoSchema,
    updateHallazgoStatusSchema,
    assignHallazgoSchema,
    convertToTCSchema,
    createJiraTicketSchema,
} = require('../validators/hallazgos.schema');

router.get('/', requireAuth, validate(projectIdQuerySchema, 'query'), asyncHandler(ctrl.list));
router.post('/', requireAuth, validate(createHallazgoSchema), asyncHandler(ctrl.create));
router.put('/:id', requireAuth, validate(idParamSchema, 'params'), validate(updateHallazgoSchema), asyncHandler(ctrl.update));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.remove));
router.put('/:id/status', requireAuth, validate(idParamSchema, 'params'), validate(updateHallazgoStatusSchema), asyncHandler(ctrl.updateStatus));
router.put('/:id/assign', requireAuth, validate(idParamSchema, 'params'), validate(assignHallazgoSchema), asyncHandler(ctrl.assign));
router.post('/:id/convert-to-tc', requireAuth, validate(idParamSchema, 'params'), validate(convertToTCSchema), asyncHandler(ctrl.convertToTC));
router.post('/jira/:id/create-ticket', requireAuth, validate(idParamSchema, 'params'), validate(createJiraTicketSchema), asyncHandler(ctrl.createJiraTicket));
router.get('/:id/evidence', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getEvidence));

module.exports = router;
