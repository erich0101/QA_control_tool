const { query } = require('../../../db');
const { getEvidenceBase64 } = require('../../../src/lib/report-evidence');

/**
 * Datos del reporte de bugs de una sesion (sin HTML).
 */
async function buildBugsReportData({ runId, testerId: testerIdParam, testerName: testerNameParam }) {

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
        if (runRes.rows.length === 0) {
            const error = new Error('Sesión no encontrada');
            error.status = 404;
            throw error;
        }
        const run = runRes.rows[0];

        // Filtro opcional por tester (id y/o nombre). Se usa `tester_id`
        // cuando existe y el nombre como respaldo para datos viejos.
        const testerId = testerIdParam;
        const testerName = testerNameParam;
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

                return {
            run, execs, defects, evidByExec, evidByDef, omittedEvidence, defectsByExec,
            testerName,
        };
}

module.exports = { buildBugsReportData };
