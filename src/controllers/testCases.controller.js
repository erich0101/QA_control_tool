const testCasesRepo = require('../repositories/testCases.repository');
const testSuitesRepo = require('../repositories/testSuites.repository');
const testRunsRepo = require('../repositories/testRuns.repository');
const executionsRepo = require('../repositories/executions.repository');
const defectsRepo = require('../repositories/defects.repository');
const scenariosRepo = require('../repositories/scenarios.repository');
const userStoriesRepo = require('../repositories/userStories.repository');
const { ok, created } = require('../utils/responses');
const { checkPermission, generateKey, getProjectIdFromSuite } = require('../utils/keyGenerator');
const { AppError } = require('../middleware/errors');

exports.startExecution = async (req, res) => {
    const tcId = req.params.id;
    const suiteId = await testCasesRepo.findSuiteId(tcId);
    if (!suiteId) return res.status(404).json({ error: 'Test case no encontrado' });

    const activeRunId = await testSuitesRepo.findActiveRunId(suiteId);
    if (activeRunId) {
        return res.status(400).json({ error: 'La suite ya tiene un ciclo activo.' });
    }

    const runId = await testRunsRepo.create({
        suiteId, createdBy: req.user.id, runType: 'INDIVIDUAL',
        lastResumeAt: null, accumulatedSeconds: 0
    });

    await testSuitesRepo.setActiveRun(suiteId, runId);

    await executionsRepo.create({
        tcId, runId, tester: req.user.name, status: 'PENDING'
    });

    res.json({ ok: true, runId });
};

exports.create = async (req, res) => {
    if (!(await checkPermission(req.user.id, 'can_create_test')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    const { suite_id, us_id, scenario_id: provided_scenario_id, title, steps, expected_result, assigned_to, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria } = req.body;
    if (!suite_id || !title) return res.status(400).json({ error: 'suite_id y title requeridos' });

    let scenario_id = provided_scenario_id;

    if (us_id && !scenario_id) {
        scenario_id = await scenariosRepo.createNextForUS(us_id, title);
        await userStoriesRepo.appendEscenario(us_id, title);
    }

    const projectId = await getProjectIdFromSuite(suite_id);
    const finalKeyId = await generateKey(projectId, 'TC');

    const tcId = await testCasesRepo.create({
        suiteId: suite_id, usId: us_id || null, scenarioId: scenario_id || null,
        title, steps: steps || '', expectedResult: expected_result || '',
        assignedTo: assigned_to || null, createdBy: req.user.id, updatedBy: req.user.id,
        keyId: finalKeyId, preconditions: preconditions || '',
        jiraEpicKey: jira_epic_key || '', assumptions: assumptions || '',
        testData: test_data || '', acceptanceCriteria: acceptance_criteria || ''
    });
    return created(res, { id: tcId, key_id: finalKeyId, scenario_id });
};

exports.move = async (req, res) => {
    const tcId = req.params.id;
    const { new_suite_id } = req.body;

    if (!new_suite_id) return res.status(400).json({ error: 'new_suite_id requerido' });

    const tc = await testCasesRepo.findById(tcId);
    if (!tc) return res.status(404).json({ error: 'Test Case no encontrado' });

    if (tc.us_id) {
        return res.status(400).json({ error: 'El TC tiene una HU vinculada. Desvinculá la HU antes de mover.' });
    }

    const sourceSuite = await testSuitesRepo.findById(tc.suite_id);
    if (!sourceSuite) return res.status(404).json({ error: 'Suite origen no encontrada' });

    if (sourceSuite.active_run_id) {
        return res.status(400).json({ error: 'El TC está en una suite en ejecución. No se puede mover.' });
    }

    const destSuite = await testSuitesRepo.findById(new_suite_id);
    if (!destSuite) return res.status(404).json({ error: 'Suite destino no encontrada' });

    if (sourceSuite.use_case_id !== destSuite.use_case_id) {
        return res.status(400).json({ error: 'Solo se pueden mover TC entre suites del mismo Caso de Uso.' });
    }

    const changes = await testCasesRepo.moveToSuite(tcId, new_suite_id, req.user.id);

    if (changes === 0) {
        throw new AppError('El Test Case no pudo ser movido. El UPDATE no afectó ninguna fila.', 500);
    }

    res.json({ ok: true, moved: true });
};

exports.update = async (req, res) => {
    const tcId = req.params.id;
    const fields = [];
    const params = [];
    const allowedFields = ['us_id', 'scenario_id', 'title', 'steps', 'expected_result', 'assigned_to', 'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory', 'preconditions', 'jira_epic_key', 'assumptions', 'test_data', 'acceptance_criteria'];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(req.body[field]);
        }
    });

    if (fields.length > 0) {
        await testCasesRepo.updateDynamicWithUpdatedBy(tcId, fields, req.user.id);

        const tc = await testCasesRepo.findSlim(tcId);

        if (tc && tc.us_id && !tc.scenario_id) {
            const newScenarioId = await scenariosRepo.createNextForUS(tc.us_id, tc.title);
            await testCasesRepo.setScenario(tcId, newScenarioId);
            await userStoriesRepo.appendEscenario(tc.us_id, tc.title);
        } else if (tc && tc.scenario_id && req.body.title !== undefined) {
            await scenariosRepo.updateTitle(tc.scenario_id, req.body.title);
        }
    }

    const { status, observations, obtained_result } = req.body;

    if (status || observations !== undefined || obtained_result !== undefined) {
        const suiteId = await testCasesRepo.findSuiteId(tcId);
        const runId = await testSuitesRepo.findActiveRunId(suiteId);

        if (!runId) {
            return res.status(400).json({ error: 'No hay un ciclo de ejecución activo para esta suite. Inicia uno para registrar resultados.' });
        }

        let execId = null;
        const existingExec = await executionsRepo.findByTcAndRun(tcId, runId);
        if (existingExec) {
            execId = existingExec.id;
            const execFields = {};
            if (status !== undefined) execFields.status = status;
            if (observations !== undefined) execFields.observations = observations;
            if (obtained_result !== undefined) execFields.obtained_result = obtained_result;

            if (Object.keys(execFields).length > 0) {
                await executionsRepo.updateDynamic(execId, execFields);
            }
        } else {
            execId = await executionsRepo.create({
                tcId, runId, tester: req.user.name,
                status: status || 'PENDING', observations: observations || '', obtainedResult: obtained_result || ''
            });
        }
        const { bug_title, bug_description, bug_severity, bug_steps_to_reproduce, bug_expected_result, bug_actual_result, bug_frequency, bug_business_impact } = req.body;
        if (bug_title && (status === 'FAIL' || status === 'WARNING')) {
            const jira_epic_key = await testCasesRepo.findJiraEpicKey(tcId) || '';

            const existingBug = await defectsRepo.findByExecutionAndTitle(execId, bug_title);
            if (!existingBug) {
                await defectsRepo.create({
                    executionId: execId, title: bug_title,
                    description: bug_description || '', severity: bug_severity || 'Media',
                    stepsToReproduce: bug_steps_to_reproduce || '',
                    expectedResult: bug_expected_result || '',
                    actualResult: bug_actual_result || '',
                    frequency: bug_frequency || 'Siempre',
                    businessImpact: bug_business_impact || '',
                    status: 'OPEN', jiraEpicKey: jira_epic_key
                });
            }
        }
        return ok(res, { execution_id: execId });
    }
    return ok(res);
};

exports.remove = async (req, res) => {
    await testCasesRepo.remove(req.params.id);
    return ok(res);
};
