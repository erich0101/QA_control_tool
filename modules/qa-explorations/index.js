/**
 * qa-explorations — Módulo de Testing Exploratorio (Sesiones ad-hoc).
 *
 * Reglas de diseño (ver .specify/memory/constitution.md):
 *  - Sesión = qa_test_runs con run_type='EXPLORATORY' + charter + timebox_minutes.
 *  - Flujo  = qa_test_cases con is_exploratory=true dentro de la suite sintética "🧪 Exploratoria".
 *  - Tests  = qa_executions. FAIL auto-crea qa_defects (mismo path que server.js:3417-3462).
 *  - Promover a TC = reusa POST /api/hallazgos/:id/convert-to-tc.
 *  - La suite sintética NUNCA tiene active_run_id (para no chocar con PUT /api/test-cases/:id).
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { query } = require('../../db');
const { requireAdmin } = require('../../src/middleware/auth');
const { buildStatusReason, recordStatusChange } = require('../../src/lib/status-history');
const { buildStatusReportData } = require('./status-report/data');
const { renderStatusReport } = require('./status-report/render');
const { buildBugsReportData } = require('./bugs-report/data');
const { renderBugsReport } = require('./bugs-report/render');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Helpers locales ────────────────────────────────────────────────────────────

async function getDefaultUseCaseId(projectId) {
    const r = await query(
        `SELECT id FROM qa_use_cases WHERE project_id = ? ORDER BY id ASC LIMIT 1`,
        [projectId]
    );
    return r.rows[0]?.id || null;
}

async function ensureExploratoriaSuite(projectId, useCaseId, userId) {
    // Si el caller pasó un UC, usarlo; si no, tomar el primero del proyecto.
    const targetUcId = useCaseId || (await getDefaultUseCaseId(projectId));
    if (!targetUcId) {
        throw new Error('No hay un Caso de Uso en el proyecto para alojar la suite Exploratoria.');
    }
    const found = await query(
        `SELECT id FROM qa_test_suites WHERE use_case_id = ? AND title = ? LIMIT 1`,
        [targetUcId, '🧪 Exploratoria']
    );
    if (found.rows[0]) return { suiteId: found.rows[0].id, useCaseId: targetUcId };

    // Generar key_id para la suite usando la misma helper de server.js
    // (es un helper privado, replicamos el patrón aquí con la tabla de secuencias)
    const seqRes = await query(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, 'TS', 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`,
        [projectId]
    );
    const lastNumber = seqRes.rows[0].last_number;
    const keyId = `TS-${String(lastNumber).padStart(3, '0')}`;

    const ins = await query(
        `INSERT INTO qa_test_suites (use_case_id, title, description, created_by, updated_by, key_id, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
            targetUcId,
            '🧪 Exploratoria',
            'Suite sintética para sesiones de testing exploratorio',
            userId, userId, keyId, projectId
        ]
    );
    return { suiteId: ins.rows[0].id, useCaseId: targetUcId };
}

async function generateTcKey(projectId) {
    const seqRes = await query(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, 'TC', 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`,
        [projectId]
    );
    const lastNumber = seqRes.rows[0].last_number;
    return `TC-${String(lastNumber).padStart(3, '0')}`;
}

// ── GET /api/explorations/sessions ────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
    try {
        const { project_id, status } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const params = [project_id];
        let statusFilter = '';
        if (status) {
            statusFilter = 'AND r.status = ?';
            params.push(status);
        }

        const r = await query(
            `SELECT r.id, r.name, r.charter, r.timebox_minutes, r.status,
                    r.started_at, r.finished_at, r.created_by, r.run_type,
                    u.name AS creator_name,
                    r.total_flows AS flow_count,
                    r.ok_count, r.fail_count, r.warning_count, r.block_count,
                    r.skip_count, r.pending_count, r.coverage_ready, r.deadline_at,
                    r.planned_start_at, r.planned_end_at,
                    (SELECT COUNT(*) FROM qa_defects d
                      WHERE d.exploratory_run_id = r.id AND d.execution_id IS NULL) AS hallazgo_count,
                    EXISTS (SELECT 1 FROM qa_exploratory_blocks b
                             WHERE b.run_id = r.id AND b.blocked_to IS NULL) AS is_blocked
               FROM qa_test_runs r
               LEFT JOIN qa_users u ON u.id = r.created_by
              WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' ${statusFilter}
              ORDER BY r.id DESC`,
            params
        );
        res.json({ sessions: r.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/sessions ───────────────────────────────────────────
router.post('/sessions', async (req, res) => {
    try {
        const {
            name, charter, timebox_minutes, use_case_id,
            planned_start_at, planned_end_at, deadline_at,
        } = req.body;
        const projectId = req.body.project_id;
        if (!projectId) return res.status(400).json({ error: 'project_id requerido' });
        if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });

        // Ventana planificada: inicio y fin definidos al crear la sesión.
        // `deadline_at` se acepta como alias de `planned_end_at` para no
        // romper clientes anteriores.
        const plannedStart = planned_start_at ? new Date(planned_start_at) : new Date();
        if (Number.isNaN(plannedStart.getTime())) {
            return res.status(400).json({ error: 'El inicio planificado (planned_start_at) no es válido' });
        }
        const plannedEnd = planned_end_at || deadline_at ? new Date(planned_end_at || deadline_at) : null;
        if (!plannedEnd || Number.isNaN(plannedEnd.getTime())) {
            return res.status(400).json({ error: 'El fin planificado (planned_end_at) es obligatorio' });
        }
        if (plannedEnd.getTime() <= plannedStart.getTime()) {
            return res.status(400).json({ error: 'El fin planificado debe ser posterior al inicio planificado' });
        }
        if (plannedEnd.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'El fin planificado debe ser futuro' });
        }

        const { suiteId } = await ensureExploratoriaSuite(projectId, use_case_id, req.user.id);

        const ins = await query(
            `INSERT INTO qa_test_runs
                (suite_id, project_id, status, created_by, run_type, name, charter, timebox_minutes,
                 planned_start_at, planned_end_at, deadline_at, last_resume_at, accumulated_seconds)
             VALUES (?, ?, 'RUNNING', ?, 'EXPLORATORY', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
             RETURNING id`,
            [
                suiteId, projectId, req.user.id, name.trim(), charter || '', timebox_minutes || null,
                plannedStart, plannedEnd, plannedEnd,
            ]
        );
        const runId = ins.rows[0].id;
        res.json({
            ok: true,
            run_id: runId,
            suite_id: suiteId,
            planned_start_at: plannedStart,
            planned_end_at: plannedEnd,
            deadline_at: plannedEnd,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/explorations/sessions/:runId/name ────────────────────────────────
// Renombra una sesión existente (permite corregir el nombre en cualquier estado).
router.put('/sessions/:runId/name', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        if (!runId) return res.status(400).json({ error: 'runId inválido' });

        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        if (name.length > 200) {
            return res.status(400).json({ error: 'El nombre no puede superar los 200 caracteres' });
        }

        const runRes = await query(
            `SELECT id FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });

        await query(`UPDATE qa_test_runs SET name = ? WHERE id = ?`, [name, runId]);
        res.json({ ok: true, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/explorations/sessions/:runId ─────────────────────────────────────
router.get('/sessions/:runId', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const runRes = await query(
            `SELECT r.*, u.name AS creator_name
               FROM qa_test_runs r
               LEFT JOIN qa_users u ON u.id = r.created_by
              WHERE r.id = ? AND r.run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];

        const extRes = await query(
            `SELECT e.id, e.field, e.previous_deadline, e.new_deadline, e.reason, e.created_at,
                    u.name AS created_by_name
               FROM qa_exploratory_extensions e
               LEFT JOIN qa_users u ON u.id = e.created_by
              WHERE e.run_id = ?
              ORDER BY e.id DESC`,
            [runId]
        );
        const extensions = extRes.rows;

        // Bloqueos por fuerza mayor (histórico completo; el último sin
        // `blocked_to` es el bloqueo activo).
        const blocksRes = await query(
            `SELECT b.id, b.blocked_from, b.blocked_to, b.reason, b.created_at,
                    c.name AS created_by_name, e.name AS ended_by_name
               FROM qa_exploratory_blocks b
               LEFT JOIN qa_users c ON c.id = b.created_by
               LEFT JOIN qa_users e ON e.id = b.ended_by
              WHERE b.run_id = ?
              ORDER BY b.id DESC`,
            [runId]
        );
        const blocks = blocksRes.rows;
        const activeBlock = blocks.find((block) => !block.blocked_to) || null;

        // Flujos = TCs vinculados a este run via qa_executions. La pertenencia se
        // deriva de la tabla de ejecuciones (no del project_id del TC) para que
        // cada sesión vea SOLO sus propios flujos, sin compartir con la suite
        // sintética "🧪 Exploratoria" que es global al proyecto.
        const flowsRes = await query(
            `SELECT DISTINCT tc.id, tc.title, tc.steps, tc.expected_result, tc.key_id, tc.created_at,
                    tc.assigned_to, tc.us_id,
                    us.key_id AS us_key, us.title AS us_title
               FROM qa_test_cases tc
               JOIN qa_executions e ON e.tc_id = tc.id
               LEFT JOIN qa_user_stories us ON us.id = tc.us_id
              WHERE e.run_id = ?
              ORDER BY tc.id ASC`,
            [runId]
        );
        const flows = flowsRes.rows;

        // Hallazgos creados dentro de la sesión (qa_defects sin ejecución,
        // vinculados por exploratory_run_id). Se listan aparte de los flujos.
        const hallazgosRes = await query(
            `SELECT d.id, d.title, d.description, d.severity, d.status, d.created_at,
                    d.steps_to_reproduce, d.expected_result, d.actual_result,
                    d.jira_key, d.jira_url, d.assigned_to, d.created_by,
                    reporter.name AS reporter_name,
                    assignee.name AS assignee_name
               FROM qa_defects d
               LEFT JOIN qa_users reporter ON reporter.id = d.created_by
               LEFT JOIN qa_users assignee ON assignee.id = d.assigned_to
              WHERE d.exploratory_run_id = ? AND d.execution_id IS NULL
              ORDER BY d.id ASC`,
            [runId]
        );
        const hallazgos = hallazgosRes.rows;

        if (flows.length === 0) {
            return res.json({ run, flows: [], executions: [], defects: [], attachments: [], hallazgos, extensions, blocks, active_block: activeBlock });
        }

        const flowIds = flows.map(f => f.id);

        // Ejecuciones del run actual (no históricas de otros runs).
        // db.js usa placeholders ? anónimos posicionales: runId va en [0],
        // los tc_id se expanden como ?, ?, ? y se concatenan al final.
        const execRes = await query(
            `SELECT id, tc_id, status, observations, obtained_result, executed_at, tester, tester_id
               FROM qa_executions
              WHERE run_id = ? AND tc_id IN (${flowIds.map(() => '?').join(',')})`,
            [runId, ...flowIds]
        );
        const executions = execRes.rows;

        const execIds = executions.map(e => e.id);
        let defects = [];
        let attachments = [];
        if (execIds.length > 0) {
            const defRes = await query(
                `SELECT id, execution_id, title, description, severity, status, jira_key, jira_url,
                        steps_to_reproduce, expected_result, actual_result, frequency,
                        business_impact, observations
                   FROM qa_defects
                  WHERE execution_id IN (${execIds.map(() => '?').join(',')})`,
                execIds
            );
            defects = defRes.rows;
            const attRes = await query(
                `SELECT id, execution_id, defect_id, file_name, mime_type, evidence_category, created_at
                   FROM qa_attachments
                  WHERE execution_id IN (${execIds.map(() => '?').join(',')})
                     OR defect_id IN (${defects.length > 0 ? defects.map(() => '?').join(',') : 'NULL'})`,
                [...execIds, ...defects.map(d => d.id)]
            );
            attachments = attRes.rows;
        }

        res.json({ run, flows, executions, defects, attachments, hallazgos, extensions, blocks, active_block: activeBlock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/sessions/:runId/flows ──────────────────────────────
router.post('/sessions/:runId/flows', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const { title, steps, expected_result, us_id } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'title requerido' });

        const runRes = await query(
            `SELECT id, project_id, suite_id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];
        if (run.status !== 'RUNNING') return res.status(400).json({ error: 'La sesión ya fue finalizada' });

        const suiteRes = await query(
            `SELECT id FROM qa_test_suites WHERE project_id = ? AND title = '🧪 Exploratoria' LIMIT 1`,
            [run.project_id]
        );
        let suiteId = suiteRes.rows[0]?.id;
        if (!suiteId) {
            // La sesión se creó con un suiteId válido, pero defensa extra
            const ensured = await ensureExploratoriaSuite(run.project_id, null, req.user.id);
            suiteId = ensured.suiteId;
        }

        const keyId = await generateTcKey(run.project_id);

        // Vinculación opcional con una HU del mismo proyecto. No crea
        // escenario ni modifica la HU: solo deja el TC asociado para agrupar
        // los flujos de la sesión.
        let usId = null;
        if (us_id !== undefined && us_id !== null && us_id !== '') {
            usId = parseInt(us_id, 10);
            if (!usId) return res.status(400).json({ error: 'us_id inválido' });
            const usRes = await query(
                `SELECT us.id
                   FROM qa_user_stories us
                   JOIN qa_use_cases uc ON uc.id = us.use_case_id
                  WHERE us.id = ? AND uc.project_id = ?`,
                [usId, run.project_id]
            );
            if (usRes.rows.length === 0) {
                return res.status(400).json({ error: 'La HU indicada no pertenece al proyecto' });
            }
        }

        const ins = await query(
            `INSERT INTO qa_test_cases
                (suite_id, title, steps, expected_result, is_exploratory, created_by, updated_by, key_id, project_id, priority, severity, us_id)
             VALUES (?, ?, ?, ?, true, ?, ?, ?, ?, 'Media', 'Media', ?)
             RETURNING id`,
            [suiteId, title.trim(), steps || '', expected_result || '', req.user.id, req.user.id, keyId, run.project_id, usId]
        );
        const tcId = ins.rows[0].id;

        // Vincular el TC a este run con una ejecución PENDING. Esto es lo que
        // permite que cada sesión vea SOLO sus propios flujos (la pertenencia
        // se deriva de qa_executions, no del project_id del TC).
        // Tester se asigna al ejecutar, no al crear.
        await query(
            `INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status, project_id, suite_id, executed_at)
             VALUES (?, ?, NULL, NULL, 'PENDING', ?, ?, CURRENT_TIMESTAMP)`,
            [tcId, runId, run.project_id, suiteId]
        );

        // Recalcular métricas de la sesión
        await query(`SELECT recalc_exploratory_metrics(?)`, [runId]);

        res.json({ ok: true, tc_id: tcId, key_id: keyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/flows/:tcId/execute ────────────────────────────────
// Crea qa_executions y (si status=FAIL) auto-crea qa_defects con execution_id.
// Replica la lógica de server.js:3417-3462 sin la restricción de active_run_id.
router.post('/flows/:tcId/execute', async (req, res) => {
    try {
        const tcId = parseInt(req.params.tcId, 10);
        const { status, observations, obtained_result, run_id, bugs } = req.body;

        if (!run_id) return res.status(400).json({ error: 'run_id requerido' });

        // Validar que el run es exploratorio y está RUNNING
        const runRes = await query(
            `SELECT id, project_id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [run_id]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        if (runRes.rows[0].status !== 'RUNNING') {
            return res.status(400).json({ error: 'La sesión ya fue finalizada' });
        }

        // Bloqueo activo por fuerza mayor: no se permiten ejecuciones hasta
        // finalizarlo (las fechas no se tocan automáticamente).
        const activeBlockRes = await query(
            `SELECT id, reason FROM qa_exploratory_blocks
              WHERE run_id = ? AND blocked_to IS NULL
              ORDER BY id DESC LIMIT 1`,
            [run_id]
        );
        if (activeBlockRes.rows.length > 0) {
            return res.status(400).json({
                error: 'La sesión está bloqueada. Finalizá el bloqueo para continuar.',
                active_block: activeBlockRes.rows[0],
            });
        }

        // Buscar o crear la ejecución
        const existing = await query(
            `SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`,
            [tcId, run_id]
        );

        let execId;
        let previousStatus = null;
        if (existing.rows.length > 0) {
            execId = existing.rows[0].id;
            // Si la ejecución era PENDING, asignar el tester correcto
            const existingExec = await query(`SELECT status, tester_id FROM qa_executions WHERE id = ?`, [execId]);
            previousStatus = existingExec.rows[0]?.status ?? null;
            let updateTester = '';
            let updateTesterId = null;
            if (existingExec.rows[0]?.status === 'PENDING' || !existingExec.rows[0]?.tester_id) {
                const tcRes = await query(`SELECT assigned_to FROM qa_test_cases WHERE id = ?`, [tcId]);
                const assignedTo = tcRes.rows[0]?.assigned_to;
                if (assignedTo) {
                    const assigneeRes = await query(`SELECT id, name FROM qa_users WHERE id = ?`, [assignedTo]);
                    if (assigneeRes.rows.length > 0) {
                        updateTester = assigneeRes.rows[0].name;
                        updateTesterId = assigneeRes.rows[0].id;
                    }
                }
                if (!updateTester) {
                    updateTester = req.user.name;
                    updateTesterId = req.user.id;
                }
            }

            if (updateTester) {
                await query(
                    `UPDATE qa_executions SET status = ?, observations = ?, obtained_result = ?, tester = ?, tester_id = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [status || 'PENDING', observations || '', obtained_result || '', updateTester, updateTesterId, execId]
                );
            } else {
                await query(
                    `UPDATE qa_executions SET status = ?, observations = ?, obtained_result = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [status || 'PENDING', observations || '', obtained_result || '', execId]
                );
            }
        } else {
            // Obtener assigned_to del test case para usar como tester real
            const tcRes = await query(`SELECT assigned_to FROM qa_test_cases WHERE id = ?`, [tcId]);
            const assignedTo = tcRes.rows[0]?.assigned_to;
            let testerName = req.user.name;
            let testerId = req.user.id;
            if (assignedTo) {
                const assigneeRes = await query(`SELECT id, name FROM qa_users WHERE id = ?`, [assignedTo]);
                if (assigneeRes.rows.length > 0) {
                    testerName = assigneeRes.rows[0].name;
                    testerId = assigneeRes.rows[0].id;
                }
            }

            const ins = await query(
                `INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status, observations, obtained_result, project_id, executed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id`,
                [tcId, run_id, testerName, testerId, status || 'PENDING', observations || '', obtained_result || '', runRes.rows[0].project_id]
            );
            execId = ins.rows[0].id;
        }

        // Trazabilidad temporal del estado del TC. El motivo se compone con
        // título+descripción (FAIL/WARNING) o la justificación (SKIP/BLOCK).
        try {
            const reason = buildStatusReason({ status: status || 'PENDING', observations, obtained: obtained_result, bugs });
            await recordStatusChange({
                projectId: runRes.rows[0].project_id,
                entityType: 'execution',
                entityId: execId,
                runId: run_id,
                tcId,
                fromStatus: previousStatus,
                toStatus: status || 'PENDING',
                reason,
                changedBy: req.user.id,
            });
        } catch (historyErr) {
            console.error('No se pudo registrar el histórico de estado:', historyErr.message);
        }

        // Si FAIL o WARNING, crear o ACTUALIZAR defectos.
        // - `b.id` permite editar un defecto ya reportado en esta ejecución.
        // - Si no hay id, se busca por título para no duplicar y se actualizan
        //   los detalles que el usuario completó después del primer guardado.
        const createdDefectIds = [];
        if ((status === 'FAIL' || status === 'WARNING') && Array.isArray(bugs) && bugs.length > 0) {
            const defectValues = (b) => [
                String(b.title).trim(),
                b.description || '',
                b.severity || 'Media',
                b.steps_to_reproduce || '',
                b.expected_result || '',
                b.actual_result || '',
                b.frequency || 'Siempre',
                b.business_impact || '',
                b.observations || '',
            ];
            const updateSql = `UPDATE qa_defects
                                  SET title = ?, description = ?, severity = ?,
                                      steps_to_reproduce = ?, expected_result = ?,
                                      actual_result = ?, frequency = ?, business_impact = ?,
                                      observations = ?
                                WHERE id = ? AND execution_id = ?`;

            for (const b of bugs) {
                if (!b || !b.title || !String(b.title).trim()) continue;
                const values = defectValues(b);

                if (b.id) {
                    const upd = await query(updateSql, [...values, b.id, execId]);
                    if (upd.changes > 0) {
                        createdDefectIds.push(b.id);
                        continue;
                    }
                }

                const dup = await query(
                    `SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`,
                    [execId, values[0]]
                );
                if (dup.rows.length > 0) {
                    await query(updateSql, [...values, dup.rows[0].id, execId]);
                    createdDefectIds.push(dup.rows[0].id);
                    continue;
                }

                const dIns = await query(
                    `INSERT INTO qa_defects
                        (execution_id, title, description, severity, steps_to_reproduce,
                         expected_result, actual_result, frequency, business_impact,
                         observations, status, project_id, suite_id, tc_id, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?) RETURNING id`,
                    [
                        execId,
                        ...values,
                        runRes.rows[0].project_id,
                        null,
                        tcId,
                        req.user.id
                    ]
                );
                createdDefectIds.push(dIns.rows[0].id);
            }
        }

        // Recalcular métricas de la sesión
        await query(`SELECT recalc_exploratory_metrics(?)`, [run_id]);

        res.json({ ok: true, execution_id: execId, defect_ids: createdDefectIds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/sessions/:runId/finish ─────────────────────────────
router.post('/sessions/:runId/finish', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const runRes = await query(
            `SELECT id, status, last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        if (runRes.rows[0].status === 'FINISHED') {
            return res.json({ ok: true, already_finished: true });
        }
        const run = runRes.rows[0];
        let finalSeconds = run.accumulated_seconds || 0;
        if (run.status === 'RUNNING' && run.last_resume_at) {
            const lastResume = new Date(run.last_resume_at);
            finalSeconds += Math.floor((new Date() - lastResume) / 1000);
        }
        await query(
            `UPDATE qa_test_runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP, accumulated_seconds = ? WHERE id = ?`,
            [finalSeconds, runId]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/flows/:tcId/evidence ───────────────────────────────
// Multipart: delega al endpoint /api/evidence existente. El frontend no usa este
// endpoint directamente — prefiere POST /api/evidence con FormData (más simple).
// Se deja documentado por simetría con la API de api.js pero no es necesario.

// ── POST /api/explorations/sessions/:runId/import-flows ──────────────────────
// Importa flujos exploratorios desde un archivo Excel (mismo formato que import-dual).
// Extrae solo: Escenario (title), Pasos (steps), Resultado Esperado (expected_result).
// Ignora el resto de columnas del archivo.
router.post('/sessions/:runId/import-flows', upload.single('xlsx'), async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);

        // Validar sesión
        const runRes = await query(
            `SELECT id, project_id, suite_id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];
        if (run.status !== 'RUNNING') return res.status(400).json({ error: 'La sesión ya fue finalizada' });

        // Validar archivo
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        // Leer Excel
        let workbook;
        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer' });
        } catch (e) {
            const content = file.buffer.toString('utf-8');
            workbook = XLSX.read(content, { type: 'string' });
        }

        // Obtener datos de la primera hoja
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length < 2) return res.status(400).json({ error: 'El archivo está vacío o no tiene datos' });

        // Helpers de normalización (mismo patrón que import-dual)
        const normalize = (str) => {
            if (!str) return '';
            return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };
        const tryFindColIndex = (headers, keywords) => {
            if (!headers || headers.length === 0) return -1;
            for (let i = 0; i < headers.length; i++) {
                const nh = normalize(headers[i]);
                if (keywords.every(k => nh.includes(k))) return i;
            }
            return -1;
        };
        const sanitizeInput = (val) => {
            if (val === null || val === undefined) return '';
            let s = String(val).trim();
            s = s.replace(/<[^>]*>/g, '');
            if (/^[=+\-@]/.test(s)) s = "'" + s;
            return s;
        };

        // Detectar columnas requeridas
        const headers = data[0];
        const colTitle = tryFindColIndex(headers, ['escenario']);
        const colSteps = tryFindColIndex(headers, ['paso']);
        const colExpected = tryFindColIndex(headers, ['resultado esperado']);

        if (colTitle === -1) {
            return res.status(400).json({
                error: 'Columna "Escenario" no encontrada',
                detalle: 'El archivo debe tener una columna que contenga "Escenario" para los títulos de los flujos'
            });
        }

        // Obtener suite sintética Exploratoria
        let suiteId = run.suite_id;
        if (!suiteId) {
            const suiteRes = await query(
                `SELECT id FROM qa_test_suites WHERE project_id = ? AND title = '🧪 Exploratoria' LIMIT 1`,
                [run.project_id]
            );
            suiteId = suiteRes.rows[0]?.id;
            if (!suiteId) {
                return res.status(400).json({ error: 'No se encontró la suite Exploratoria' });
            }
        }

        // Procesar filas y crear flujos
        let imported = 0;
        const errors = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const title = sanitizeInput(row[colTitle]);
            if (!title) continue; // Saltar filas sin título

            const steps = colSteps !== -1 ? sanitizeInput(row[colSteps]) : '';
            const expected = colExpected !== -1 ? sanitizeInput(row[colExpected]) : '';

            try {
                // Generar key_id para el flujo
                const seqRes = await query(
                    `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, 'TC', 1)
                     ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
                     RETURNING last_number`,
                    [run.project_id]
                );
                const lastNumber = seqRes.rows[0].last_number;
                const keyId = `TC-${String(lastNumber).padStart(3, '0')}`;

                // Crear test case exploratorio (assigned_to = usuario que importa)
                const tcRes = await query(
                    `INSERT INTO qa_test_cases
                        (suite_id, title, steps, expected_result, is_exploratory, created_by, updated_by, key_id, project_id, priority, severity, assigned_to)
                     VALUES (?, ?, ?, ?, true, ?, ?, ?, ?, 'Media', 'Media', ?)
                     RETURNING id`,
                    [suiteId, title, steps, expected, req.user.id, req.user.id, keyId, run.project_id, req.user.id]
                );
                const tcId = tcRes.rows[0].id;

                // Vincular al run con ejecución PENDING (tester se asigna al ejecutar)
                await query(
                    `INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status, project_id, suite_id, executed_at)
                     VALUES (?, ?, NULL, NULL, 'PENDING', ?, ?, CURRENT_TIMESTAMP)`,
                    [tcId, runId, run.project_id, suiteId]
                );

                imported++;
            } catch (rowErr) {
                errors.push(`Fila ${i + 1}: ${rowErr.message}`);
            }
        }

        // Recalcular métricas de la sesión tras importar
        if (imported > 0) {
            await query(`SELECT recalc_exploratory_metrics(?)`, [runId]);
        }

        res.json({
            ok: true,
            imported,
            total_rows: data.length - 1,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('Error en import-flows:', err);
        res.status(500).json({ error: err.message });
    }
});




// ── PUT /api/explorations/sessions/:runId/deadline ───────────────────────────
// Extiende la fecha límite de una sesión en curso y guarda la justificación.
router.put('/sessions/:runId/deadline', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const { deadline_at, reason } = req.body;
        if (!runId) return res.status(400).json({ error: 'runId inválido' });

        const runRes = await query(
            `SELECT id, status, deadline_at FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];
        if (run.status !== 'RUNNING') {
            return res.status(400).json({ error: 'La sesión ya fue finalizada' });
        }

        const newDeadline = deadline_at ? new Date(deadline_at) : null;
        if (!newDeadline || Number.isNaN(newDeadline.getTime())) {
            return res.status(400).json({ error: 'La nueva fecha límite es obligatoria' });
        }
        if (newDeadline.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'La nueva fecha límite debe ser futura' });
        }
        if (run.deadline_at && newDeadline.getTime() <= new Date(run.deadline_at).getTime()) {
            return res.status(400).json({ error: 'La nueva fecha debe ser posterior a la actual' });
        }
        const justification = String(reason || '').trim();
        if (justification.length < 5) {
            return res.status(400).json({ error: 'Justificá la demora (mínimo 5 caracteres)' });
        }

        const ins = await query(
            `INSERT INTO qa_exploratory_extensions (run_id, field, previous_deadline, new_deadline, reason, created_by)
             VALUES (?, 'deadline', ?, ?, ?, ?) RETURNING id`,
            [runId, run.deadline_at || null, newDeadline, justification, req.user.id]
        );
        await query(`UPDATE qa_test_runs SET deadline_at = ? WHERE id = ?`, [newDeadline, runId]);

        res.json({ ok: true, deadline_at: newDeadline, extension_id: ins.rows[0]?.id ?? ins.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/explorations/sessions/:runId/dates ──────────────────────────────
// Permite reprogramar la ventana planificada y/o la fecha límite vigente.
// Cada fecha modificada se guarda como una fila del histórico con su motivo.
router.put('/sessions/:runId/dates', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const { planned_start_at, planned_end_at, deadline_at, reason } = req.body;
        if (!runId) return res.status(400).json({ error: 'runId inválido' });

        const runRes = await query(
            `SELECT id, status, planned_start_at, planned_end_at, deadline_at
               FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];
        if (run.status !== 'RUNNING') {
            return res.status(400).json({ error: 'La sesión ya fue finalizada' });
        }

        const newStart = new Date(planned_start_at);
        const newEnd = new Date(planned_end_at);
        const newDeadline = new Date(deadline_at);
        if (Number.isNaN(newStart.getTime())) {
            return res.status(400).json({ error: 'El inicio planificado no es válido' });
        }
        if (Number.isNaN(newEnd.getTime())) {
            return res.status(400).json({ error: 'El fin planificado no es válido' });
        }
        if (newEnd.getTime() <= newStart.getTime()) {
            return res.status(400).json({ error: 'El fin planificado debe ser posterior al inicio planificado' });
        }
        if (Number.isNaN(newDeadline.getTime())) {
            return res.status(400).json({ error: 'La fecha límite no es válida' });
        }
        if (newDeadline.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'La fecha límite debe ser futura' });
        }

        const same = (a, b) => {
            if (!a && !b) return true;
            if (!a || !b) return false;
            return new Date(a).getTime() === new Date(b).getTime();
        };
        const changes = [];
        if (!same(run.planned_start_at, newStart)) changes.push(['planned_start', run.planned_start_at, newStart]);
        if (!same(run.planned_end_at, newEnd)) changes.push(['planned_end', run.planned_end_at, newEnd]);
        if (!same(run.deadline_at, newDeadline)) changes.push(['deadline', run.deadline_at, newDeadline]);

        if (changes.length === 0) {
            return res.status(400).json({ error: 'No hay cambios de fechas para registrar' });
        }
        const justification = String(reason || '').trim();
        if (justification.length < 5) {
            return res.status(400).json({ error: 'Justificá el cambio de fechas (mínimo 5 caracteres)' });
        }

        const insertedIds = [];
        for (const [field, previous, next] of changes) {
            const ins = await query(
                `INSERT INTO qa_exploratory_extensions (run_id, field, previous_deadline, new_deadline, reason, created_by)
                 VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
                [runId, field, previous || null, next, justification, req.user.id]
            );
            insertedIds.push(ins.rows[0]?.id ?? ins.lastID);
        }
        await query(
            `UPDATE qa_test_runs
                SET planned_start_at = ?, planned_end_at = ?, deadline_at = ?
              WHERE id = ?`,
            [newStart, newEnd, newDeadline, runId]
        );

        res.json({
            ok: true,
            planned_start_at: newStart,
            planned_end_at: newEnd,
            deadline_at: newDeadline,
            changed: changes.map(([field]) => field),
            change_ids: insertedIds,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/sessions/:runId/blocks ────────────────────────────
// Registra un bloqueo del testing por fuerza mayor. No modifica ninguna fecha:
// el bloqueo y la reprogramación son decisiones independientes y trazables.
router.post('/sessions/:runId/blocks', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const { reason, blocked_from } = req.body;
        if (!runId) return res.status(400).json({ error: 'runId inválido' });

        const runRes = await query(
            `SELECT id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        if (runRes.rows[0].status !== 'RUNNING') {
            return res.status(400).json({ error: 'La sesión ya fue finalizada' });
        }

        const activeRes = await query(
            `SELECT id FROM qa_exploratory_blocks WHERE run_id = ? AND blocked_to IS NULL`,
            [runId]
        );
        if (activeRes.rows.length > 0) {
            return res.status(400).json({ error: 'La sesión ya tiene un bloqueo activo' });
        }

        const from = blocked_from ? new Date(blocked_from) : new Date();
        if (Number.isNaN(from.getTime())) {
            return res.status(400).json({ error: 'La fecha de inicio del bloqueo no es válida' });
        }
        const justification = String(reason || '').trim();
        if (justification.length < 5) {
            return res.status(400).json({ error: 'Indicá el motivo del bloqueo (mínimo 5 caracteres)' });
        }

        const ins = await query(
            `INSERT INTO qa_exploratory_blocks (run_id, blocked_from, reason, created_by)
             VALUES (?, ?, ?, ?) RETURNING id`,
            [runId, from, justification, req.user.id]
        );
        res.json({ ok: true, block_id: ins.rows[0]?.id ?? ins.lastID, blocked_from: from });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/explorations/sessions/:runId/blocks/:blockId/end ────────────────
// Finaliza un bloqueo (retoma el testing) sin tocar las fechas de la sesión.
router.put('/sessions/:runId/blocks/:blockId/end', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const blockId = parseInt(req.params.blockId, 10);
        const { blocked_to } = req.body;
        if (!runId || !blockId) return res.status(400).json({ error: 'Parámetros inválidos' });

        const blockRes = await query(
            `SELECT id, blocked_from, blocked_to FROM qa_exploratory_blocks
              WHERE id = ? AND run_id = ?`,
            [blockId, runId]
        );
        if (blockRes.rows.length === 0) return res.status(404).json({ error: 'Bloqueo no encontrado' });
        const block = blockRes.rows[0];
        if (block.blocked_to) {
            return res.status(400).json({ error: 'El bloqueo ya está finalizado' });
        }

        const until = blocked_to ? new Date(blocked_to) : new Date();
        if (Number.isNaN(until.getTime())) {
            return res.status(400).json({ error: 'La fecha de fin del bloqueo no es válida' });
        }
        if (until.getTime() < new Date(block.blocked_from).getTime()) {
            return res.status(400).json({ error: 'El fin del bloqueo no puede ser anterior al inicio' });
        }

        await query(
            `UPDATE qa_exploratory_blocks
                SET blocked_to = ?, ended_by = ?
              WHERE id = ?`,
            [until, req.user.id, blockId]
        );
        res.json({ ok: true, block_id: blockId, blocked_to: until });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/explorations/sessions/:runId/coverage ───────────────────────────
// El tester declara que ya cargó los TC que cubren las validaciones
// funcionales y de negocio. Si no está activo, los reportes muestran alerta.
router.put('/sessions/:runId/coverage', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        if (!runId) return res.status(400).json({ error: 'runId inválido' });
        const ready = req.body.ready === true || req.body.ready === 'true' || req.body.ready === 1;

        const runRes = await query(
            `SELECT id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });

        if (ready) {
            const flows = await query(`SELECT count(*)::int AS n FROM qa_executions WHERE run_id = ?`, [runId]);
            if (flows.rows[0].n === 0) {
                return res.status(400).json({
                    error: 'Cargá al menos un flujo/TC antes de declarar la cobertura',
                });
            }
        }

        await query(
            `UPDATE qa_test_runs
                SET coverage_ready = ?,
                    coverage_ready_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
                    coverage_ready_by = CASE WHEN ? THEN ? ELSE NULL END
              WHERE id = ?`,
            [ready, ready, ready, req.user.id, runId]
        );

        res.json({ ok: true, coverage_ready: ready });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/explorations/sessions/:runId ─────────────────────────────────
// Elimina la sesión completa: ejecuciones, defectos, hallazgos, evidencias
// (filas; los archivos locales NO se borran) y los flujos creados para ella.
// El borrado en cascada de la DB cubre hijos; acá limpiamos los TC huérfanos.
router.delete('/sessions/:runId', requireAdmin, async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        if (!runId) return res.status(400).json({ error: 'runId inválido' });

        const runRes = await query(
            `SELECT id, project_id, status FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];

        const execRes = await query(`SELECT id, tc_id FROM qa_executions WHERE run_id = ?`, [runId]);
        const execIds = execRes.rows.map((row) => row.id);
        const tcIds = [...new Set(execRes.rows.map((row) => row.tc_id))];

        const hallazgoRes = await query(
            `SELECT id FROM qa_defects WHERE exploratory_run_id = ? AND execution_id IS NULL`,
            [runId]
        );
        const defectIds = execIds.length === 0 ? [] : (await query(
            `SELECT id FROM qa_defects WHERE execution_id IN (${execIds.map(() => '?').join(',')})`,
            execIds
        )).rows.map((row) => row.id);

        // Adjuntos antes del borrado (para limpiar el índice SQLite local).
        const attachmentIds = [];
        if (execIds.length > 0 || defectIds.length > 0) {
            const attRes = await query(
                `SELECT id FROM qa_attachments
                  WHERE execution_id IN (${execIds.map(() => '?').join(',') || 'NULL'})
                     OR defect_id IN (${defectIds.map(() => '?').join(',') || 'NULL'})`,
                [...execIds, ...defectIds]
            );
            attachmentIds.push(...attRes.rows.map((row) => row.id));
        }

        // Borra el run: cascada sobre executions, defects (por execution_id),
        // hallazgos (por exploratory_run_id) y attachments.
        await query(`DELETE FROM qa_test_runs WHERE id = ?`, [runId]);

        // Flujos creados para la sesión: solo se borran si quedaron sin
        // ejecuciones y siguen marcados como exploratorios del mismo proyecto.
        let deletedTestCases = 0;
        for (const tcId of tcIds) {
            const orphan = await query(
                `SELECT tc.id
                   FROM qa_test_cases tc
                  WHERE tc.id = ? AND tc.is_exploratory = true AND tc.project_id = ?
                    AND NOT EXISTS (SELECT 1 FROM qa_executions e WHERE e.tc_id = tc.id)`,
                [tcId, run.project_id]
            );
            if (orphan.rows.length === 0) continue;
            await query(`DELETE FROM qa_test_cases WHERE id = ?`, [tcId]);
            deletedTestCases += 1;
        }

        // Índice local de evidencias (best-effort). Los archivos quedan en disco.
        try {
            const evidenceStore = require('../../modules/evidence-store');
            for (const id of attachmentIds) evidenceStore.deleteIndex(id);
        } catch (_) { /* best-effort */ }

        res.json({
            ok: true,
            deleted: {
                sessions: 1,
                executions: execIds.length,
                defects: defectIds.length,
                hallazgos: hallazgoRes.rows.length,
                test_cases: deletedTestCases,
                attachments: attachmentIds.length,
            },
        });
    } catch (err) {
        console.error('Error eliminando sesión exploratoria:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/explorations/sessions/:runId/bugs-report ────────────────────────
// Genera HTML con tests en FAIL/WARNING y sus defectos asociados
router.get('/sessions/:runId/bugs-report', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        if (!runId) return res.status(400).json({ error: 'runId inválido' });
        const testerId = req.query.tester_id ? parseInt(req.query.tester_id, 10) : null;
        const testerName = req.query.tester ? String(req.query.tester) : null;

        const data = await buildBugsReportData({ runId, testerId, testerName });
        res.setHeader('Content-Type', 'text/html');
        res.send(renderBugsReport(data));
    } catch (err) {
        console.error('Error en bugs-report:', err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ── Reporte de estatus de Exploratoria ───────────────────────────────────────
// Refleja todo el trabajo del tester (o de todos) en un rango de fechas:
// ejecuciones de flujos + defectos + hallazgos, con evidencias presentes.
const REPORT_TZ = 'America/Argentina/Buenos_Aires';

function reportToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: REPORT_TZ });
}

function reportDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('en-CA', { timeZone: REPORT_TZ });
}

