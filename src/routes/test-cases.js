const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey, getProjectIdFromSuite } = require('../lib/sequences');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id, suite_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const params = [project_id];
        let where = `cu.project_id = ?`;
        if (suite_id) {
            where += ` AND tc.suite_id = ?`;
            params.push(suite_id);
        }

        const sql = `
            SELECT tc.id, tc.key_id, tc.title
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            WHERE ${where}
            ORDER BY tc.id DESC
            LIMIT 1000
        `;
        const result = await query(sql, params);
        res.json({ test_cases: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_test')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { suite_id, us_id, scenario_id: provided_scenario_id, title, steps, expected_result, assigned_to, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria } = req.body;
        if (!suite_id || !title) return res.status(400).json({ error: 'suite_id y title requeridos' });
        
        let scenario_id = provided_scenario_id;

        // --- NUEVA LÓGICA: El Escenario nace con el Test ---
        if (us_id && !scenario_id) {
            // 1. Crear el escenario automáticamente
            const scenarioRes = await query(
                `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
                [us_id, title, us_id]
            );
            scenario_id = scenarioRes.rows[0].id;

            // 2. Vincular el título al campo de texto de la HU para compatibilidad
            await query(
                `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
                [title, title, us_id]
            );
        }
        // --------------------------------------------------

        const projectId = await getProjectIdFromSuite(suite_id);
        const finalKeyId = await generateKey(projectId, 'TC');

        const result = await query(`INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, title, steps, expected_result, assigned_to, created_by, updated_by, key_id, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [suite_id, us_id || null, scenario_id || null, title, steps || '', expected_result || '', assigned_to || null, req.user.id, req.user.id, finalKeyId, preconditions || '', jira_epic_key || '', assumptions || '', test_data || '', acceptance_criteria || '']);
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId, scenario_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/move', requireAuth, async (req, res) => {
    try {
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
            return res.status(500).json({ error: 'El Test Case no pudo ser movido. El UPDATE no afectó ninguna fila.' });
        }

        res.json({ ok: true, moved: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const tcId = req.params.id;
        const fields = [];
        const params = [];
        const allowedFields = ['us_id', 'scenario_id', 'title', 'steps', 'expected_result', 'assigned_to', 'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory', 'preconditions', 'jira_epic_key', 'assumptions', 'test_data', 'acceptance_criteria', 'observations'];

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

            // --- NUEVA LÓGICA: Sincronizar título con el Escenario ---
            const tcRes = await query(`SELECT title, us_id, scenario_id FROM qa_test_cases WHERE id = ?`, [tcId]);
            const tc = tcRes.rows[0];
            
            if (tc && tc.us_id && !tc.scenario_id) {
                // 1. Crear escenario si no existe pero hay US vinculada
                const scenarioRes = await query(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
                    [tc.us_id, tc.title, tc.us_id]
                );
                const newScenarioId = scenarioRes.rows[0].id;
                await query(`UPDATE qa_test_cases SET scenario_id = ? WHERE id = ?`, [newScenarioId, tcId]);
                
                // 2. Vincular al campo de texto de la HU para compatibilidad
                await query(
                    `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
                    [tc.title, tc.title, tc.us_id]
                );
            } else if (tc && tc.scenario_id && req.body.title !== undefined) {
                // 3. Actualizar título del escenario si ya existe y cambió el título del test
                await query(`UPDATE qa_scenarios SET title = ? WHERE id = ?`, [req.body.title, tc.scenario_id]);
            }
            // --------------------------------------------------------
        }

        const { status, observations, obtained_result } = req.body;

        // Si viene status o metadata de ejecución, actualizar/crear ejecución
        if (status || observations !== undefined || obtained_result !== undefined) {
            // Buscar run activo
            const tcInfo = await query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [tcId]);
            const suiteId = tcInfo.rows[0]?.suite_id;
            const suiteInfo = await query(`SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
            let runId = suiteInfo.rows[0]?.active_run_id;

            // Si no hay run activo pero el usuario solo quiere actualizar el
            // obtained_result de un TC ya ejecutado, permitimos buscar la
            // última ejecución del TC y actualizarla in-place.
            if (!runId && obtained_result !== undefined && status === undefined) {
                const lastExec = await query(
                    `SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`,
                    [tcId]
                );
                if (lastExec.rows.length > 0) {
                    await query(
                        `UPDATE qa_executions SET obtained_result = ? WHERE id = ?`,
                        [obtained_result, lastExec.rows[0].id]
                    );
                    return res.json({ ok: true, execution_id: lastExec.rows[0].id, mode: 'obtained_result_only' });
                }
                // Sin ejecuciones previas: no se puede guardar.
                return res.status(400).json({ error: 'No hay ejecuciones previas para este TC y no hay un run activo. Iniciá una ejecución primero.' });
            }

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
                const insertRes = await query(`INSERT INTO qa_executions (tc_id, run_id, tester, tester_id, status, observations, obtained_result) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [tcId, runId, req.user.name, req.user.id, status || 'PENDING', observations || '', obtained_result || '']);
                execId = insertRes.lastID;
            }
            const { bug_title, bug_description, bug_severity, bug_steps_to_reproduce, bug_expected_result, bug_actual_result, bug_frequency, bug_business_impact, bug_observations, bugs } = req.body;

            // Helper local: crea un defect si el título no está vacío y no es duplicado exacto en la misma ejecución
            const insertDefectIfValid = async (b) => {
                if (!b || !b.title || !b.title.trim()) return;
                const suiteInfo = await query(`
                    SELECT s.jira_epic_key
                    FROM qa_test_suites s
                    JOIN qa_test_cases tc ON s.id = tc.suite_id
                    WHERE tc.id = ?
                `, [tcId]);
                const jira_epic_key = suiteInfo.rows[0]?.jira_epic_key || '';

                const existingBug = await query(`SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`, [execId, b.title]);
                if (existingBug.rows.length === 0) {
                    await query(`INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, observations, status, jira_epic_key, created_by, project_id)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
                        [execId, b.title, b.description || '', b.severity || 'Media', b.steps_to_reproduce || '', b.expected_result || '', b.actual_result || '', b.frequency || 'Siempre', b.business_impact || '', b.observations || '', jira_epic_key, req.user.id, req.body.project_id || null]);
                }
            };

            if ((status === 'FAIL' || status === 'WARNING')) {
                // Nuevo formato: array de bugs
                if (Array.isArray(bugs) && bugs.length > 0) {
                    for (const b of bugs) {
                        await insertDefectIfValid(b);
                    }
                } else if (bug_title) {
                    // Compatibilidad con formato escalar legacy (modal "new-bug" o flujos previos)
                    await insertDefectIfValid({
                        title: bug_title,
                        description: bug_description,
                        severity: bug_severity,
                        steps_to_reproduce: bug_steps_to_reproduce,
                        expected_result: bug_expected_result,
                        actual_result: bug_actual_result,
                        frequency: bug_frequency,
                        business_impact: bug_business_impact,
                        observations: bug_observations
                    });
                }
            }
            res.json({ ok: true, execution_id: execId });
        } else {
            res.json({ ok: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_test_cases WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
