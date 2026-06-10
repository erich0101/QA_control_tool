const { z } = require('zod');

const SEVERITIES = ['Alta', 'Media', 'Baja', 'Crítica'];

exports.listDefectsSchema = z.object({
    project_id: z.coerce.number().int().positive()
});

exports.createDefectSchema = z.object({
    execution_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    severity: z.enum(SEVERITIES).default('Media'),
    steps_to_reproduce: z.string().max(5000).optional(),
    expected_result: z.string().max(5000).optional(),
    actual_result: z.string().max(5000).optional(),
    frequency: z.string().min(1).max(100).optional(),
    business_impact: z.string().max(5000).optional()
});

exports.updateStatusSchema = z.object({
    status: z.string().min(1).max(50)
});

exports.assignDefectSchema = z.object({
    assigned_to: z.coerce.number().int().positive().nullable().optional()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