function reportRange(query) {
    const from = query.date_from || reportDaysAgo(7);
    const to = query.date_to || reportToday();
    return { from, to };
}

// GET /api/explorations/reports/status/testers?project_id=&date_from=&date_to=
// Testers con actividad (ejecuciones y hallazgos) en el rango, para el modal.
router.get('/reports/status/testers', async (req, res) => {
    try {
        const projectId = parseInt(req.query.project_id, 10);
        if (!projectId) return res.status(400).json({ error: 'project_id requerido' });
        const { from, to } = reportRange(req.query);

        const execRows = await query(`
            SELECT e.tester_id AS id, COALESCE(e.tester, 'Sin tester') AS name, COUNT(*)::int AS count
              FROM qa_executions e
              JOIN qa_test_runs r ON e.run_id = r.id
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND e.status <> 'PENDING'
               AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
             GROUP BY e.tester_id, e.tester
        `, [projectId, from, to]);

        const hallazgoRows = await query(`
            SELECT d.created_by AS id, COALESCE(u.name, 'Sin tester') AS name, COUNT(*)::int AS count
              FROM qa_defects d
              JOIN qa_test_runs r ON d.exploratory_run_id = r.id
              LEFT JOIN qa_users u ON u.id = d.created_by
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND d.execution_id IS NULL
               AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
             GROUP BY d.created_by, u.name
        `, [projectId, from, to]);

        const merged = new Map();
        for (const row of [...execRows.rows, ...hallazgoRows.rows]) {
            const key = row.id ? `id:${row.id}` : `name:${String(row.name).toLowerCase()}`;
            const current = merged.get(key);
            if (current) current.count += row.count;
            else merged.set(key, { id: row.id || null, name: row.name, count: row.count });
        }

        const testers = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
        res.json({ testers, date_from: from, date_to: to });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/explorations/reports/status?project_id=&date_from=&date_to=&tester_id=&tester=
router.get('/reports/status', async (req, res) => {
    try {
        const projectId = parseInt(req.query.project_id, 10);
        if (!projectId) return res.status(400).json({ error: 'project_id requerido' });
        const { from, to } = reportRange(req.query);
        const testerId = req.query.tester_id ? parseInt(req.query.tester_id, 10) : null;
        const testerName = req.query.tester ? String(req.query.tester) : null;

        const data = await buildStatusReportData({ projectId, from, to, testerId, testerName });
        res.setHeader('Content-Type', 'text/html');
        res.send(renderStatusReport(data));
    } catch (err) {
        console.error('Error en reports/status:', err);
        res.status(err.status || 500).json({ error: err.message });
    }
});


module.exports = router;
