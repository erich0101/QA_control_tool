const { z } = require('zod');

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const projectIdQuerySchema = z.object({ project_id: z.coerce.number().int().positive() });

const createHallazgoSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().optional().default(''),
    severity: z.string().optional().default('Media'),
    steps_to_reproduce: z.string().optional().default(''),
    expected_result: z.string().optional().default(''),
    actual_result: z.string().optional().default(''),
    frequency: z.string().optional().default('Siempre'),
    business_impact: z.string().optional().default(''),
    preconditions: z.string().optional().default(''),
    observations: z.string().optional().default(''),
    assigned_to: z.coerce.number().int().positive().nullable().optional(),
});

const updateHallazgoSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    severity: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    expected_result: z.string().optional(),
    actual_result: z.string().optional(),
    frequency: z.string().optional(),
    business_impact: z.string().optional(),
    preconditions: z.string().optional(),
    observations: z.string().optional(),
    assigned_to: z.coerce.number().int().positive().nullable().optional(),
}).strict();

const updateHallazgoStatusSchema = z.object({
    status: z.string().min(1).max(50),
}).strict();

const assignHallazgoSchema = z.object({
    assigned_to: z.coerce.number().int().positive().nullable(),
}).strict();

const convertToTCSchema = z.object({
    suite_id: z.coerce.number().int().positive(),
}).strict();

const createJiraTicketSchema = z.object({
    epicId: z.string().optional(),
    assigneeId: z.string().optional(),
    priorityId: z.string().optional(),
    customFields: z.record(z.any()).optional(),
}).strict();

module.exports = {
    idParamSchema,
    projectIdQuerySchema,
    createHallazgoSchema,
    updateHallazgoSchema,
    updateHallazgoStatusSchema,
    assignHallazgoSchema,
    convertToTCSchema,
    createJiraTicketSchema,
};
