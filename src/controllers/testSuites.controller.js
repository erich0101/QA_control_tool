const { query } = require('../config/db');
const { ok, created, noContent } = require('../utils/responses');
const { checkPermission, generateKey, getProjectIdFromUC } = require('../services/key.service');
const { AppError } = require('../middleware/errors');
const testSuitesService = require('../services/testSuites.service');

exports.list = async (req, res) => {
    const result = await testSuitesService.list(req.query, req.log);
    return res.json(result);
};

exports.create = async (req, res) => {
    if (!(await checkPermission(req.user.id, 'can_create_suite')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    const { use_case_id, title, description, jira_epic_key } = req.body;
    if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });

    const projectId = await getProjectIdFromUC(use_case_id);
    const finalKeyId = await generateKey(projectId, 'TS');

    const result = await query(`INSERT INTO qa_test_suites (use_case_id, title, description, created_by, updated_by, key_id, jira_epic_key) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [use_case_id, title, description || '', req.user.id, req.user.id, finalKeyId, jira_epic_key || '']);
    return created(res, { id: result.lastID, key_id: finalKeyId });
};

exports.startExecution = async (req, res) => {
    const suiteId = req.params.id;
    const { execution_type, filters } = req.body;

    let filterSql = `SELECT id, assigned_to FROM qa_test_cases WHERE suite_id = ?`;
    let params = [suiteId];

    if (execution_type === 'SMOKE') {
        filterSql += ` AND is_smoke = true`;
    } else if (execution_type === 'REGRESSION') {
        filterSql += ` AND is_regression = true`;
    } else if (execution_type === 'INTEGRATION') {
        filterSql += ` AND is_integration = true`;
    } else if (execution_type === 'EXPLORATORY') {
        filterSql += ` AND is_exploratory = true`;
    } else if (execution_type === 'CUSTOM' && filters) {
        if (filters.priority) { filterSql += ` AND priority = ?`; params.push(filters.priority); }
        if (filters.is_smoke !== undefined) { filterSql += ` AND is_smoke = ?`; params.push(filters.is_smoke); }
        if (filters.is_regression !== undefined) { filterSql += ` AND is_regression = ?`; params.push(filters.is_regression); }
        if (filters.is_integration !== undefined) { filterSql += ` AND is_integration = ?`; params.push(filters.is_integration); }
        if (filters.is_exploratory !== undefined) { filterSql += ` AND is_exploratory = ?`; params.push(filters.is_exploratory); }
    }

    const eligibleTests = await query(filterSql, params);

    let finalEligible = eligibleTests.rows;
    if (req.body.only_assigned) {
        finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
    }

    if (finalEligible.length === 0) {
        return res.status(400).json({ error: 'No hay tests asignados a tu usuario en esta suite o no coinciden con los filtros.' });
    }

    const runRes = await query(`
        INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
        VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
    `, [suiteId, req.user.id, execution_type || 'FULL']);
    const runId = runRes.lastID;

    await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);

    for (const tc of finalEligible) {
        await query(`
            INSERT INTO qa_executions (tc_id, run_id, tester, status)
            VALUES (?, ?, ?, 'PENDING')
        `, [tc.id, runId, req.user.name]);
    }

    res.json({ ok: true, runId, testCount: finalEligible.length });
};

exports.startAll = async (req, res) => {
    const ucId = parseInt(req.params.id);
    const onlyAssigned = req.body.only_assigned !== false;
    const executionType = req.body.execution_type || 'REGRESSION';

    const suitesRes = await query(`
        SELECT s.id, s.title, s.key_id
        FROM qa_test_suites s
        WHERE s.use_case_id = ? AND s.active_run_id IS NULL
        ORDER BY s.id
    `, [ucId]);

    if (suitesRes.rows.length === 0) {
        return res.status(400).json({ error: 'No hay suites disponibles para ejecutar en este Caso de Uso' });
    }

    const results = [];
    let totalTests = 0;

    for (const suite of suitesRes.rows) {
        try {
            let filterSql = `SELECT id, assigned_to FROM qa_test_cases WHERE suite_id = ?`;
            let params = [suite.id];

            if (executionType === 'SMOKE') {
                filterSql += ` AND is_smoke = true`;
            } else if (executionType === 'REGRESSION') {
                filterSql += ` AND is_regression = true`;
            } else if (executionType === 'INTEGRATION') {
                filterSql += ` AND is_integration = true`;
            } else if (executionType === 'EXPLORATORY') {
                filterSql += ` AND is_exploratory = true`;
            }

            const eligibleTests = await query(filterSql, params);

            let finalEligible = eligibleTests.rows;
            if (onlyAssigned) {
                finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
            }

            if (finalEligible.length === 0) {
                results.push({ suiteId: suite.id, title: suite.title, error: 'Sin tests asignados o que coincidan con el filtro', status: 'skip' });
                continue;
            }

            const runRes = await query(`
                INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
                VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
            `, [suite.id, req.user.id, executionType]);
            const runId = runRes.lastID;

            await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suite.id]);

            for (const tc of finalEligible) {
                await query(`INSERT INTO qa_executions (tc_id, run_id, tester, status) VALUES (?, ?, ?, 'PENDING')`, [tc.id, runId, req.user.name]);
            }

            results.push({ suiteId: suite.id, title: suite.title, runId, testCount: finalEligible.length, status: 'ok' });
            totalTests += finalEligible.length;
        } catch (err) {
            results.push({ suiteId: suite.id, title: suite.title, error: err.message, status: 'error' });
        }
    }

    const executed = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    const failed = results.filter(r => r.status === 'error').length;

    res.json({
        ok: true,
        totalSuites: suitesRes.rows.length,
        executedSuites: executed,
        skippedSuites: skipped,
        failedSuites: failed,
        totalTests,
        results
    });
};

exports.pauseRun = async (req, res) => {
    const runId = req.params.id;
    const runRes = await query(`SELECT last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ? AND status = 'RUNNING'`, [runId]);
    if (runRes.rows.length === 0) return res.status(400).json({ error: 'El ciclo no está en ejecución o no existe.' });

    const run = runRes.rows[0];
    const lastResume = new Date(run.last_resume_at);
    const now = new Date();
    const deltaSeconds = Math.floor((now - lastResume) / 1000);
    const newAccumulated = (run.accumulated_seconds || 0) + deltaSeconds;

    await query(`UPDATE qa_test_runs SET status = 'PAUSED', accumulated_seconds = ?, last_resume_at = NULL WHERE id = ?`, [newAccumulated, runId]);
    res.json({ ok: true, accumulated_seconds: newAccumulated });
};

exports.resumeRun = async (req, res) => {
    const runId = req.params.id;
    const runRes = await query(`SELECT id FROM qa_test_runs WHERE id = ? AND status = 'PAUSED'`, [runId]);
    if (runRes.rows.length === 0) return res.status(400).json({ error: 'El ciclo no está pausado o no existe.' });

    await query(`UPDATE qa_test_runs SET status = 'RUNNING', last_resume_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId]);
    return ok(res);
};

