const { z } = require('zod');

const permissionsSchema = z.object({
    can_create_cu: z.boolean().optional(),
    can_create_hu: z.boolean().optional(),
    can_create_suite: z.boolean().optional(),
    can_create_test: z.boolean().optional(),
    can_assign_cu: z.boolean().optional(),
    can_assign_hu: z.boolean().optional(),
    can_assign_suite: z.boolean().optional(),
    can_execute_test: z.boolean().optional(),
    can_manage_projects: z.boolean().optional(),
    can_manage_users: z.boolean().optional(),
    can_configure_jira: z.boolean().optional()
}).optional();

const baseShape = {
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(120),
    role: z.enum(['Admin', 'Analista QA', 'Tester', 'Project Manager', 'Lider Tecnico']).default('Tester'),
    perfil: z.string().max(40).optional(),
    permissions: permissionsSchema,
    projects: z.array(z.number().int().positive()).optional()
};

exports.createUserSchema = z.object(baseShape);

exports.updateUserSchema = z.object({
    ...baseShape,
    password: z.string().min(8).max(128).optional()
}).partial();
