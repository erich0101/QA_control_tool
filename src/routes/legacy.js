const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../lib/upload');
const { generateKey, getProjectIdFromSuite } = require('../lib/sequences');
const { saveAttachment } = require('../lib/report-evidence');

const router = express.Router();

// BASE_DIR = raíz del proyecto (qa_report_builder.py vive ahí).
const BASE_DIR = path.join(__dirname, '..', '..');

// Nota: el guardado multipart NO abre transacción. db.js ejecuta cada query
// contra Supabase vía RPC (conexiones independientes), así que BEGIN/COMMIT
// no existen: antes lanzaban un error fuera del try y tumbaban el proceso.

router.post('/issue', requireAuth, upload.any(), async (req, res) => {
    try {
        const fields = req.body;
        const files = req.files || [];

        // Buscar suite
        const suiteId = fields.suite_id;
        if (!suiteId) throw new Error("suite_id requerido");

        // Procesar Test Cases (test_list_v2)
        if (fields.test_list_v2) {
            const listV2 = JSON.parse(fields.test_list_v2);
            for (const t of listV2) {
                if (t.isSection) continue;

                let tcId = t.id;
                if (!tcId) {
                    const projectId = await getProjectIdFromSuite(suiteId);
                    const finalKeyId = await generateKey(projectId, 'TC');
                    const tcRes = await query(`INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`, [suiteId, t.title || 'Sin título', finalKeyId]);
                    tcId = tcRes.lastID;
                } else {
                    await query(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [t.title || 'Sin título', tcId]);
                }

                let execId;
                const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]);
                if (execRes.rows.length > 0) {
                    execId = execRes.rows[0].id;
                    await query(`UPDATE qa_executions SET status = ? WHERE id = ?`, [t.status || 'PENDING', execId]);
                } else {
                    const newExecRes = await query(`INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`, [tcId, t.status || 'PENDING']);
                    execId = newExecRes.lastID;
                }

                if (t.sbs && t.sbs.length > 0) {
                    const row = t.sbs[0];
                    
                    const processCategory = async (attData, category) => {
                        if (!attData) return;
                        if (attData.pending) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                            const file = files.find(f => f.fieldname === attData.pending);
                            if (file) await saveAttachment(execId, null, file, category);
                        } else if (!attData.src) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                        }
                    };

                    await processCategory(row.figma, 'FIGMA');
                    await processCategory(row.dev, 'DEV');
                }
            }
        }

        res.json({ ok: true, message: 'Guardado correctamente' });

    } catch (err) {
        console.error("Error en POST /api/issue:", err);
        res.status(500).json({ error: 'Error al guardar. Cambios revertidos.' });
    }
});

router.post('/report', requireAuth, async (req, res) => {
    try {
        exec(`python qa_report_builder.py`, { cwd: BASE_DIR }, (err, stdout, stderr) => {
            if (err) return res.status(500).json({ error: stderr || err.message });
            res.json({ ok: true, output: stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── LEGACY COMPAT (para reporte Python) ──
// ══════════════════════════════════════════════════════════════

router.get('/data', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) {
            // Fallback: primer proyecto activo
            const proj = await query(`SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
            if (proj.rows.length === 0) return res.json({ pruebas: [] });
            return res.redirect(`/api/data?project_id=${proj.rows[0].id}`);
        }

        const useCases = await query(`SELECT * FROM qa_use_cases WHERE project_id = ?`, [project_id]);
        const pruebas = [];

        for (const cu of useCases.rows) {
            const stories = await query(`SELECT * FROM qa_user_stories WHERE use_case_id = ?`, [cu.id]);
            for (const us of stories.rows) {
                const suites = await query(`SELECT * FROM qa_test_suites WHERE us_id = ?`, [us.id]);
                for (const suite of suites.rows) {
                    const cases = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ? ORDER BY id`, [suite.id]);
                    const testList = [];
                    
                    // Buscar si hay un run activo para esta suite
                    const activeRunRes = await query(`SELECT * FROM qa_test_runs WHERE id = ? AND status = 'ACTIVE'`, [suite.active_run_id]);
                    const activeRun = activeRunRes.rows[0] || null;

                    for (const tc of cases.rows) {
                        let exec = null;
                        if (activeRun) {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.id]);
                            if (execRes.rows.length > 0) {
                                exec = execRes.rows[0];
                            } else if (activeRun.run_type === 'RETEST' && activeRun.parent_run_id) {
                                const parentExecRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.parent_run_id]);
                                if (parentExecRes.rows.length > 0) {
                                    exec = parentExecRes.rows[0];
                                    exec.is_from_parent = true;
                                }
                            }
                        } else {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc.id]);
                            exec = execRes.rows.length > 0 ? execRes.rows[0] : null;
                        }

                        const defects = [];
                        if (exec) {
                            const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [exec.id]);
                            defRes.rows.forEach(d => defects.push(d));
                        }

                        testList.push({
                            id: tc.id,
                            title: tc.title,
                            status: exec ? exec.status : 'PENDING',
                            execution_id: exec ? exec.id : null,
                            is_from_parent: exec ? !!exec.is_from_parent : false,
                            defects: defects,
                            isSection: false,
                            sbs: [{ figma: null, dev: null }]
                        });
                    }
                    pruebas.push({
                        id: suite.id,
                        feature: suite.title,
                        modulo: us.title,
                        status: testList.every(t => t.status === 'OK' || t.status === 'PASS') ? 'OK' : (testList.some(t => t.status === 'FAIL') ? 'FAIL' : 'PENDING'),
                        test_list_v2: testList
                    });
                }
            }
        }

        res.json({ pruebas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
