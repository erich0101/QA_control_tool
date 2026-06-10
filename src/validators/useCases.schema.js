const { z } = require('zod');

const PROJECT_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

exports.listUseCasesSchema = z.object({
    project_id: z.coerce.number().int().positive()
});

exports.createUseCaseSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    key_id: z.string().min(1).max(50).optional()
});

exports.updateUseCaseSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    key_id: z.string().min(1).max(50).optional()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
