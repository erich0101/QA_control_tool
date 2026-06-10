const { z } = require('zod');

exports.createProjectSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional()
});

exports.updateProjectSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional()
});
