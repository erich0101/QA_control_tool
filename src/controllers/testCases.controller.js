const { query } = require('../config/db');
const { ok, created } = require('../utils/responses');
const { checkPermission, generateKey, getProjectIdFromSuite } = require('../utils/keyGenerator');
const { AppError } = require('../middleware/errors');

exports.startExecution = async (req, res) => {
    const tcId = req.params.id;
    const tcRes = await query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [tcId]);
    if (tcRes.rows.length === 0) return res.status(404).json({ error: 'Test case no encontrado' });
    const suiteId = tcRes.rows[0].suite_id;

    const suiteRes = await query(`SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
    if (suiteRes.rows[0]?.active_run_id) {
        return res.status(400).json({ error: 'La suite ya tiene un ciclo activo.' });
    }

    const runRes = await query(`
        INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
        VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
    `, [suiteId, req.user.id, 'INDIVIDUAL']);
    const runId = runRes.lastID;

    await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);

    await query(`
        INSERT INTO qa_executions (tc_id, run_id, tester, status)
        VALUES (?, ?, ?, 'PENDING')
    `, [tcId, runId, req.user.name]);

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
        const scenarioRes = await query(
            `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
            [us_id, title, us_id]
        );
        scenario_id = scenarioRes.rows[0].id;

        await query(
            `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
            [title, title, us_id]
        );
    }

    const projectId = await getProjectIdFromSuite(suite_id);
    const finalKeyId = await generateKey(projectId, 'TC');

    const result = await query(`INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, title, steps, expected_result, assigned_to, created_by, updated_by, key_id, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [suite_id, us_id || null, scenario_id || null, title, steps || '', expected_result || '', assigned_to || null, req.user.id, req.user.id, finalKeyId, preconditions || '', jira_epic_key || '', assumptions || '', test_data || '', acceptance_criteria || '']);
    return created(res, { id: result.lastID, key_id: finalKeyId, scenario_id });
};

exports.move = async (req, res) => {
    const tcId = req.params.id;
    const { new_suite_id } = req.body;

    if (!new_suite_id) return res.status(400).json({ error: 'new_suite_id requerido' });

    const tcRes = await query(`SELECT id, suite_id, us_id FROM qa_test_cases WHERE id = ?`, [tcId]);
    if (!tcRes.rows.length) return res.status(404).json({ error: 'Test Case no encontrado' });
    const tc = tcRes.rows[0];

    if (tc.us_id) {
        return res.status(400).json({ error: 'El TC tiene una HU vinculada. Desvinculá la HU antes de mover.' });
    }

    const sourceSuiteRes = await query(`SELECT id, use_case_id, active_run_id FROM qa_test_suites WHERE id = ?`, [tc.suite_id]);
    if (!sourceSuiteRes.rows.length) return res.status(404).json({ error: 'Suite origen no encontrada' });
    const sourceSuite = sourceSuiteRes.rows[0];

    if (sourceSuite.active_run_id) {
        return res.status(400).json({ error: 'El TC está en una suite en ejecución. No se puede mover.' });
    }

    const destSuiteRes = await query(`SELECT id, use_case_id FROM qa_test_suites WHERE id = ?`, [new_suite_id]);
    if (!destSuiteRes.rows.length) return res.status(404).json({ error: 'Suite destino no encontrada' });
    const destSuite = destSuiteRes.rows[0];

    if (sourceSuite.use_case_id !== destSuite.use_case_id) {
        return res.status(400).json({ error: 'Solo se pueden mover TC entre suites del mismo Caso de Uso.' });
    }

    const updateRes = await query(`UPDATE qa_test_cases SET suite_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [new_suite_id, req.user.id, tcId]);

    if (updateRes.changes === 0) {
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
        fields.push(`updated_by = ?`);
        params.push(req.user.id);
        params.push(req.params.id);
        await query(`UPDATE qa_test_cases SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

        const tcRes = await query(`SELECT title, us_id, scenario_id FROM qa_test_cases WHERE id = ?`, [tcId]);
        const tc = tcRes.rows[0];

        if (tc && tc.us_id && !tc.scenario_id) {
            const scenarioRes = await query(
                `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
                [tc.us_id, tc.title, tc.us_id]
            );
            const newScenarioId = scenarioRes.rows[0].id;
            await query(`UPDATE qa_test_cases SET scenario_id = ? WHERE id = ?`, [newScenarioId, tcId]);

            await query(
                `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
                [tc.title, tc.title, tc.us_id]
            );
        } else if (tc && tc.scenario_id && req.body.title !== undefined) {
            await query(`UPDATE qa_scenarios SET title = ? WHERE id = ?`, [req.body.title, tc.scenario_id]);
        }
    }

    const { status, observations, obtained_result } = req.body;

    if (status || observations !== undefined || obtained_result !== undefined) {
        const tcInfo = await query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [tcId]);
        const suiteId = tcInfo.rows[0]?.suite_id;
        const suiteInfo = await query(`SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        const runId = suiteInfo.rows[0]?.active_run_id;

        if (!runId) {
            return res.status(400).json({ error: 'No hay un ciclo de ejecución activo para esta suite. Inicia uno para registrar resultados.' });
        }

        let execId = null;
        const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`, [tcId, runId]);
        if (execRes.rows.length > 0) {
            execId = execRes.rows[0].id;
            const execFields = [];
            const execParams = [];
            if (status !== undefined) { execFields.push('status = ?'); execParams.push(status); }
            if (observations !== undefined) { execFields.push('observations = ?'); execParams.push(observations); }
            if (obtained_result !== undefined) { execFields.push('obtained_result = ?'); execParams.push(obtained_result); }

            if (execFields.length > 0) {
                execParams.push(execId);
                await query(`UPDATE qa_executions SET ${execFields.join(', ')} WHERE id = ?`, execParams);
            }
        } else {
            const insertRes = await query(`INSERT INTO qa_executions (tc_id, run_id, tester, status, observations, obtained_result) VALUES (?, ?, ?, ?, ?, ?)`,
                [tcId, runId, req.user.name, status || 'PENDING', observations || '', obtained_result || '']);
            execId = insertRes.lastID;
        }
        const { bug_title, bug_description, bug_severity, bug_steps_to_reproduce, bug_expected_result, bug_actual_result, bug_frequency, bug_business_impact } = req.body;
        if (bug_title && (status === 'FAIL' || status === 'WARNING')) {
            const suiteInfo = await query(`
                SELECT s.jira_epic_key
                FROM qa_test_suites s
                JOIN qa_test_cases tc ON s.id = tc.suite_id
                WHERE tc.id = ?
            `, [tcId]);
            const jira_epic_key = suiteInfo.rows[0]?.jira_epic_key || '';

            const existingBug = await query(`SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`, [execId, bug_title]);
            if (existingBug.rows.length === 0) {
                await query(`INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
                    [execId, bug_title, bug_description || '', bug_severity || 'Media', bug_steps_to_reproduce || '', bug_expected_result || '', bug_actual_result || '', bug_frequency || 'Siempre', bug_business_impact || '', jira_epic_key]);
            }
        }
        return ok(res, { execution_id: execId });
    }
    return ok(res);
};

exports.remove = async (req, res) => {
    await query(`DELETE FROM qa_test_cases WHERE id = ?`, [req.params.id]);
    return ok(res);
};
