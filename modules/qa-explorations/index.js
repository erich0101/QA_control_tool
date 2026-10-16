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
                    r.skip_count, r.pending_count
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
        const { name, charter, timebox_minutes, use_case_id } = req.body;
        const projectId = req.body.project_id;
        if (!projectId) return res.status(400).json({ error: 'project_id requerido' });
        if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });

        const { suiteId } = await ensureExploratoriaSuite(projectId, use_case_id, req.user.id);

        const ins = await query(
            `INSERT INTO qa_test_runs
                (suite_id, project_id, status, created_by, run_type, name, charter, timebox_minutes, last_resume_at, accumulated_seconds)
             VALUES (?, ?, 'RUNNING', ?, 'EXPLORATORY', ?, ?, ?, CURRENT_TIMESTAMP, 0)
             RETURNING id`,
            [suiteId, projectId, req.user.id, name.trim(), charter || '', timebox_minutes || null]
        );
        const runId = ins.rows[0].id;
        res.json({ ok: true, run_id: runId, suite_id: suiteId });
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

        // Flujos = TCs vinculados a este run via qa_executions. La pertenencia se
        // deriva de la tabla de ejecuciones (no del project_id del TC) para que
        // cada sesión vea SOLO sus propios flujos, sin compartir con la suite
        // sintética "🧪 Exploratoria" que es global al proyecto.
        const flowsRes = await query(
            `SELECT DISTINCT tc.id, tc.title, tc.steps, tc.expected_result, tc.key_id, tc.created_at, tc.assigned_to
               FROM qa_test_cases tc
               JOIN qa_executions e ON e.tc_id = tc.id
              WHERE e.run_id = ?
              ORDER BY tc.id ASC`,
            [runId]
        );
        const flows = flowsRes.rows;

        if (flows.length === 0) {
            return res.json({ run, flows: [], executions: [], defects: [], attachments: [] });
        }

        const flowIds = flows.map(f => f.id);

        // Ejecuciones del run actual (no históricas de otros runs).
        // db.js usa placeholders ? anónimos posicionales: runId va en [0],
        // los tc_id se expanden como ?, ?, ? y se concatenan al final.
        const execRes = await query(
            `SELECT id, tc_id, status, observations, obtained_result, executed_at, tester
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
                `SELECT id, execution_id, title, description, severity, status, jira_key
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

        res.json({ run, flows, executions, defects, attachments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/explorations/sessions/:runId/flows ──────────────────────────────
router.post('/sessions/:runId/flows', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const { title, steps, expected_result } = req.body;
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

        const ins = await query(
            `INSERT INTO qa_test_cases
                (suite_id, title, steps, expected_result, is_exploratory, created_by, updated_by, key_id, project_id, priority, severity)
             VALUES (?, ?, ?, ?, true, ?, ?, ?, ?, 'Media', 'Media')
             RETURNING id`,
            [suiteId, title.trim(), steps || '', expected_result || '', req.user.id, req.user.id, keyId, run.project_id]
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

        // Buscar o crear la ejecución
        const existing = await query(
            `SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`,
            [tcId, run_id]
        );

        let execId;
        if (existing.rows.length > 0) {
            execId = existing.rows[0].id;
            // Si la ejecución era PENDING, asignar el tester correcto
            const existingExec = await query(`SELECT status, tester_id FROM qa_executions WHERE id = ?`, [execId]);
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

        // Si FAIL o WARNING, crear defectos
        const createdDefectIds = [];
        if ((status === 'FAIL' || status === 'WARNING') && Array.isArray(bugs) && bugs.length > 0) {
            for (const b of bugs) {
                if (!b || !b.title || !String(b.title).trim()) continue;
                // Evitar duplicados exactos en la misma ejecución
                const dup = await query(
                    `SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`,
                    [execId, b.title]
                );
                if (dup.rows.length > 0) {
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
                        b.title,
                        b.description || '',
                        b.severity || 'Media',
                        b.steps_to_reproduce || '',
                        b.expected_result || '',
                        b.actual_result || '',
                        b.frequency || 'Siempre',
                        b.business_impact || '',
                        b.observations || '',
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

// ── DELETE /api/explorations/sessions/:runId ─────────────────────────────────
// Borra una sesión de Exploratoria y todos sus datos asociados (cascade via
// FK). Usado por scripts de limpieza; no expuesto en la UI normal.
router.delete('/sessions/:runId', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);
        const runRes = await query(
            `SELECT id FROM qa_test_runs WHERE id = ? AND run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        // Cascade via FK:
        //   qa_executions (run_id ON DELETE CASCADE)
        //   qa_attachments (execution_id ON DELETE CASCADE)
        //   qa_defects (execution_id FK, queda huérfano pero permitido)
        //   qa_hallazgo_bug, qa_hallazgo_tc (defect_id ON DELETE CASCADE si el defect se borra)
        await query(`DELETE FROM qa_test_runs WHERE id = ?`, [runId]);
        res.json({ ok: true, deleted_id: runId });
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

// ── GET /api/explorations/sessions/:runId/bugs-report ────────────────────────
// Genera HTML con tests en FAIL/WARNING y sus defectos asociados
router.get('/sessions/:runId/bugs-report', async (req, res) => {
    try {
        const runId = parseInt(req.params.runId, 10);

        const runRes = await query(
            `SELECT r.id, r.name, r.charter, r.timebox_minutes, r.started_at, r.finished_at, r.status,
                    p.name as project_name, u.name as creator_name
             FROM qa_test_runs r
             JOIN qa_projects p ON r.project_id = p.id
             LEFT JOIN qa_users u ON r.created_by = u.id
             WHERE r.id = ? AND r.run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];

        const execs = await query(`
            SELECT e.id, e.status, e.obtained_result, e.observations, e.executed_at, e.tester,
                   tc.title as tc_title, tc.steps, tc.expected_result, tc.key_id
            FROM qa_executions e
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            WHERE e.run_id = ? AND e.status IN ('FAIL', 'WARNING', 'BLOCK')
            ORDER BY e.executed_at DESC
        `, [runId]);

        const defects = await query(`
            SELECT d.id, d.title, d.description, d.severity, d.status, d.actual_result,
                   d.steps_to_reproduce, d.expected_result, d.jira_key, d.execution_id
            FROM qa_defects d
            WHERE d.execution_id IN (${execs.rows.map(e => e.id).join(',') || '0'})
            ORDER BY d.severity DESC, d.id DESC
        `);

        const attachments = await query(`
            SELECT a.id, a.execution_id, a.defect_id
            FROM qa_attachments a
            WHERE a.execution_id IN (${execs.rows.map(e => e.id).join(',') || '0'})
               OR a.defect_id IN (${defects.rows.map(d => d.id).join(',') || '0'})
        `);

        const sharp = require('sharp');
        const fs = require('fs');
        const evidenceStore = require('../../modules/evidence-store');

        async function getEvidenceBase64(attId) {
            try {
                const r = await query(`SELECT mime_type, storage_kind, storage_path, file_data FROM qa_attachments WHERE id = ?`, [attId]);
                if (r.rows.length === 0) return null;
                const row = r.rows[0];
                let buffer;
                if (row.storage_kind === 'legacy_pg' || !row.storage_kind || !row.storage_path) {
                    if (!row.file_data) return null;
                    buffer = Buffer.from(row.file_data, 'base64');
                } else {
                    const abs = evidenceStore.absolutePath(row.storage_path);
                    if (!fs.existsSync(abs)) return null;
                    buffer = fs.readFileSync(abs);
                }
                const isVideo = (row.mime_type || '').startsWith('video/');
                if (isVideo) {
                    return { type: 'video', mime: row.mime_type, data: `data:${row.mime_type};base64,${buffer.toString('base64')}` };
                }
                const compressed = await sharp(buffer).resize(800, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer();
                return { type: 'image', mime: 'image/jpeg', data: `data:image/jpeg;base64,${compressed.toString('base64')}` };
            } catch (e) { return null; }
        }

        function evidenceHTML(ev, maxWidth = 200) {
            if (!ev) return '';
            if (ev.type === 'video') {
                return `<video src="${ev.data}" controls preload="none" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer;" title="Click para reproducir"></video>`;
            }
            return `<img src="${ev.data}" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer; transition:transform 0.2s;" onclick="openLightbox(this.src)" onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'" title="Click para ampliar">`;
        }

        function lightboxHTML() {
            return `
                <div id="lightbox" onclick="closeLightbox()" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; cursor:pointer; align-items:center; justify-content:center;">
                    <img id="lightbox-img" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px;">
                    <button onclick="closeLightbox()" style="position:absolute; top:20px; right:20px; background:white; border:none; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer; font-weight:700;">✕</button>
                </div>
                <script>
                    function openLightbox(src) {
                        document.getElementById('lightbox-img').src = src;
                        document.getElementById('lightbox').style.display = 'flex';
                    }
                    function closeLightbox() {
                        document.getElementById('lightbox').style.display = 'none';
                        document.getElementById('lightbox-img').src = '';
                    }
                    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
                </script>
            `;
        }

        const evidByExec = {};
        const evidByDef = {};
        for (const a of attachments.rows) {
            const ev = await getEvidenceBase64(a.id);
            if (ev) {
                if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(ev); }
                if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(ev); }
            }
        }

        const defectsByExec = {};
        for (const d of defects.rows) {
            defectsByExec[d.execution_id] = defectsByExec[d.execution_id] || [];
            defectsByExec[d.execution_id].push(d);
        }

        let execsHTML = '';
        for (const e of execs.rows) {
            const execDefects = defectsByExec[e.id] || [];
            const evidHTML = (evidByExec[e.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
            const defectsHTML = execDefects.map(d => {
                const defEvid = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
                return `
                    <div style="padding:8px 10px; background:rgba(255,59,48,0.04); border-radius:6px; margin-top:6px;">
                        <div style="font-weight:700; font-size:0.8rem; color:var(--apple-label);">${escapeHTML(d.title)}</div>
                        <div style="font-size:0.72rem; color:var(--apple-label-secondary); margin-top:2px;">Severidad: ${escapeHTML(d.severity)} | Estado: ${escapeHTML(d.status)} ${d.jira_key ? '| Jira: ' + escapeHTML(d.jira_key) : ''}</div>
                        ${d.actual_result ? `<div style="font-size:0.75rem; margin-top:4px;"><strong>Resultado actual:</strong> ${escapeHTML(d.actual_result)}</div>` : ''}
                        ${defEvid ? `<div style="margin-top:4px;">${defEvid}</div>` : ''}
                    </div>
                `;
            }).join('');

            execsHTML += `
                <div style="padding:14px; background:white; border-radius:8px; margin-bottom:12px; border-left:4px solid ${e.status === 'FAIL' ? '#dc2626' : e.status === 'WARNING' ? '#d97706' : '#f59e0b'}; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                        <div style="font-weight:700; font-size:0.85rem;">${escapeHTML(e.key_id || '')} - ${escapeHTML(e.tc_title || 'Sin título')}</div>
                        <span style="padding:2px 8px; border-radius:4px; font-size:0.65rem; font-weight:700; background:${e.status === 'FAIL' ? '#fee2e2' : '#fef3c7'}; color:${e.status === 'FAIL' ? '#dc2626' : '#d97706'};">${e.status}</span>
                    </div>
                    <div style="font-size:0.72rem; color:var(--apple-label-secondary); margin-bottom:4px;">Tester: ${escapeHTML(e.tester || '—')} | Fecha: ${e.executed_at ? new Date(e.executed_at).toLocaleString('es-AR') : '—'}</div>
                    ${e.steps ? `<div style="font-size:0.75rem; margin-top:4px;"><strong>Pasos:</strong> ${escapeHTML(e.steps)}</div>` : ''}
                    ${e.expected_result ? `<div style="font-size:0.75rem; margin-top:2px;"><strong>Esperado:</strong> ${escapeHTML(e.expected_result)}</div>` : ''}
                    ${e.obtained_result ? `<div style="font-size:0.75rem; margin-top:2px;"><strong>Obtenido:</strong> ${escapeHTML(e.obtained_result)}</div>` : ''}
                    ${evidHTML ? `<div style="margin-top:6px;">${evidHTML}</div>` : ''}
                    ${execDefects.length > 0 ? `<div style="margin-top:8px;"><div style="font-size:0.7rem; font-weight:700; color:var(--apple-label-tertiary); text-transform:uppercase;">Defectos (${execDefects.length})</div>${defectsHTML}</div>` : ''}
                </div>
            `;
        }

        function escapeHTML(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte Bugs - Sesión #${run.id}</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;border-radius:12px;padding:24px;margin-bottom:24px}
        .header h1{margin:0 0 4px;font-size:1.3rem}.header p{margin:0;opacity:.9;font-size:.85rem}
        .kpi{background:white;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi-val{font-size:1.4rem;font-weight:700}.kpi-lab{font-size:.65rem;color:#6b7280;text-transform:uppercase}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.75rem}
        @media print{body{background:white;padding:0}}</style></head><body>
        <div class="header">
            <h1>Reporte de Bugs - Sesión #${run.id}</h1>
            <p>${escapeHTML(run.name || 'Exploratoria')} | ${escapeHTML(run.project_name)} | Tester: ${escapeHTML(run.creator_name || '—')}</p>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div class="kpi"><div class="kpi-val">${execs.rows.length}</div><div class="kpi-lab">Tests con Issues</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='FAIL').length}</div><div class="kpi-lab">FAIL</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='WARNING').length}</div><div class="kpi-lab">WARNING</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='BLOCK').length}</div><div class="kpi-lab">BLOCK</div></div>
            <div class="kpi"><div class="kpi-val">${defects.rows.length}</div><div class="kpi-lab">Defectos</div></div>
        </div>
        ${execsHTML || '<div style="text-align:center;padding:40px;color:#6b7280;">Sin tests con problemas en esta sesión</div>'}
        <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR')}</div>
        ${lightboxHTML()}
        </body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error('Error en bugs-report:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
