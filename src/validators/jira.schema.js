const { z } = require('zod');

exports.saveJiraConfigSchema = z.object({
    jira_domain: z.string().min(1).max(255),
    jira_project_key: z.string().min(1).max(50)
});

exports.saveJiraUserConfigSchema = z.object({
    jira_user_email: z.string().email().max(255),
    jira_api_token: z.string().min(1).max(500).optional()
});

exports.getEpicStatsSchema = z.object({
    epicKey: z.string().min(1).max(50),
    from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD')),
    to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'))
});

exports.getMyTicketsSchema = z.object({
    filter: z.enum(['assigned', 'created', 'mentions']),
    maxResults: z.coerce.number().int().positive().max(100).default(50)
});

exports.getIssueCommentsSchema = z.object({
    project_id: z.coerce.number().int().positive()
});

exports.addIssueCommentSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    text: z.string().min(1).max(10000),
    mentionId: z.string().min(1).max(100).optional()
});

exports.createDefectTicketSchema = z.object({
    epicId: z.string().min(1).max(50).optional(),
    assigneeId: z.string().min(1).max(100).optional(),
    priorityId: z.string().min(1).max(50).optional(),
    customFields: z.record(z.any()).optional()
});

exports.debugJiraTestSchema = z.object({
    projectId: z.coerce.number().int().positive(),
    jql: z.string().min(1).max(500)
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});

exports.keyParamSchema = z.object({
    key: z.string().min(1).max(50)
});
