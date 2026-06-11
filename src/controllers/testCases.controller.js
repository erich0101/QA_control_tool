const { testCases, testSuites, testRuns, executions, defects, scenarios, userStories } = require('../repositories');
const { ok, created } = require('../utils/responses');
const { checkPermission, generateKey, getProjectIdFromSuite } = require('../utils/keyGenerator');
const { AppError } = require('../middleware/errors');

exports.startExecution = async (req, res) => {
    const tcId = req.params.id;
    const suiteId = await testCases.findSuiteId(tcId);
    if (!suiteId) return res.status(404).json({ error: 'Test case no encontrado' });

    const activeRunId = await testSuites.findActiveRunId(suiteId);
    if (activeRunId) {
        return res.status(400).json({ error: 'La suite ya tiene un ciclo activo.' });
    }

    const runId = await testRuns.create({
        suiteId, createdBy: req.user.id, runType: 'INDIVIDUAL',
        lastResumeAt: null, accumulatedSeconds: 0
    });

    await testSuites.setActiveRun(suiteId, runId);

    await executions.create({
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
        scenario_id = await scenarios.createNextForUS(us_id, title);
        await userStories.appendEscenario(us_id, title);
    }

    const projectId = await getProjectIdFromSuite(suite_id);
    const finalKeyId = await generateKey(projectId, 'TC');

    const tcId = await testCases.create({
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

    const tc = await testCases.findById(tcId);
    if (!tc) return res.status(404).json({ error: 'Test Case no encontrado' });

    if (tc.us_id) {
        return res.status(400).json({ error: 'El TC tiene una HU vinculada. Desvinculá la HU antes de mover.' });
    }

    const sourceSuite = await testSuites.findById(tc.suite_id);
    if (!sourceSuite) return res.status(404).json({ error: 'Suite origen no encontrada' });

    if (sourceSuite.active_run_id) {
        return res.status(400).json({ error: 'El TC está en una suite en ejecución. No se puede mover.' });
    }

    const destSuite = await testSuites.findById(new_suite_id);
    if (!destSuite) return res.status(404).json({ error: 'Suite destino no encontrada' });

    if (sourceSuite.use_case_id !== destSuite.use_case_id) {
        return res.status(400).json({ error: 'Solo se pueden mover TC entre suites del mismo Caso de Uso.' });
    }

    const changes = await testCases.moveToSuite(tcId, new_suite_id, req.user.id);

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
        await testCases.updateDynamicWithUpdatedBy(tcId, fields, req.user.id);

        const tc = await testCases.findSlim(tcId);

        if (tc && tc.us_id && !tc.scenario_id) {
            const newScenarioId = await scenarios.createNextForUS(tc.us_id, tc.title);
            await testCases.setScenario(tcId, newScenarioId);
            await userStories.appendEscenario(tc.us_id, tc.title);
        } else if (tc && tc.scenario_id && req.body.title !== undefined) {
            await scenarios.updateTitle(tc.scenario_id, req.body.title);
        }
    }

    const { status, observations, obtained_result } = req.body;

    if (status || observations !== undefined || obtained_result !== undefined) {
        const suiteId = await testCases.findSuiteId(tcId);
        const runId = await testSuites.findActiveRunId(suiteId);

        if (!runId) {
            return res.status(400).json({ error: 'No hay un ciclo de ejecución activo para esta suite. Inicia uno para registrar resultados.' });
        }

        let execId = null;
        const existingExec = await executions.findByTcAndRun(tcId, runId);
        if (existingExec) {
            execId = existingExec.id;
            const execFields = {};
            if (status !== undefined) execFields.status = status;
            if (observations !== undefined) execFields.observations = observations;
            if (obtained_result !== undefined) execFields.obtained_result = obtained_result;

            if (Object.keys(execFields).length > 0) {
                await executions.updateDynamic(execId, execFields);
            }
        } else {
            execId = await executions.create({
                tcId, runId, tester: req.user.name,
                status: status || 'PENDING', observations: observations || '', obtainedResult: obtained_result || ''
            });
        }
        const { bug_title, bug_description, bug_severity, bug_steps_to_reproduce, bug_expected_result, bug_actual_result, bug_frequency, bug_business_impact } = req.body;
        if (bug_title && (status === 'FAIL' || status === 'WARNING')) {
            const jira_epic_key = await testCases.findJiraEpicKey(tcId) || '';

            const existingBug = await defects.findByExecutionAndTitle(execId, bug_title);
            if (!existingBug) {
                await defects.create({
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
    await testCases.remove(req.params.id);
    return ok(res);
};
