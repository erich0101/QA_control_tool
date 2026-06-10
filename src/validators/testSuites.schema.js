const { z } = require('zod');

exports.listTestSuitesSchema = z.object({
    use_case_id: z.coerce.number().int().positive().optional(),
    project_id: z.coerce.number().int().positive().optional()
}).refine(d => d.use_case_id || d.project_id, {
    message: 'use_case_id o project_id es requerido'
});

exports.createTestSuiteSchema = z.object({
    use_case_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    jira_epic_key: z.string().min(1).max(50).optional()
});

const executionFiltersSchema = z.object({
    priority: z.string().min(1).max(50).optional(),
    is_smoke: z.boolean().optional(),
    is_regression: z.boolean().optional(),
    is_integration: z.boolean().optional(),
    is_exploratory: z.boolean().optional()
}).optional();

exports.startExecutionSchema = z.object({
    execution_type: z.enum(['SMOKE', 'REGRESSION', 'INTEGRATION', 'EXPLORATORY', 'CUSTOM', 'FULL']).default('FULL'),
    only_assigned: z.boolean().default(false),
    filters: executionFiltersSchema
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});

exports.moveSuiteSchema = z.object({
    new_use_case_id: z.coerce.number().int().positive()
});

exports.assignAllSchema = z.object({
    assigned_to: z.coerce.number().int().positive().nullable().optional()
});

const inconsistencyItemSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    severity: z.enum(['Alta', 'Media', 'Baja', 'Crítica']).optional()
});

exports.inconsistenciesSchema = z.object({
    inconsistencies: z.array(inconsistencyItemSchema)
});
