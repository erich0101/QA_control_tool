const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey } = require('../lib/sequences');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const result = await query(`
            SELECT cu.*,
                (SELECT COUNT(*) FROM qa_user_stories WHERE use_case_id = cu.id) as us_count
            FROM qa_use_cases cu
            WHERE cu.project_id = ?
            ORDER BY cu.id DESC
        `, [project_id]);

        res.json({ useCases: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            const allowed = await checkPermission(req.user.id, 'can_create_cu');
            if (!allowed) return res.status(403).json({ error: 'No tienes permiso para crear Casos de Uso' });
        }

        const { project_id, key_id, title, description } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title requeridos' });

        const finalKeyId = key_id || await generateKey(project_id, 'CU');
        const result = await query(
            `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, finalKeyId, title, description || '', req.user.id, req.user.id]
        );
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, status, key_id } = req.body;
        await query(`UPDATE qa_use_cases SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), key_id = COALESCE(?, key_id), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, description, status, key_id, req.user.id, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_use_cases WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── USER STORIES (hijas de Caso de Uso) ──
// ══════════════════════════════════════════════════════════════

router.post('/:id/start-all', requireAuth, async (req, res) => {
    try {
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
                    await query(`INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status) VALUES (?, ?, ?, ?, 'PENDING')`, [tc.id, runId, req.user.name, req.user.id]);
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pausar ciclo de ejecución

module.exports = router;
