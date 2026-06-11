const { testSuites, testCases, testRuns, executions, attachments, defects, inconsistencias } = require('../repositories');
const { ValidationError } = require('../middleware/errors');
const logger = require('../utils/logger');

async function list(queryParams, requestLogger) {
    const start = Date.now();
    const log = requestLogger || logger;
    const { use_case_id, project_id } = queryParams;
    let suites;

    if (use_case_id) {
        suites = await testSuites.listByUseCase(use_case_id);
    } else if (project_id) {
        suites = await testSuites.listByProject(project_id);
    } else {
        throw new ValidationError('use_case_id o project_id requerido');
    }
    if (suites.length === 0) return { testSuites: [] };

    const suiteIds = suites.map(s => s.id);
    const activeRunIds = suites.map(s => s.active_run_id).filter(id => id !== null);

    const allTestCases = await testCases.listBySuiteIds(suiteIds);

    let activeRuns = [];
    if (activeRunIds.length > 0) {
        activeRuns = await testRuns.listActiveByIdsWithStatuses(activeRunIds);
    }

    const latestExecs = await executions.findLatestBySuiteIds(suiteIds);

    let activeRunExecs = [];
    if (activeRuns.length > 0) {
        const runIds = activeRuns.map(r => r.id);
        activeRunExecs = await executions.listByRunIds(runIds);
    }

    const parentRunIds = activeRuns.map(r => r.parent_run_id).filter(id => id !== null);
    let parentExecs = [];
    if (parentRunIds.length > 0) {
        parentExecs = await executions.findLatestByRunIds(parentRunIds);
    }

    const allExecIds = [...new Set([
        ...latestExecs.map(e => e.id),
        ...activeRunExecs.map(e => e.id),
        ...parentExecs.map(e => e.id)
    ])];

    let allAttachments = [];
    let allDefects = [];
    if (allExecIds.length > 0) {
        allAttachments = await attachments.listByExecutionIds(allExecIds);
        allDefects = await defects.listByExecutionIds(allExecIds);
    }

    const allInconsistencies = await inconsistencias.listBySuiteIds(suiteIds);

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
