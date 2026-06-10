const { z } = require('zod');

const EXECUTION_STATUSES = ['PENDING', 'PASS', 'OK', 'FAIL', 'WARNING', 'BLOCK', 'BLOCKED', 'SKIP', 'SKIPPED'];
const SEVERITIES = ['Alta', 'Media', 'Baja', 'Crítica'];

exports.createTestCaseSchema = z.object({
    suite_id: z.coerce.number().int().positive(),
    us_id: z.coerce.number().int().positive().optional(),
    scenario_id: z.coerce.number().int().positive().optional(),
    title: z.string().min(1).max(255),
    steps: z.string().max(5000).optional(),
    expected_result: z.string().max(5000).optional(),
    assigned_to: z.coerce.number().int().positive().optional(),
    preconditions: z.string().max(5000).optional(),
    jira_epic_key: z.string().min(1).max(50).optional(),
    assumptions: z.string().max(5000).optional(),
    test_data: z.string().max(5000).optional(),
    acceptance_criteria: z.string().max(5000).optional()
});

exports.updateTestCaseSchema = z.object({
    suite_id: z.coerce.number().int().positive().optional(),
    us_id: z.coerce.number().int().positive().optional(),
    scenario_id: z.coerce.number().int().positive().optional(),
    title: z.string().min(1).max(255).optional(),
    steps: z.string().max(5000).optional(),
    expected_result: z.string().max(5000).optional(),
    assigned_to: z.coerce.number().int().positive().optional(),
    preconditions: z.string().max(5000).optional(),
    jira_epic_key: z.string().min(1).max(50).optional(),
    assumptions: z.string().max(5000).optional(),
    test_data: z.string().max(5000).optional(),
    acceptance_criteria: z.string().max(5000).optional(),
    status: z.enum(EXECUTION_STATUSES).optional(),
    observations: z.string().max(5000).optional(),
    obtained_result: z.string().max(5000).optional(),
    priority: z.string().min(1).max(50).optional(),
    is_smoke: z.boolean().optional(),
    is_regression: z.boolean().optional(),
    is_integration: z.boolean().optional(),
    is_exploratory: z.boolean().optional(),
    bug_title: z.string().min(1).max(255).optional(),
    bug_description: z.string().max(5000).optional(),
    bug_severity: z.enum(SEVERITIES).optional(),
    bug_steps_to_reproduce: z.string().max(5000).optional(),
    bug_expected_result: z.string().max(5000).optional(),
    bug_actual_result: z.string().max(5000).optional(),
    bug_frequency: z.string().min(1).max(100).optional(),
    bug_business_impact: z.string().max(5000).optional()
});

exports.moveTestCaseSchema = z.object({
    new_suite_id: z.coerce.number().int().positive()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
