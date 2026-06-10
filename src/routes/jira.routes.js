const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/jira.controller');
const {
    saveJiraConfigSchema,
    saveJiraUserConfigSchema,
    getEpicStatsSchema,
    getMyTicketsSchema,
    getIssueCommentsSchema,
    addIssueCommentSchema,
    createDefectTicketSchema,
    debugJiraTestSchema,
    idParamSchema,
    keyParamSchema
} = require('../validators/jira.schema');

router.get('/projects/:id/jira-config', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getJiraConfig));
router.post('/projects/:id/jira-config', requireAuth, requireAdmin, validate(idParamSchema, 'params'), validate(saveJiraConfigSchema), asyncHandler(ctrl.saveJiraConfig));
router.get('/projects/:id/jira-user-config', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getJiraUserConfig));
router.post('/projects/:id/jira-user-config', requireAuth, validate(idParamSchema, 'params'), validate(saveJiraUserConfigSchema), asyncHandler(ctrl.saveJiraUserConfig));
router.delete('/projects/:id/jira-user-config', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.deleteJiraUserConfig));

router.get('/jira/projects/:id/epics', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getEpics));
router.get('/jira/projects/:id/epic-stats', requireAuth, validate(idParamSchema, 'params'), validate(getEpicStatsSchema, 'query'), asyncHandler(ctrl.getEpicStats));
router.get('/jira/projects/:id/my-tickets', requireAuth, validate(idParamSchema, 'params'), validate(getMyTicketsSchema, 'query'), asyncHandler(ctrl.getMyTickets));
router.get('/debug/jira-test', requireAuth, requireAdmin, validate(debugJiraTestSchema, 'query'), asyncHandler(ctrl.debugJiraTest));
router.get('/jira/projects/:id/context', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getContext));
router.get('/jira/projects/:id/tracking', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getTracking));
router.get('/jira/issues/:key/comments', requireAuth, validate(keyParamSchema, 'params'), validate(getIssueCommentsSchema, 'query'), asyncHandler(ctrl.getIssueComments));
router.post('/jira/issues/:key/comments', requireAuth, validate(keyParamSchema, 'params'), validate(addIssueCommentSchema), asyncHandler(ctrl.addIssueComment));
router.post('/jira/defects/:id/create-ticket', requireAuth, validate(idParamSchema, 'params'), validate(createDefectTicketSchema), asyncHandler(ctrl.createDefectTicket));

module.exports = router;
