const { query } = require('../config/db');
const { ValidationError } = require('../middleware/errors');
const logger = require('../utils/logger');

async function list(queryParams, requestLogger) {
    const start = Date.now();
    const log = requestLogger || logger;
    const { use_case_id, project_id } = queryParams;
    let suitesRes;

    if (use_case_id) {
        suitesRes = await query(`SELECT * FROM qa_test_suites WHERE use_case_id = $1 ORDER BY id`, [use_case_id]);
    } else if (project_id) {
        suitesRes = await query(`
            SELECT s.* FROM qa_test_suites s
            LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
            WHERE s.project_id = $1 OR uc.project_id = $1
            ORDER BY s.id
        `, [project_id]);
    } else {
        throw new ValidationError('use_case_id o project_id requerido');
    }
    const suites = suitesRes.rows;
    if (suites.length === 0) return { testSuites: [] };

    const suiteIds = suites.map(s => s.id);
    const activeRunIds = suites.map(s => s.active_run_id).filter(id => id !== null);

    const casesRes = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ANY($1::int[]) ORDER BY id`, [suiteIds]);
    const allTestCases = casesRes.rows;

    let activeRuns = [];
    if (activeRunIds.length > 0) {
        const runsRes = await query(`SELECT * FROM qa_test_runs WHERE id = ANY($1::int[]) AND status IN ('ACTIVE', 'RUNNING', 'PAUSED')`, [activeRunIds]);
        activeRuns = runsRes.rows;
    }

    const latestExecsRes = await query(`
        SELECT DISTINCT ON (tc_id) *
        FROM qa_executions
        WHERE tc_id IN (SELECT id FROM qa_test_cases WHERE suite_id = ANY($1::int[]))
        ORDER BY tc_id, id DESC
    `, [suiteIds]);
    const latestExecs = latestExecsRes.rows;

    let activeRunExecs = [];
    if (activeRuns.length > 0) {
        const runIds = activeRuns.map(r => r.id);
        const runExecsRes = await query(`SELECT * FROM qa_executions WHERE run_id = ANY($1::int[])`, [runIds]);
        activeRunExecs = runExecsRes.rows;
    }

    const parentRunIds = activeRuns.map(r => r.parent_run_id).filter(id => id !== null);
    let parentExecs = [];
    if (parentRunIds.length > 0) {
        const pExecsRes = await query(`
            SELECT DISTINCT ON (tc_id, run_id) *
            FROM qa_executions
            WHERE run_id = ANY($1::int[])
            ORDER BY tc_id, run_id, id DESC
        `, [parentRunIds]);
        parentExecs = pExecsRes.rows;
    }

    const allExecIds = [...new Set([
        ...latestExecs.map(e => e.id),
        ...activeRunExecs.map(e => e.id),
        ...parentExecs.map(e => e.id)
    ])];

    let allAttachments = [];
    let allDefects = [];
    if (allExecIds.length > 0) {
        const attRes = await query(`SELECT id, execution_id, evidence_category FROM qa_attachments WHERE execution_id = ANY($1::int[])`, [allExecIds]);
        allAttachments = attRes.rows;
        const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ANY($1::int[])`, [allExecIds]);
        allDefects = defRes.rows;
    }

    const incRes = await query(`
        SELECT id, suite_id, title, description, severity, order_index
        FROM qa_inconsistencias
        WHERE suite_id = ANY($1::int[])
        ORDER BY suite_id, order_index
    `, [suiteIds]);
    const allInconsistencies = incRes.rows;

    const result = suites.map(suite => {
        const activeRun = activeRuns.find(r => r.id === suite.active_run_id) || null;
        const suiteCases = allTestCases.filter(tc => tc.suite_id === suite.id);
        const suiteInconsistencies = allInconsistencies.filter(inc => inc.suite_id === suite.id);

        const processedCases = suiteCases.map(tc => {
            let exec = null;
            if (activeRun) {
                exec = activeRunExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.id) || null;
                if (!exec && activeRun.run_type !== 'RETEST' && activeRun.parent_run_id) {
                    const pExec = parentExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.parent_run_id);
                    if (pExec) exec = { ...pExec, is_from_parent: true };
                }
            } else {
                exec = latestExecs.find(e => e.tc_id === tc.id) || null;
            }

            if (activeRun && !exec) return null;

            const attachments = allAttachments
                .filter(a => a.execution_id === (exec ? exec.id : -1))
                .map(a => ({ id: a.id, category: a.evidence_category, src: `api/evidence/${a.id}` }));

            const defects = allDefects.filter(d => d.execution_id === (exec ? exec.id : -1));

            if (activeRun && activeRun.run_type === 'RETEST' && exec && exec.status === 'PENDING' && activeRun.parent_run_id) {
                const pExec = parentExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.parent_run_id);
                if (pExec) {
                    allDefects.filter(d => d.execution_id === pExec.id).forEach(hd => {
                        if (!defects.find(d => d.id === hd.id)) defects.push({ ...hd, is_historical: true });
                    });
                }
            }

            return {
                id: tc.id, us_id: tc.us_id, scenario_id: tc.scenario_id, assigned_to: tc.assigned_to, title: tc.title,
                steps: tc.steps || tc.description, expected_result: tc.expected_result, preconditions: tc.preconditions,
                status: exec ? exec.status : 'PENDING', execution_id: exec ? exec.id : null,
                is_from_parent: exec ? !!exec.is_from_parent : false,
                observations: exec ? exec.observations : '', obtained_result: exec ? exec.obtained_result : '',
                attachments, defects, key_id: tc.key_id, priority: tc.priority,
                assumptions: tc.assumptions, test_data: tc.test_data, acceptance_criteria: tc.acceptance_criteria,
                is_smoke: !!tc.is_smoke, is_regression: !!tc.is_regression, is_integration: !!tc.is_integration,
                is_exploratory: !!tc.is_exploratory
            };
        }).filter(tc => tc !== null);

        return { ...suite, activeRun, test_cases: processedCases, inconsistencies: suiteInconsistencies };
    });

    log.debug({ ms: Date.now() - start }, 'testSuites.service.list completed');
    return { testSuites: result };
}

module.exports = { list };
