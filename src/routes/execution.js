const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');

// Ciclos de ejecución: pausa, reanudación, retest y defectos del run.
const runsRouter = express.Router();

runsRouter.post('/:id/pause', requireAuth, async (req, res) => {
    try {
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reanudar ciclo de ejecución

runsRouter.post('/:id/resume', requireAuth, async (req, res) => {
    try {
        const runId = req.params.id;
        const runRes = await query(`SELECT id FROM qa_test_runs WHERE id = ? AND status = 'PAUSED'`, [runId]);
        if (runRes.rows.length === 0) return res.status(400).json({ error: 'El ciclo no está pausado o no existe.' });

        await query(`UPDATE qa_test_runs SET status = 'RUNNING', last_resume_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalizar ciclo de ejecución con cálculo de estadísticas

runsRouter.post('/:id/retest', requireAuth, async (req, res) => {
    try {
        const oldRunId = req.params.id;
        const oldRun = await query(`SELECT suite_id FROM qa_test_runs WHERE id = ?`, [oldRunId]);
        if (oldRun.rows.length === 0) return res.status(404).json({ error: 'Run no encontrado' });

        const suiteId = oldRun.rows[0].suite_id;

        // 1. Identificar tests que fallaron o fueron bloqueados
        // Solo incluimos los que tienen sus bugs en 'FIXED' o no tienen bugs (ej: BLOCKED o FAIL sin bug aún)
        const failedTests = await query(`
            SELECT DISTINCT e.tc_id 
            FROM qa_executions e
            WHERE e.run_id = ? 
            AND e.status IN ('FAIL', 'WARNING', 'BLOCKED', 'BLOCK')
        `, [oldRunId]);

        if (failedTests.rows.length === 0) {
            return res.status(400).json({ error: 'No hay tests fallidos o bloqueados para retestear.' });
        }

        // 2. Crear nuevo run
        const runRes = await query(`
            INSERT INTO qa_test_runs (suite_id, status, created_by, parent_run_id, run_type) 
            VALUES (?, 'RUNNING', ?, ?, 'RETEST')
        `, [suiteId, req.user.id, oldRunId]);
        const newRunId = runRes.lastID;

        // 3. Marcar suite con el nuevo run
        await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [newRunId, suiteId]);

        // 4. Pre-poblar ejecuciones PENDING para los tests seleccionados
        for (const test of failedTests.rows) {
            await query(`
                INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status, observations) 
                VALUES (?, ?, ?, ?, 'PENDING', 'Pendiente de retest')
            `, [test.tc_id, newRunId, req.user.name, req.user.id]);
        }

        res.json({ ok: true, runId: newRunId, suite_id: suiteId, testCount: failedTests.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta dedicada para guardar/reemplazar inconsistencias de una suite

runsRouter.get('/:id/bugs', requireAuth, async (req, res) => {
    try {
        const bugs = await query(`
            SELECT b.*, tc.title as tc_title 
            FROM qa_defects b
            JOIN qa_executions e ON b.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            WHERE e.run_id = ?
        `, [req.params.id]);
        res.json({ bugs: bugs.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── STATS (dashboard) ──
// Implementación en src/routes/stats.js.

// Historial de ciclos finalizados (paginado).
const historyRouter = express.Router();

historyRouter.get('/', requireAuth, async (req, res) => {
    const start = Date.now();
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        // Paginación: ?page=1&limit=50 (defaults: page=1, limit=50)
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        // Total para el paginador (es la única query extra; el resto del endpoint sigue escalando)
        const totalRes = await query(`
            SELECT COUNT(*)::int AS total
            FROM qa_test_runs r
            JOIN qa_test_suites s ON r.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            WHERE uc.project_id = ? AND r.status = 'FINISHED'
        `, [project_id]);
        const total = totalRes.rows[0] ? totalRes.rows[0].total : 0;

        const runs = await query(`
            SELECT r.*, s.title as suite_title, u.name as tester_name
            FROM qa_test_runs r
            JOIN qa_test_suites s ON r.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_users u ON r.created_by = u.id
            WHERE uc.project_id = ? AND r.status = 'FINISHED'
            ORDER BY r.finished_at DESC
            LIMIT ? OFFSET ?
        `, [project_id, limit, offset]);

        if (runs.rows.length === 0) {
            console.log(`GET /api/history ${Date.now() - start}ms page=${page} limit=${limit} total=${total} runs=0`);
            return res.json({ runs: [], total, page, limit, totalPages: Math.ceil(total / limit) });
        }

        // Una sola query agregada en lugar de N+1
        const runIds = runs.rows.map(r => r.id);
        const statsRes = await query(`
            SELECT run_id, status, COUNT(*)::int AS count
            FROM qa_executions
            WHERE run_id = ANY(?)
            GROUP BY run_id, status
        `, [runIds]);

        // Indexar stats por run_id para lookup O(1)
        const statsByRun = new Map();
        for (const row of statsRes.rows) {
            let s = statsByRun.get(row.run_id);
            if (!s) {
                s = { total: 0, pass: 0, fail: 0, warn: 0, block: 0, skipped: 0 };
                statsByRun.set(row.run_id, s);
            }
            const count = row.count;
            s.total += count;
            if (row.status === 'PASS' || row.status === 'OK') s.pass += count;
            else if (row.status === 'FAIL') s.fail += count;
            else if (row.status === 'WARNING') s.warn += count;
            else if (row.status === 'BLOCK') s.block += count;
            else if (row.status === 'SKIPPED' || row.status === 'SKIP') s.skipped += count;
        }

        const result = runs.rows.map(run => ({
            ...run,
            stats: statsByRun.get(run.id) || { total: 0, pass: 0, fail: 0, warn: 0, block: 0, skipped: 0 }
        }));

        console.log(`GET /api/history ${Date.now() - start}ms page=${page} limit=${limit} total=${total} runs=${result.length}`);
        res.json({ runs: result, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = { runsRouter, historyRouter };