exports.finishExecution = async (req, res) => {
    const suiteId = req.params.id;
    const suiteRes = await query(`SELECT active_run_id, assigned_to FROM qa_test_suites WHERE id = ?`, [suiteId]);
    const suite = suiteRes.rows[0];

    if (!suite) return res.status(404).json({ error: 'Suite no encontrada' });

    const runId = suite.active_run_id;
    if (!runId) return res.status(400).json({ error: 'No hay un ciclo activo para esta suite' });

    const execs = await query(`SELECT status FROM qa_executions WHERE run_id = ?`, [runId]);
    const stats = {
        total: execs.rows.length,
        pass: execs.rows.filter(e => e.status === 'PASS' || e.status === 'OK').length,
        fail: execs.rows.filter(e => e.status === 'FAIL').length,
        warn: execs.rows.filter(e => e.status === 'WARNING').length,
        block: execs.rows.filter(e => e.status === 'BLOCK').length,
        skipped: execs.rows.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
    };

    const runInfo = await query(`SELECT status, last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ?`, [runId]);
    const run = runInfo.rows[0];
    let finalSeconds = run.accumulated_seconds || 0;

    if (run.status === 'RUNNING') {
        const lastResume = new Date(run.last_resume_at);
        finalSeconds += Math.floor((new Date() - lastResume) / 1000);
    }

    await query(`UPDATE qa_test_runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP, accumulated_seconds = ? WHERE id = ?`, [finalSeconds, runId]);
    await query(`UPDATE qa_test_suites SET active_run_id = NULL WHERE id = ?`, [suiteId]);

    res.json({ ok: true, stats });
};

exports.retest = async (req, res) => {
    const oldRunId = req.params.id;
    const oldRun = await query(`SELECT suite_id FROM qa_test_runs WHERE id = ?`, [oldRunId]);
    if (oldRun.rows.length === 0) return res.status(404).json({ error: 'Run no encontrado' });

    const suiteId = oldRun.rows[0].suite_id;

    const failedTests = await query(`
        SELECT DISTINCT e.tc_id
        FROM qa_executions e
        WHERE e.run_id = ?
        AND e.status IN ('FAIL', 'WARNING', 'BLOCKED', 'BLOCK')
    `, [oldRunId]);

    if (failedTests.rows.length === 0) {
        return res.status(400).json({ error: 'No hay tests fallidos o bloqueados para retestear.' });
    }

    const runRes = await query(`
        INSERT INTO qa_test_runs (suite_id, status, created_by, parent_run_id, run_type)
        VALUES (?, 'RUNNING', ?, ?, 'RETEST')
    `, [suiteId, req.user.id, oldRunId]);
    const newRunId = runRes.lastID;

    await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [newRunId, suiteId]);

    for (const test of failedTests.rows) {
        await query(`
            INSERT INTO qa_executions (tc_id, run_id, tester, status, observations)
            VALUES (?, ?, ?, 'PENDING', 'Pendiente de retest')
        `, [test.tc_id, newRunId, req.user.name]);
    }

    res.json({ ok: true, runId: newRunId, suite_id: suiteId, testCount: failedTests.rows.length });
};

