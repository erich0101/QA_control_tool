const { z } = require('zod');

const SEVERITIES = ['Alta', 'Media', 'Baja', 'Crítica'];

exports.listUserStoriesSchema = z.object({
    use_case_id: z.coerce.number().int().positive()
});

exports.createScenarioSchema = z.object({
    us_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    order_index: z.coerce.number().int().default(0)
});

exports.updateScenarioSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional(),
    order_index: z.coerce.number().int().optional()
});

exports.createInconsistencySchema = z.object({
    suite_id: z.coerce.number().int().positive().optional(),
    us_id: z.coerce.number().int().positive().optional(),
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    severity: z.enum(SEVERITIES).default('Alta'),
    order_index: z.coerce.number().int().default(0)
}).refine(d => d.suite_id || d.us_id, {
    message: 'suite_id o us_id requerido'
});

exports.updateInconsistencySchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional(),
    severity: z.enum(SEVERITIES).optional(),
    order_index: z.coerce.number().int().optional()
});

exports.createUserStorySchema = z.object({
    use_case_id: z.coerce.number().int().positive(),
    title: z.string().min(1).max(255),
    hu_detallada: z.string().max(10000).optional(),
    priority: z.string().min(1).max(50).optional(),
    status: z.string().min(1).max(50).optional(),
    escenarios_prueba: z.string().max(10000).optional(),
    reglas_negocio: z.string().max(10000).optional(),
    precondiciones: z.string().max(10000).optional(),
    link_documentacion: z.string().max(2000).optional(),
    key_id: z.string().min(1).max(50).optional()
});

exports.updateUserStorySchema = z.object({
    use_case_id: z.coerce.number().int().positive().optional(),
    title: z.string().min(1).max(255).optional(),
    hu_detallada: z.string().max(10000).optional(),
    priority: z.string().min(1).max(50).optional(),
    status: z.string().min(1).max(50).optional(),
    escenarios_prueba: z.string().max(10000).optional(),
    reglas_negocio: z.string().max(10000).optional(),
    precondiciones: z.string().max(10000).optional(),
    link_documentacion: z.string().max(2000).optional(),
    key_id: z.string().min(1).max(50).optional(),
    recommendations: z.union([z.array(z.any()), z.string()]).optional()
});

exports.updateRecommendationsSchema = z.object({
    recommendations: z.array(z.any())
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
