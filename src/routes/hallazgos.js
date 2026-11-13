const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey } = require('../lib/sequences');
const { recordStatusChange } = require('../lib/status-history');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const sql = `
            SELECT d.id, d.title, d.description, d.severity, d.status, d.steps_to_reproduce,
                   d.expected_result, d.actual_result, d.frequency, d.business_impact,
                   d.assigned_to, d.jira_key, d.jira_url, d.jira_epic_key, d.project_id,
                   d.component, d.exploratory_run_id,
                   d.created_by, d.created_at,
                   d.preconditions, d.observations,
                   assignee.name as assignee_name,
                   reporter.name as reporter_name,
                   (SELECT COUNT(*) FROM qa_attachments WHERE defect_id = d.id) as evidence_count,
                   ht.tc_id IS NOT NULL as converted_to_tc,
                   ht.tc_id as converted_tc_id,
                   hb.defect_id IS NOT NULL as converted_to_bug,
                   hb.defect_id as converted_bug_id,
                   origin_tc.id as origin_tc_id,
                   origin_tc.key_id as origin_tc_key,
                   origin_tc.title as origin_tc_title
            FROM qa_defects d
            LEFT JOIN qa_hallazgo_tc ht ON d.id = ht.hallazgo_id
            LEFT JOIN qa_hallazgo_bug hb ON d.id = hb.hallazgo_id
            LEFT JOIN qa_test_cases origin_tc ON ht.tc_id = origin_tc.id
            LEFT JOIN qa_users assignee ON d.assigned_to = assignee.id
            LEFT JOIN qa_users reporter ON d.created_by = reporter.id
            WHERE d.project_id = ? AND d.execution_id IS NULL
            ORDER BY d.id DESC
            LIMIT 500
        `;
        const result = await query(sql, [project_id]);
        res.json({ hallazgos: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_cu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { project_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to, jira_epic_key, component, exploratory_run_id } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title son requeridos' });

        // Hallazgo creado desde una sesión exploratoria: se valida que el run
        // exista, sea exploratorio, esté en curso y sea del mismo proyecto.
        let runId = null;
        if (exploratory_run_id !== undefined && exploratory_run_id !== null && exploratory_run_id !== '') {
            const runRes = await query(`
                SELECT r.id, r.status, cu.project_id
                  FROM qa_test_runs r
                  JOIN qa_test_suites s ON r.suite_id = s.id
                  JOIN qa_use_cases cu ON s.use_case_id = cu.id
                 WHERE r.id = ? AND r.run_type = 'EXPLORATORY'
            `, [exploratory_run_id]);
            if (runRes.rows.length === 0) {
                return res.status(400).json({ error: 'Sesión exploratoria no encontrada' });
            }
            if (Number(runRes.rows[0].project_id) !== Number(project_id)) {
                return res.status(400).json({ error: 'La sesión no pertenece al proyecto' });
            }
            if (runRes.rows[0].status !== 'RUNNING') {
                return res.status(400).json({ error: 'La sesión exploratoria está finalizada' });
            }
            runId = runRes.rows[0].id;
        }

        const result = await query(
            `INSERT INTO qa_defects (project_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to, jira_epic_key, component, status, created_by, exploratory_run_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
            [project_id, title, description || '', severity || 'Media', steps_to_reproduce || '', expected_result || '', actual_result || '', frequency || 'Siempre', business_impact || '', preconditions || '', observations || '', assigned_to || null, jira_epic_key || '', component || '', req.user.id, runId]
        );
        try {
            await recordStatusChange({
                projectId: project_id,
                entityType: 'hallazgo',
                entityId: result.lastID,
                runId,
                toStatus: 'OPEN',
                reason: [title, description].filter((part) => part && String(part).trim()).join(' — ') || null,
                changedBy: req.user.id,
            });
        } catch (historyErr) {
            console.error('No se pudo registrar el histórico del hallazgo:', historyErr.message);
        }
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to, jira_epic_key, component } = req.body;
        const fields = [];
        const params = [];
        ['title', 'description', 'severity', 'steps_to_reproduce', 'expected_result', 'actual_result', 'frequency', 'business_impact', 'preconditions', 'observations', 'assigned_to', 'jira_epic_key', 'component'].forEach(f => {
            if (req.body[f] !== undefined) {
                fields.push(`${f} = ?`);
                params.push(req.body[f]);
            }
        });
        if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
        params.push(req.params.id);
        await query(`UPDATE qa_defects SET ${fields.join(', ')} WHERE id = ? AND execution_id IS NULL`, params);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_status_history WHERE entity_type = 'hallazgo' AND entity_id = ?`, [req.params.id]);
        await query(`DELETE FROM qa_defects WHERE id = ? AND execution_id IS NULL`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/status', requireAuth, async (req, res) => {
    try {
        const { status, reason } = req.body;
        if (!status) return res.status(400).json({ error: 'status requerido' });

        const currentRes = await query(
            `SELECT id, project_id, status, title, description, exploratory_run_id
               FROM qa_defects WHERE id = ? AND execution_id IS NULL`,
            [req.params.id]
        );
        if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });
        const current = currentRes.rows[0];

        await query(`UPDATE qa_defects SET status = ? WHERE id = ? AND execution_id IS NULL`, [status, req.params.id]);

        try {
            const historyReason = String(reason || '').trim()
                || [current.title, current.description].filter((part) => part && String(part).trim()).join(' — ')
                || null;
            await recordStatusChange({
                projectId: current.project_id,
                entityType: 'hallazgo',
                entityId: current.id,
                runId: current.exploratory_run_id,
                fromStatus: current.status,
                toStatus: status,
                reason: historyReason,
                changedBy: req.user.id,
            });
        } catch (historyErr) {
            console.error('No se pudo registrar el histórico del hallazgo:', historyErr.message);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/assign', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        await query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ? AND execution_id IS NULL`, [assigned_to || null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/tc', requireAuth, async (req, res) => {
    try {
        const hallazgoId = parseInt(req.params.id);
        const { tc_id } = req.body;

        const exists = await query(`SELECT id FROM qa_defects WHERE id = ? AND execution_id IS NULL`, [hallazgoId]);
        if (exists.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });

        await query(`DELETE FROM qa_hallazgo_tc WHERE hallazgo_id = ?`, [hallazgoId]);

        if (tc_id !== null && tc_id !== undefined && tc_id !== '') {
            const tcIdInt = parseInt(tc_id);
            const tcExists = await query(`SELECT id FROM qa_test_cases WHERE id = ?`, [tcIdInt]);
            if (tcExists.rows.length === 0) return res.status(400).json({ error: 'Test Case no encontrado' });
            // RETURNING hallazgo_id explícito porque qa_hallazgo_tc está en la blacklist de auto-RETURNING
            // (junction table sin PK simple). Sin esto, exec_query de Supabase falla con "column id does not exist".
            await query(`INSERT INTO qa_hallazgo_tc (hallazgo_id, tc_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING hallazgo_id`, [hallazgoId, tcIdInt]);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/convert-to-tc', requireAuth, async (req, res) => {
    try {
        const { suite_id } = req.body;
        if (!suite_id) return res.status(400).json({ error: 'suite_id requerido' });

        // 1. Leer hallazgo
        const hallazgoRes = await query(`SELECT * FROM qa_defects WHERE id = ? AND execution_id IS NULL`, [req.params.id]);
        if (hallazgoRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });
        const h = hallazgoRes.rows[0];

        // 2. Obtener proyecto y generar key
        const projectRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = (SELECT use_case_id FROM qa_test_suites WHERE id = ?)`, [suite_id]);
        const projectId = projectRes.rows[0]?.project_id;
        if (!projectId) return res.status(400).json({ error: 'Suite no encontrada' });

        const finalKeyId = await generateKey(projectId, 'TC');

        // 3. Crear Test Case con datos del hallazgo (heredando los 7 campos transversales + precondiciones)
        const tcRes = await query(
            `INSERT INTO qa_test_cases (suite_id, title, steps, preconditions, expected_result, severity, priority, jira_epic_key, component, assigned_to, project_id, observations, created_by, updated_by, key_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
                suite_id,
                h.title,
                h.steps_to_reproduce || '',
                h.preconditions || '',
                h.expected_result || '',
                h.severity || 'Media',
                h.severity || 'Media',  // priority espejada de severity (compat histórica)
                h.jira_epic_key || '',
                h.component || '',
                h.assigned_to || null,
                h.project_id,
                h.observations || '',
                req.user.id,
                req.user.id,
                finalKeyId
            ]
        );
        const tcId = tcRes.rows[0].id;

        // 4. Registrar relación (RETURNING hallazgo_id explícito porque qa_hallazgo_tc no tiene columna id —
        // está en noIdTables de db.js, pero el RETURNING explícito deja claro el contrato).
        await query(`INSERT INTO qa_hallazgo_tc (hallazgo_id, tc_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING hallazgo_id`, [h.id, tcId]);

        res.json({ ok: true, tc_id: tcId, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/promote-to-bug', requireAuth, async (req, res) => {
    const { execution_id } = req.body;
    if (!execution_id) {
        return res.status(400).json({
            error: 'execution_id requerido',
            hint: 'Promover un hallazgo a bug requiere un execution_id que vincule el bug a la corrida que lo descubrió.'
        });
    }

    try {
        const exists = await query(
            `SELECT id FROM qa_defects WHERE id = ? AND execution_id IS NULL`,
            [req.params.id]
        );
        if (exists.rows.length === 0) {
            return res.status(404).json({ error: 'Hallazgo no encontrado o ya promovido.' });
        }
        const execExists = await query(`SELECT id FROM qa_executions WHERE id = ?`, [execution_id]);
        if (execExists.rows.length === 0) {
            return res.status(404).json({ error: 'execution_id no existe.' });
        }

        return res.status(501).json({
            error: 'promote-to-bug aún no implementado',
            planned_sql: 'UPDATE qa_defects SET execution_id = $1 WHERE id = $2 AND execution_id IS NULL',
            params: { execution_id, hallazgo_id: req.params.id }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/evidence', requireAuth, async (req, res) => {
    try {
        const result = await query(`
            SELECT id, file_name, mime_type, evidence_category, created_at
            FROM qa_attachments WHERE defect_id = ? ORDER BY id
        `, [req.params.id]);
        res.json({ evidence: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