exports.updateInconsistencies = async (req, res) => {
    const { inconsistencies } = req.body;
    if (!Array.isArray(inconsistencies)) return res.status(400).json({ error: 'inconsistencies debe ser un array' });

    const suiteId = req.params.id;

    await query(`DELETE FROM qa_inconsistencias WHERE suite_id = ?`, [suiteId]);

    for (let i = 0; i < inconsistencies.length; i++) {
        const inc = inconsistencies[i];
        await query(`
            INSERT INTO qa_inconsistencias (suite_id, title, description, severity, order_index)
            VALUES (?, ?, ?, ?, ?)
        `, [suiteId, inc.title, inc.description || '', inc.severity || 'Alta', i]);
    }

    return ok(res);
};

exports.remove = async (req, res) => {
    await query(`DELETE FROM qa_test_suites WHERE id = ?`, [req.params.id]);
    return ok(res);
};

exports.getOne = async (req, res) => {
    const { rows } = await query(`SELECT * FROM qa_test_suites WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
    res.json(rows[0]);
};

exports.move = async (req, res) => {
    const suiteId = req.params.id;
    const { new_use_case_id } = req.body;

    req.log?.debug({ suiteId, new_use_case_id, user: req.user.id }, '[MOVE SUITE] Request received');

    if (!new_use_case_id) return res.status(400).json({ error: 'new_use_case_id requerido' });

    const suiteRes = await query(`SELECT id, use_case_id, active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
    if (!suiteRes.rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
    const suite = suiteRes.rows[0];

    req.log?.debug({ id: suite.id, current_uc: suite.use_case_id, active_run_id: suite.active_run_id }, '[MOVE SUITE] Suite found');

    if (suite.active_run_id) {
        return res.status(400).json({ error: 'La suite está en ejecución. No se puede mover.' });
    }

    const linkedRes = await query(`SELECT COUNT(*) as cnt FROM qa_test_cases WHERE suite_id = ? AND us_id IS NOT NULL`, [suiteId]);
    const linkedCount = linkedRes.rows[0].cnt;
    if (linkedCount > 0) {
        return res.status(400).json({ error: `La suite tiene ${linkedCount} TC(s) vinculados a HU. Desvinculá las HU antes de mover.` });
    }

    const sourceCURRes = await query(`SELECT id, project_id FROM qa_use_cases WHERE id = ?`, [suite.use_case_id]);
    if (!sourceCURRes.rows.length) return res.status(404).json({ error: 'CU origen no encontrado' });
    const sourceCU = sourceCURRes.rows[0];

    const destCURRes = await query(`SELECT id, project_id FROM qa_use_cases WHERE id = ?`, [new_use_case_id]);
    if (!destCURRes.rows.length) return res.status(404).json({ error: 'CU destino no encontrado' });
    const destCU = destCURRes.rows[0];

    if (sourceCU.project_id !== destCU.project_id) {
        return res.status(400).json({ error: 'Solo se pueden mover suites entre CU del mismo proyecto.' });
    }

    const updateRes = await query(`UPDATE qa_test_suites SET use_case_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [new_use_case_id, req.user.id, suiteId]);

    req.log?.debug({ rowCount: updateRes.changes, suiteId, new_uc: new_use_case_id }, '[MOVE SUITE] UPDATE result');

    if (updateRes.changes === 0) {
        req.log?.error({ suiteId }, '[MOVE SUITE] CRITICAL: UPDATE affected 0 rows');
        throw new AppError('La suite no pudo ser movida. El UPDATE no afectó ninguna fila.', 500);
    }

    res.json({ ok: true, moved: true, new_use_case_id });
};

exports.update = async (req, res) => {
    const { title, description, assigned_to, jira_epic_key } = req.body;
    await query(`UPDATE qa_test_suites SET title = COALESCE(?, title), description = COALESCE(?, description), assigned_to = COALESCE(?, assigned_to), jira_epic_key = COALESCE(?, jira_epic_key), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, description, assigned_to, jira_epic_key, req.user.id, req.params.id]);
    return ok(res);
};

exports.assignAll = async (req, res) => {
    const { assigned_to } = req.body;
    const suiteId = parseInt(req.params.id);
    const userId = assigned_to ? parseInt(assigned_to) : null;
    await query('UPDATE qa_test_cases SET assigned_to = ? WHERE suite_id = ?', [userId, suiteId]);
    res.json({ ok: true, updated_suite_id: suiteId });
};
