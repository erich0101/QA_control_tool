const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey, getProjectIdFromUC } = require('../lib/sequences');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    const start = Date.now();
    try {
        const { use_case_id, project_id } = req.query;
        let suitesRes;
        
        if (use_case_id) {
            suitesRes = await query(`SELECT * FROM qa_test_suites WHERE use_case_id = ? ORDER BY id`, [use_case_id]);
        } else if (project_id) {
            suitesRes = await query(`
                SELECT s.* FROM qa_test_suites s
                LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
                WHERE s.project_id = ? OR uc.project_id = ?
                ORDER BY s.id
            `, [project_id, project_id]);
        } else {
            return res.status(400).json({ error: 'use_case_id o project_id REQUERIDO' });
        }
        const suites = suitesRes.rows;
        if (suites.length === 0) return res.json({ testSuites: [] });

        const suiteIds = suites.map(s => s.id);
        const activeRunIds = suites.map(s => s.active_run_id).filter(id => id !== null);

        // 1. Fetch all Test Cases for these suites
        const casesRes = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ANY(?) ORDER BY id`, [suiteIds]);
        const allTestCases = casesRes.rows;

        // 2. Fetch all Active Runs info (Including RUNNING and PAUSED)
        let activeRuns = [];
        if (activeRunIds.length > 0) {
            const runsRes = await query(`SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status IN ('ACTIVE', 'RUNNING', 'PAUSED')`, [activeRunIds]);
            activeRuns = runsRes.rows;
        }

        // 3. Fetch Latest Executions (DISTINCT ON tc_id)
        const latestExecsRes = await query(`
            SELECT DISTINCT ON (tc_id) * 
            FROM qa_executions 
            WHERE tc_id IN (SELECT id FROM qa_test_cases WHERE suite_id = ANY(?))
            ORDER BY tc_id, id DESC
        `, [suiteIds]);
        const latestExecs = latestExecsRes.rows;

        // 4. Fetch Active Run Executions
        let activeRunExecs = [];
        if (activeRuns.length > 0) {
            const runIds = activeRuns.map(r => r.id);
            const runExecsRes = await query(`SELECT * FROM qa_executions WHERE run_id = ANY(?)`, [runIds]);
            activeRunExecs = runExecsRes.rows;
        }

        // 5. Fetch Parent Executions (RETEST)
        const parentRunIds = activeRuns.map(r => r.parent_run_id).filter(id => id !== null);
        let parentExecs = [];
        if (parentRunIds.length > 0) {
            const pExecsRes = await query(`
                SELECT DISTINCT ON (tc_id, run_id) *
                FROM qa_executions
                WHERE run_id = ANY(?)
                ORDER BY tc_id, run_id, id DESC
            `, [parentRunIds]);
            parentExecs = pExecsRes.rows;
        }

        // Bulk fetch attachments and defects
        const allExecIds = [...new Set([
            ...latestExecs.map(e => e.id),
            ...activeRunExecs.map(e => e.id),
            ...parentExecs.map(e => e.id)
        ])];

        let allAttachments = [];
        let allDefects = [];
        if (allExecIds.length > 0) {
            const attRes = await query(`SELECT id, execution_id, evidence_category FROM qa_attachments WHERE execution_id = ANY(?)`, [allExecIds]);
            allAttachments = attRes.rows;

            const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ANY(?)`, [allExecIds]);
            allDefects = defRes.rows;
        }

        // 6. Fetch Inconsistencies for all suites
        const incRes = await query(`
            SELECT id, suite_id, title, description, severity, order_index
            FROM qa_inconsistencias
            WHERE suite_id = ANY(?)
            ORDER BY suite_id, order_index
        `, [suiteIds]);
        const allInconsistencies = incRes.rows;

        // Pre-indexar lookups O(1) para evitar O(N²) en el map por TC
        const activeRunById = new Map(activeRuns.map(r => [r.id, r]));
        // Execs del run activo: tc_id -> exec
        const activeRunExecByTc = new Map();
        for (const e of activeRunExecs) activeRunExecByTc.set(e.tc_id, e);
        // Latest exec (sin run activo): tc_id -> exec
        const latestExecByTc = new Map();
        for (const e of latestExecs) latestExecByTc.set(e.tc_id, e);
        // Parent execs (RETEST): tc_id -> exec
        const parentExecByTc = new Map();
        for (const e of parentExecs) parentExecByTc.set(e.tc_id, e);
        // Defects por execution_id
        const defectsByExec = new Map();
        for (const d of allDefects) {
            if (!defectsByExec.has(d.execution_id)) defectsByExec.set(d.execution_id, []);
            defectsByExec.get(d.execution_id).push(d);
        }
        // Attachments por execution_id
        const attachmentsByExec = new Map();
        for (const a of allAttachments) {
            if (!attachmentsByExec.has(a.execution_id)) attachmentsByExec.set(a.execution_id, []);
            attachmentsByExec.get(a.execution_id).push(a);
        }
        // TCs por suite_id
        const tcsBySuite = new Map();
        for (const tc of allTestCases) {
            if (!tcsBySuite.has(tc.suite_id)) tcsBySuite.set(tc.suite_id, []);
            tcsBySuite.get(tc.suite_id).push(tc);
        }
        // Inconsistencias por suite_id
        const incsBySuite = new Map();
        for (const inc of allInconsistencies) {
            if (!incsBySuite.has(inc.suite_id)) incsBySuite.set(inc.suite_id, []);
            incsBySuite.get(inc.suite_id).push(inc);
        }

        const result = suites.map(suite => {
            const activeRun = activeRunById.get(suite.active_run_id) || null;
            const suiteCases = tcsBySuite.get(suite.id) || [];
            const suiteInconsistencies = incsBySuite.get(suite.id) || [];

            const processedCases = suiteCases.map(tc => {
                let exec = null;
                if (activeRun) {
                    exec = activeRunExecByTc.get(tc.id) || null;
                    if (!exec && activeRun.run_type !== 'RETEST' && activeRun.parent_run_id) {
                        const pExec = parentExecByTc.get(tc.id);
                        if (pExec) exec = { ...pExec, is_from_parent: true };
                    }
                } else {
                    exec = latestExecByTc.get(tc.id) || null;
                }

                if (activeRun && !exec) return null;

                const attachments = (attachmentsByExec.get(exec ? exec.id : -1) || [])
                    .map(a => ({ id: a.id, category: a.evidence_category, src: `api/evidence/${a.id}` }));

                const defects = defectsByExec.get(exec ? exec.id : -1) || [];

                if (activeRun && activeRun.run_type === 'RETEST' && exec && exec.status === 'PENDING' && activeRun.parent_run_id) {
                    const pExec = parentExecByTc.get(tc.id);
                    if (pExec) {
                        const historicalDefs = defectsByExec.get(pExec.id) || [];
                        for (const hd of historicalDefs) {
                            if (!defects.find(d => d.id === hd.id)) defects.push({ ...hd, is_historical: true });
                        }
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
                    is_exploratory: !!tc.is_exploratory,
                    last_execution_at: exec ? exec.executed_at : null
                };
            }).filter(tc => tc !== null);

            return { ...suite, activeRun, test_cases: processedCases, test_cases_count: suiteCases.length, inconsistencies: suiteInconsistencies };
        });

        const tcs = result.reduce((acc, s) => acc + (s.test_cases ? s.test_cases.length : 0), 0);
        const defs = result.reduce((acc, s) => acc + (s.test_cases || []).reduce((a, tc) => a + (tc.defects ? tc.defects.length : 0), 0), 0);
        console.log(`GET /api/test-suites ${Date.now() - start}ms suites=${result.length} tcs=${tcs} defects=${defs}`);
        res.json({ testSuites: result });
    } catch (err) {
        console.error('Error in GET /api/test-suites:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_suite')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { use_case_id, title, description, jira_epic_key } = req.body;
        if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });
        
        const projectId = await getProjectIdFromUC(use_case_id);
        const finalKeyId = await generateKey(projectId, 'TS');
        
        const result = await query(`INSERT INTO qa_test_suites (use_case_id, project_id, title, description, created_by, updated_by, key_id, jira_epic_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [use_case_id, projectId, title, description || '', req.user.id, req.user.id, finalKeyId, jira_epic_key || '']);
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── IMPORTACIÓN DUAL XLSX/CSV (US + TESTS) ──

router.put('/:id/inconsistencies', requireAuth, async (req, res) => {
    try {
        const { inconsistencies } = req.body; // array de { title, severity, description }
        if (!Array.isArray(inconsistencies)) return res.status(400).json({ error: 'inconsistencies debe ser un array' });
        
        const suiteId = req.params.id;
        
        // Delete existing and insert new
        await query(`DELETE FROM qa_inconsistencias WHERE suite_id = ?`, [suiteId]);
        
        for (let i = 0; i < inconsistencies.length; i++) {
            const inc = inconsistencies[i];
            await query(`
                INSERT INTO qa_inconsistencias (suite_id, title, description, severity, order_index)
                VALUES (?, ?, ?, ?, ?)
            `, [suiteId, inc.title, inc.description || '', inc.severity || 'Alta', i]);
        }
        
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_test_suites WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM qa_test_suites WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/move', requireAuth, async (req, res) => {
    try {
        const suiteId = req.params.id;
        const { new_use_case_id } = req.body;

        console.log(`[MOVE SUITE] Request received: suiteId=${suiteId}, new_use_case_id=${new_use_case_id}, user=${req.user.id}`);

        if (!new_use_case_id) return res.status(400).json({ error: 'new_use_case_id requerido' });

        const suiteRes = await query(`SELECT id, use_case_id, active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        if (!suiteRes.rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
        const suite = suiteRes.rows[0];

        console.log(`[MOVE SUITE] Suite found: id=${suite.id}, current_uc=${suite.use_case_id}, active_run_id=${suite.active_run_id}`);

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

        console.log(`[MOVE SUITE] UPDATE result: rowCount=${updateRes.changes}, suiteId=${suiteId}, new_uc=${new_use_case_id}`);

        if (updateRes.changes === 0) {
            console.error(`[MOVE SUITE] CRITICAL: UPDATE affected 0 rows for suiteId=${suiteId}`);
            return res.status(500).json({ error: 'La suite no pudo ser movida. El UPDATE no afectó ninguna fila.' });
        }

        res.json({ ok: true, moved: true, new_use_case_id });
    } catch (err) {
        console.error(`[MOVE SUITE] Error:`, err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, assigned_to, jira_epic_key } = req.body;
        await query(`UPDATE qa_test_suites SET title = COALESCE(?, title), description = COALESCE(?, description), assigned_to = COALESCE(?, assigned_to), jira_epic_key = COALESCE(?, jira_epic_key), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, description, assigned_to, jira_epic_key, req.user.id, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/active', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active (boolean) requerido' });

        const suiteId = req.params.id;
        const exists = await query(`SELECT id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        if (exists.rows.length === 0) return res.status(404).json({ error: 'Suite no encontrada' });

        await query(`UPDATE qa_test_suites SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [is_active, req.user.id, suiteId]);

        const { rows } = await query(`SELECT * FROM qa_test_suites WHERE id = ?`, [suiteId]);
        res.json({ ok: true, suite: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/assign-all', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        const suiteId = parseInt(req.params.id);
        const userId = assigned_to ? parseInt(assigned_to) : null;
        await query('UPDATE qa_test_cases SET assigned_to = ? WHERE suite_id = ?', [userId, suiteId]);
        res.json({ ok: true, updated_suite_id: suiteId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── DEFECTOS & BUGS (Avanzado) ──
// ══════════════════════════════════════════════════════════════

module.exports = router;
