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
const { getEvidenceBase64, evidenceHTML, lightboxHTML } = require('../../src/lib/report-evidence');

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
                    r.skip_count, r.pending_count, r.coverage_ready,
                    (SELECT COUNT(*) FROM qa_defects d
                      WHERE d.exploratory_run_id = r.id AND d.execution_id IS NULL) AS hallazgo_count
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
            return res.json({ run, flows: [], executions: [], defects: [], attachments: [], hallazgos });
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
                `SELECT id, execution_id, title, description, severity, status, jira_key, jira_url
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

        res.json({ run, flows, executions, defects, attachments, hallazgos });
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

        const runRes = await query(
            `SELECT r.id, r.name, r.charter, r.timebox_minutes, r.started_at, r.finished_at, r.status,
                    r.coverage_ready,
                    p.name as project_name, u.name as creator_name
             FROM qa_test_runs r
             JOIN qa_projects p ON r.project_id = p.id
             LEFT JOIN qa_users u ON r.created_by = u.id
             WHERE r.id = ? AND r.run_type = 'EXPLORATORY'`,
            [runId]
        );
        if (runRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const run = runRes.rows[0];

        // Filtro opcional por tester (id y/o nombre). Se usa `tester_id`
        // cuando existe y el nombre como respaldo para datos viejos.
        const testerId = req.query.tester_id ? parseInt(req.query.tester_id, 10) : null;
        const testerName = req.query.tester ? String(req.query.tester) : null;
        let testerFilter = '';
        const execParams = [runId];
        if (testerId && testerName) {
            testerFilter = 'AND (e.tester_id = ? OR e.tester = ?)';
            execParams.push(testerId, testerName);
        } else if (testerId) {
            testerFilter = 'AND e.tester_id = ?';
            execParams.push(testerId);
        } else if (testerName) {
            testerFilter = 'AND e.tester = ?';
            execParams.push(testerName);
        }

        const execs = await query(`
            SELECT e.id, e.status, e.obtained_result, e.observations, e.executed_at, e.tester, e.tester_id,
                   tc.title as tc_title, tc.steps, tc.expected_result, tc.key_id
            FROM qa_executions e
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            WHERE e.run_id = ? AND e.status IN ('FAIL', 'WARNING', 'BLOCK') ${testerFilter}
            ORDER BY e.executed_at DESC
        `, execParams);

        const defects = await query(`
            SELECT d.id, d.title, d.description, d.severity, d.status, d.actual_result,
                   d.steps_to_reproduce, d.expected_result, d.jira_key, d.jira_url, d.execution_id
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

        const evidByExec = {};
        const evidByDef = {};
        let omittedEvidence = 0;
        for (const a of attachments.rows) {
            // Si el archivo no está en esta máquina y no hay copia en PG, se
            // omite (el reporte sigue generándose).
            const ev = await getEvidenceBase64(a.id);
            if (ev) {
                if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(ev); }
                if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(ev); }
            } else {
                omittedEvidence += 1;
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
                        <div style="font-size:0.72rem; color:var(--apple-label-secondary); margin-top:2px;">Severidad: ${escapeHTML(d.severity)} | Estado: ${escapeHTML(d.status)} ${d.jira_key ? '| Jira: ' + (d.jira_url ? `<a href="${escapeHTML(d.jira_url)}" target="_blank" rel="noopener" style="color:#2563eb; font-weight:600; text-decoration:none;">${escapeHTML(d.jira_key)} ↗</a>` : escapeHTML(d.jira_key)) : ''}</div>
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
            <p>${escapeHTML(run.name || 'Exploratoria')} | ${escapeHTML(run.project_name)} | Tester: ${escapeHTML(testerName || 'Todos')}</p>
        </div>
        ${run.coverage_ready ? '' : `<div style="background:#fffbeb;border:1px solid #f59e0b;border-left:5px solid #d97706;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:.76rem;color:#92400e;"><strong>⚠ Cobertura de TC no declarada.</strong> Esta sesión no tiene marcados los TC funcionales/negocio; el reporte refleja hallazgos, no aceptación del regresivo.</div>`}
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div class="kpi"><div class="kpi-val">${execs.rows.length}</div><div class="kpi-lab">Tests con Issues</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='FAIL').length}</div><div class="kpi-lab">FAIL</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='WARNING').length}</div><div class="kpi-lab">WARNING</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.filter(e=>e.status==='BLOCK').length}</div><div class="kpi-lab">BLOCK</div></div>
            <div class="kpi"><div class="kpi-val">${defects.rows.length}</div><div class="kpi-lab">Defectos</div></div>
        </div>
        ${execsHTML || '<div style="text-align:center;padding:40px;color:#6b7280;">Sin tests con problemas en esta sesión</div>'}
        ${omittedEvidence > 0 ? `<div style="text-align:center;padding:8px;color:#b45309;font-size:.72rem;">${omittedEvidence} evidencia(s) no disponible(s) en esta máquina: se omitieron del reporte.</div>` : ''}
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

function htmlEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtReportDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-AR', { timeZone: REPORT_TZ });
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

        const projectRes = await query(`SELECT id, name FROM qa_projects WHERE id = ?`, [projectId]);
        if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
        const project = projectRes.rows[0];

        // Ejecuciones del rango (se excluyen PENDING: no representan trabajo hecho).
        let execFilter = '';
        const execParams = [projectId, from, to];
        if (testerId && testerName) {
            execFilter = 'AND (e.tester_id = ? OR e.tester = ?)';
            execParams.push(testerId, testerName);
        } else if (testerId) {
            execFilter = 'AND e.tester_id = ?';
            execParams.push(testerId);
        } else if (testerName) {
            execFilter = 'AND e.tester = ?';
            execParams.push(testerName);
        }

        const execs = await query(`
            SELECT e.id, e.status, e.observations, e.obtained_result, e.executed_at,
                   e.tester, e.tester_id,
                   tc.id AS tc_id, tc.title AS tc_title, tc.key_id,
                   r.id AS run_id, r.name AS run_name
              FROM qa_executions e
              JOIN qa_test_cases tc ON e.tc_id = tc.id
              JOIN qa_test_runs r ON e.run_id = r.id
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND e.status <> 'PENDING'
               AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${execFilter}
             ORDER BY e.executed_at ASC
        `, execParams);

        const defects = execs.rows.length === 0 ? { rows: [] } : await query(`
            SELECT d.id, d.execution_id, d.title, d.severity, d.status, d.actual_result,
                   d.jira_key, d.jira_url
              FROM qa_defects d
             WHERE d.execution_id IN (${execs.rows.map(() => '?').join(',')})
             ORDER BY d.id
        `, execs.rows.map(e => e.id));

        // Hallazgos creados en sesiones exploratorias dentro del rango.
        let hallazgoFilter = '';
        const hallazgoParams = [projectId, from, to];
        if (testerId) {
            hallazgoFilter = 'AND d.created_by = ?';
            hallazgoParams.push(testerId);
        } else if (testerName) {
            hallazgoFilter = 'AND rep.name = ?';
            hallazgoParams.push(testerName);
        }

        const hallazgos = await query(`
            SELECT d.id, d.title, d.severity, d.status, d.created_at, d.exploratory_run_id,
                   COALESCE(rep.name, 'Sin tester') AS reporter_name
              FROM qa_defects d
              JOIN qa_test_runs r ON d.exploratory_run_id = r.id
              LEFT JOIN qa_users rep ON rep.id = d.created_by
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND d.execution_id IS NULL
               AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${hallazgoFilter}
             ORDER BY d.created_at ASC
        `, hallazgoParams);

        const runIds = [...new Set([
            ...execs.rows.map(e => e.run_id),
            ...hallazgos.rows.map(h => h.exploratory_run_id),
        ])];
        const runsRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT id, name, charter, started_at, finished_at, status, coverage_ready
              FROM qa_test_runs WHERE id IN (${runIds.map(() => '?').join(',')})
        `, runIds);
        const runsById = new Map(runsRes.rows.map(r => [r.id, r]));
        const uncoveredRuns = [...runsById.values()].filter(r => !r.coverage_ready);
        const coveredCount = runsById.size - uncoveredRuns.length;
        const coverageAlertHTML = uncoveredRuns.length === 0 ? '' : `
            <div style="background:#fffbeb;border:1px solid #f59e0b;border-left:5px solid #d97706;border-radius:8px;padding:12px 14px;margin-bottom:16px;">
                <div style="font-weight:800;color:#b45309;font-size:.85rem;">⚠ Cobertura de TC no declarada</div>
                <div style="font-size:.74rem;color:#92400e;margin-top:3px;">
                    ${uncoveredRuns.length} de ${runsById.size} sesión(es) no tienen marcados los TC de cobertura funcional/negocio.
                    Los resultados reflejan ejecución, no aceptación del regresivo.
                </div>
                <div style="font-size:.7rem;color:#92400e;margin-top:3px;">Sesiones: ${uncoveredRuns.map(r => '#' + r.id).join(', ')}</div>
            </div>`;

        const defectIds = defects.rows.map(d => d.id);
        const attachments = (execs.rows.length === 0 && defectIds.length === 0) ? { rows: [] } : await query(`
            SELECT id, execution_id, defect_id
              FROM qa_attachments
             WHERE execution_id IN (${execs.rows.map(() => '?').join(',') || 'NULL'})
                OR defect_id IN (${defectIds.map(() => '?').join(',') || 'NULL'})
        `, [...execs.rows.map(e => e.id), ...defectIds]);

        const evidByExec = {};
        const evidByDef = {};
        let omittedEvidence = 0;
        for (const a of attachments.rows) {
            const ev = await getEvidenceBase64(a.id);
            if (!ev) { omittedEvidence += 1; continue; }
            if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(ev); }
            if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(ev); }
        }

        const defectsByExec = new Map();
        for (const d of defects.rows) {
            if (!defectsByExec.has(d.execution_id)) defectsByExec.set(d.execution_id, []);
            defectsByExec.get(d.execution_id).push(d);
        }

        const STATUS_STYLE = {
            OK: { bg: '#dcfce7', fg: '#15803d', chart: '#16a34a' },
            FAIL: { bg: '#fee2e2', fg: '#dc2626', chart: '#dc2626' },
            WARNING: { bg: '#fef3c7', fg: '#b45309', chart: '#d97706' },
            BLOCK: { bg: '#fff7ed', fg: '#c2410c', chart: '#f97316' },
            SKIP: { bg: '#e5e7eb', fg: '#4b5563', chart: '#94a3b8' },
        };
        const STATUS_ORDER = ['FAIL', 'WARNING', 'BLOCK', 'SKIP', 'OK'];

        const counts = { OK: 0, FAIL: 0, WARNING: 0, BLOCK: 0, SKIP: 0 };
        for (const e of execs.rows) {
            if (counts[e.status] !== undefined) counts[e.status] += 1;
        }
        const totalTests = execs.rows.length;
        // Aceptación estricta: OK / (OK + FAIL + WARNING). BLOCK y SKIP no se
        // evaluaron y quedan fuera del denominador (igual que PENDIENTE).
        const evaluables = counts.OK + counts.FAIL + counts.WARNING;
        const acceptancePct = evaluables > 0 ? Math.round((counts.OK / evaluables) * 100) : null;

        const execByRun = new Map();
        for (const e of execs.rows) {
            if (!execByRun.has(e.run_id)) execByRun.set(e.run_id, []);
            execByRun.get(e.run_id).push(e);
        }
        const hallazgosByRun = new Map();
        for (const h of hallazgos.rows) {
            if (!hallazgosByRun.has(h.exploratory_run_id)) hallazgosByRun.set(h.exploratory_run_id, []);
            hallazgosByRun.get(h.exploratory_run_id).push(h);
        }

        // ── Gráficos (SVG/CSS inline, sin dependencias externas) ──
        function donutSVG() {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            let offset = 0;
            const rings = STATUS_ORDER
                .filter((status) => counts[status] > 0)
                .map((status) => {
                    const length = totalTests > 0 ? (counts[status] / totalTests) * circumference : 0;
                    const ring = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${STATUS_STYLE[status].chart}" stroke-width="18" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
                    offset += length;
                    return ring;
                })
                .join('');
            return `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Distribución de tests por estado">
                <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#eef2f7" stroke-width="18"></circle>
                ${rings}
                <text x="70" y="67" text-anchor="middle" font-size="22" font-weight="800" fill="#111827">${totalTests}</text>
                <text x="70" y="84" text-anchor="middle" font-size="9" fill="#6b7280" letter-spacing="1">TESTS</text>
            </svg>`;
        }

        const legendHTML = STATUS_ORDER
            .filter((status) => counts[status] > 0)
            .map((status) => {
                const pct = totalTests > 0 ? Math.round((counts[status] / totalTests) * 100) : 0;
                return `<div style="display:flex;align-items:center;gap:6px;font-size:.72rem;margin-bottom:5px;">
                    <span style="width:9px;height:9px;border-radius:2px;background:${STATUS_STYLE[status].chart};display:inline-block;"></span>
                    <span style="font-weight:700;min-width:62px;">${status}</span>
                    <span style="color:#6b7280;">${counts[status]} (${pct}%)</span>
                </div>`;
            })
            .join('');

        const sessionBars = runIds.map((runId) => {
            const run = runsById.get(runId);
            const list = execByRun.get(runId) || [];
            if (!run || list.length === 0) return '';
            const perStatus = {};
            for (const e of list) perStatus[e.status] = (perStatus[e.status] || 0) + 1;
            const segments = STATUS_ORDER.map((status) => {
                const n = perStatus[status] || 0;
                if (!n) return '';
                return `<div title="${status}: ${n}" style="width:${(n / list.length) * 100}%;background:${STATUS_STYLE[status].chart};height:100%;"></div>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
                <div style="width:150px;font-size:.68rem;color:#4b5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${run.id} · ${htmlEscape(run.name || 'Sesión')}</div>
                <div style="flex:1;height:14px;border-radius:7px;background:#eef2f7;overflow:hidden;display:flex;">${segments}</div>
                <div style="font-size:.66rem;color:#6b7280;width:28px;text-align:right;">${list.length}</div>
            </div>`;
        }).filter(Boolean).join('');

        const chartsHTML = `<div class="charts">
            <div class="chart-card chart-card--donut">
                <div class="chart-title">Resultados por estado</div>
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    ${donutSVG()}
                    <div>${legendHTML || '<span style="font-size:.72rem;color:#6b7280;">Sin datos</span>'}</div>
                </div>
            </div>
            <div class="chart-card chart-card--bars">
                <div class="chart-title">Tests por sesión</div>
                ${sessionBars || '<span style="font-size:.72rem;color:#6b7280;">Sin tests ejecutados en el rango.</span>'}
            </div>
        </div>`;

        let sessionsHTML = '';
        for (const runId of runIds) {
            const run = runsById.get(runId);
            if (!run) continue;
            const runExecs = execByRun.get(runId) || [];
            const runHallazgos = hallazgosByRun.get(runId) || [];

            // Agrupación por estado de resultado dentro de la sesión.
            const byStatus = new Map();
            for (const e of runExecs) {
                if (!byStatus.has(e.status)) byStatus.set(e.status, []);
                byStatus.get(e.status).push(e);
            }
            const statusesToRender = [
                ...STATUS_ORDER,
                ...[...byStatus.keys()].filter((status) => !STATUS_ORDER.includes(status)),
            ];

            const testCard = (e) => {
                const color = STATUS_STYLE[e.status] || { bg: '#e5e7eb', fg: '#4b5563' };
                const execDefects = defectsByExec.get(e.id) || [];
                const evidHTML = (evidByExec[e.id] || []).map(ev => evidenceHTML(ev, 180)).join('');
                const defectsHTML = execDefects.map(d => {
                    const defEvid = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 160)).join('');
                    return `<div style="padding:7px 9px;background:rgba(220,38,38,.05);border-radius:6px;margin-top:5px;">
                        <div style="font-weight:700;font-size:.78rem;">${htmlEscape(d.title)}</div>
                        <div style="font-size:.7rem;color:#6b7280;">Severidad: ${htmlEscape(d.severity)} · Estado: ${htmlEscape(d.status)}${d.jira_key ? ' · Jira: ' + (d.jira_url ? `<a href="${htmlEscape(d.jira_url)}" target="_blank" style="color:#2563eb;font-weight:600;text-decoration:none;">${htmlEscape(d.jira_key)} ↗</a>` : htmlEscape(d.jira_key)) : ''}</div>
                        ${d.actual_result ? `<div style="font-size:.72rem;margin-top:3px;"><strong>Obtenido:</strong> ${htmlEscape(d.actual_result)}</div>` : ''}
                        ${defEvid ? `<div style="margin-top:4px;">${defEvid}</div>` : ''}
                    </div>`;
                }).join('');

                return `<div style="padding:12px;background:#fff;border-radius:8px;margin-bottom:9px;border-left:4px solid ${color.fg};box-shadow:0 1px 3px rgba(0,0,0,.07);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                        <div style="font-weight:700;font-size:.82rem;">${htmlEscape(e.key_id || '')} — ${htmlEscape(e.tc_title)}</div>
                        <span style="padding:2px 8px;border-radius:4px;font-size:.62rem;font-weight:700;background:${color.bg};color:${color.fg};">${htmlEscape(e.status)}</span>
                    </div>
                    <div style="font-size:.7rem;color:#6b7280;margin-top:2px;">Tester: ${htmlEscape(e.tester || '—')} · ${fmtReportDate(e.executed_at)}</div>
                    ${e.obtained_result ? `<div style="font-size:.74rem;margin-top:4px;"><strong>Obtenido:</strong> ${htmlEscape(e.obtained_result)}</div>` : ''}
                    ${e.observations ? `<div style="font-size:.74rem;margin-top:2px;"><strong>Observaciones:</strong> ${htmlEscape(e.observations)}</div>` : ''}
                    ${evidHTML ? `<div style="margin-top:5px;">${evidHTML}</div>` : ''}
                    ${execDefects.length > 0 ? `<div style="margin-top:6px;"><div style="font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Defectos (${execDefects.length})</div>${defectsHTML}</div>` : ''}
                </div>`;
            };

            const testsHTML = statusesToRender.map((status) => {
                const list = byStatus.get(status) || [];
                if (list.length === 0) return '';
                const style = STATUS_STYLE[status] || { fg: '#4b5563', chart: '#94a3b8' };
                return `<div style="margin-bottom:10px;">
                    <div style="display:inline-flex;align-items:center;gap:6px;font-size:.68rem;font-weight:800;color:${style.fg};text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${style.chart};"></span>${status} · ${list.length}
                    </div>
                    ${list.map(testCard).join('')}
                </div>`;
            }).join('');

            const hallazgosHTML = runHallazgos.map(h => `
                <div style="padding:7px 9px;background:#fffbeb;border-radius:6px;margin-top:5px;border-left:3px solid #d97706;">
                    <div style="font-weight:700;font-size:.78rem;">H-${h.id} · ${htmlEscape(h.title)}</div>
                    <div style="font-size:.7rem;color:#6b7280;">Severidad: ${htmlEscape(h.severity || 'Media')} · Estado: ${htmlEscape(h.status)} · ${htmlEscape(h.reporter_name)} · ${fmtReportDate(h.created_at)}</div>
                </div>`).join('');

            sessionsHTML += `<div style="margin-bottom:18px;">
                <div style="background:#eef2ff;border-radius:8px;padding:12px 14px;margin-bottom:8px;border-left:4px solid #4f46e5;">
                    <div style="font-weight:800;font-size:.9rem;">#${run.id} · ${htmlEscape(run.name || 'Sesión exploratoria')}</div>
                    <div style="font-size:.72rem;color:#4b5563;margin-top:2px;">${htmlEscape(run.charter || '')}</div>
                    <div style="font-size:.68rem;color:#6b7280;margin-top:2px;">${fmtReportDate(run.started_at)} → ${run.finished_at ? fmtReportDate(run.finished_at) : 'en curso'} · ${runExecs.length} tests · ${runHallazgos.length} hallazgos · Aceptación ${(() => {
                        const ev = runExecs.filter(e => ['OK', 'FAIL', 'WARNING'].includes(e.status)).length;
                        return ev > 0 ? Math.round((runExecs.filter(e => e.status === 'OK').length / ev) * 100) + '%' : '—';
                    })()}</div>
                    <div style="margin-top:4px;">${run.coverage_ready
                        ? '<span style="font-size:.62rem;font-weight:700;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;">✓ TC de cobertura declarados</span>'
                        : '<span style="font-size:.62rem;font-weight:700;background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;">⚠ TC de cobertura sin declarar</span>'}</div>
                </div>
                ${testsHTML || '<div style="font-size:.74rem;color:#6b7280;padding:4px 0;">Sin tests ejecutados en el rango.</div>'}
                ${runHallazgos.length > 0 ? `<div style="margin-top:6px;"><div style="font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Hallazgos (${runHallazgos.length})</div>${hallazgosHTML}</div>` : ''}
            </div>`;
        }

        const testerLabel = testerName || 'Todos los testers';
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de estatus - Exploratoria</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#4f46e5,#3730a3);color:#fff;border-radius:12px;padding:24px;margin-bottom:20px}
        .header h1{margin:0 0 4px;font-size:1.3rem}.header p{margin:0;opacity:.9;font-size:.85rem}
        .kpi{background:#fff;border-radius:8px;padding:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi-val{font-size:1.35rem;font-weight:700}.kpi-lab{font-size:.62rem;color:#6b7280;text-transform:uppercase}
        .charts{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
        .chart-card{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .chart-card--donut{flex:0 0 300px}
        .chart-card--bars{flex:1;min-width:300px}
        .chart-title{font-size:.66rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.72rem}
        @media print{body{background:#fff;padding:0}.kpi,.chart-card{box-shadow:none;border:1px solid #e5e7eb}}</style></head><body>
        <div class="header">
            <h1>Reporte de estatus — Exploratoria</h1>
            <p>${htmlEscape(project.name)} · ${htmlEscape(testerLabel)} · ${from} → ${to}</p>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
            <div class="kpi"><div class="kpi-val">${runIds.length}</div><div class="kpi-lab">Sesiones</div></div>
            <div class="kpi"><div class="kpi-val">${coveredCount}/${runsById.size}</div><div class="kpi-lab">Cobertura TC</div></div>
            <div class="kpi"><div class="kpi-val">${execs.rows.length}</div><div class="kpi-lab">Tests ejecutados</div></div>
            <div class="kpi" title="OK / (OK + FAIL + WARNING). BLOCK, SKIP y PENDIENTE no cuentan."><div class="kpi-val">${acceptancePct === null ? '—' : `${acceptancePct}%`}</div><div class="kpi-lab">Aceptación</div></div>
            <div class="kpi"><div class="kpi-val">${counts.OK}</div><div class="kpi-lab">OK</div></div>
            <div class="kpi"><div class="kpi-val">${counts.FAIL}</div><div class="kpi-lab">FAIL</div></div>
            <div class="kpi"><div class="kpi-val">${counts.WARNING}</div><div class="kpi-lab">WARNING</div></div>
            <div class="kpi"><div class="kpi-val">${counts.BLOCK}</div><div class="kpi-lab">BLOCK</div></div>
            <div class="kpi"><div class="kpi-val">${counts.SKIP}</div><div class="kpi-lab">SKIP</div></div>
            <div class="kpi"><div class="kpi-val">${hallazgos.rows.length}</div><div class="kpi-lab">Hallazgos</div></div>
            <div class="kpi"><div class="kpi-val">${defects.rows.length}</div><div class="kpi-lab">Defectos</div></div>
        </div>
        <div style="font-size:.68rem;color:#6b7280;margin:-8px 0 14px 2px;">
            Aceptación = <strong>OK / (OK + FAIL + WARNING)</strong>. BLOCK, SKIP y PENDIENTE no cuentan:
            no representan una validación aprobada ni fallida.
        </div>
        ${coverageAlertHTML}
        ${chartsHTML}
        ${sessionsHTML || '<div style="text-align:center;padding:40px;color:#6b7280;">Sin actividad en el rango seleccionado.</div>'}
        ${omittedEvidence > 0 ? `<div style="text-align:center;padding:8px;color:#b45309;font-size:.72rem;">${omittedEvidence} evidencia(s) no disponible(s) en esta máquina: se omitieron del reporte.</div>` : ''}
        <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR', { timeZone: REPORT_TZ })}</div>
        ${lightboxHTML()}
        </body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error('Error en reports/status:', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
