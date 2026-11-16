const { query } = require('../../../db');
const { getEvidenceBase64 } = require('../report-evidence');

/**
 * Datos del reporte de hallazgos seleccionados (sin HTML).
 */
async function buildHallazgosReportData(ids) {

        const placeholders = ids.map(() => '?').join(',');
        const defects = await query(`
            SELECT d.id, d.title, d.description, d.severity, d.status, d.created_at,
                   d.steps_to_reproduce, d.expected_result, d.actual_result,
                   d.frequency, d.business_impact, d.preconditions, d.observations,
                   d.jira_key, d.jira_url, d.component,
                   p.name as project_name,
                   u1.name as assignee_name, u2.name as reporter_name
            FROM qa_defects d
            JOIN qa_projects p ON d.project_id = p.id
            LEFT JOIN qa_users u1 ON d.assigned_to = u1.id
            LEFT JOIN qa_users u2 ON d.created_by = u2.id
            WHERE d.id IN (${placeholders})
            ORDER BY d.severity DESC, d.created_at DESC
        `, ids);

        const attachments = await query(`
            SELECT a.id, a.defect_id
            FROM qa_attachments a
            WHERE a.defect_id IN (${placeholders})
        `, ids);

        const evidByDef = {};
        for (const a of attachments.rows) {
            const ev = await getEvidenceBase64(a.id);
            if (ev) {
                evidByDef[a.defect_id] = evidByDef[a.defect_id] || [];
                evidByDef[a.defect_id].push(ev);
            }
        }

                return { defects, evidByDef };
}

module.exports = { buildHallazgosReportData };
