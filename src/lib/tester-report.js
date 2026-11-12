const { query } = require('../../db');
const { getEvidenceBase64, evidenceHTML, lightboxHTML } = require('./report-evidence');

async function generateTesterReport(userId, { dateFrom, dateTo, projectIds } = {}) {
    // Obtener nombre y email del usuario para fallback con campo 'tester'
    const userRow = await query(`SELECT name, email FROM qa_users WHERE id = ?`, [userId]);
    const userName = userRow.rows[0]?.name || '';
    const userEmail = userRow.rows[0]?.email || '';

    const testerClause = `(e.tester_id = ? OR (e.tester_id IS NULL AND (e.tester = ? OR e.tester = ?)))`;
    const params = [userId, userName, userEmail];
    const REPORT_TZ = 'America/Argentina/Buenos_Aires';
    let dateExecClause = '';
    let dateDefectClause = '';

    if (dateFrom) {
        dateExecClause += ` AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date >= ?`;
        params.push(dateFrom);
    }
    if (dateTo) {
        dateExecClause += ` AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date <= ?`;
        params.push(dateTo);
    }

    const defectParams = [userId];
    if (dateFrom) {
        dateDefectClause += ` AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date >= ?`;
        defectParams.push(dateFrom);
    }
    if (dateTo) {
        dateDefectClause += ` AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date <= ?`;
        defectParams.push(dateTo);
    }

    let projectClause = '';
    if (projectIds && projectIds.length > 0) {
        const placeholders = projectIds.map(() => '?').join(',');
        projectClause = ` AND p.id IN (${placeholders})`;
    }

    const execSql = `
        SELECT e.id, e.status, e.executed_at, e.observations, e.obtained_result,
               tc.title as tc_title, tc.id as tc_id,
               COALESCE(p.name, 'Sin proyecto') as project_name, COALESCE(p.id, 0) as project_id,
               s.title as suite_name
        FROM qa_executions e
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        JOIN qa_test_runs r ON e.run_id = r.id
        JOIN qa_test_suites s ON r.suite_id = s.id
        LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_projects p ON COALESCE(s.project_id, uc.project_id) = p.id
        WHERE ${testerClause} ${dateExecClause} ${projectClause}
        ORDER BY COALESCE(p.name, 'Sin proyecto'), e.executed_at DESC
    `;
    const execParams = projectIds && projectIds.length > 0 ? [...params, ...projectIds] : params;
    const execs = await query(execSql, execParams);

    const defectSql = `
        SELECT d.id, d.title, d.severity, d.status, d.created_at, d.actual_result,
               COALESCE(p.name, 'Sin proyecto') as project_name, COALESCE(p.id, 0) as project_id
        FROM qa_defects d
        LEFT JOIN qa_executions e ON d.execution_id = e.id
        LEFT JOIN qa_test_runs r ON e.run_id = r.id
        LEFT JOIN qa_test_suites s ON r.suite_id = s.id
        LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_projects p ON COALESCE(d.project_id, s.project_id, uc.project_id) = p.id
        WHERE d.created_by = ? ${dateDefectClause} ${projectClause}
        ORDER BY COALESCE(p.name, 'Sin proyecto'), d.created_at DESC
    `;
    const defectParamsFinal = projectIds && projectIds.length > 0 ? [...defectParams, ...projectIds] : defectParams;
    const defects = await query(defectSql, defectParamsFinal);

    const attachments = await query(`
        SELECT a.id, a.execution_id, a.defect_id
        FROM qa_attachments a
        WHERE a.execution_id IN (${execs.rows.map(e => e.id).join(',') || '0'})
           OR a.defect_id IN (${defects.rows.map(d => d.id).join(',') || '0'})
    `, []);

    const evidByExec = {};
    const evidByDef = {};
    for (const a of attachments.rows) {
        const b64 = await getEvidenceBase64(a.id);
        if (b64) {
            if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(b64); }
            if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(b64); }
        }
    }

    const projects = {};
    for (const e of execs.rows) {
        if (!projects[e.project_id]) projects[e.project_id] = { name: e.project_name, execs: [], defects: [] };
        projects[e.project_id].execs.push(e);
    }
    for (const d of defects.rows) {
        if (!projects[d.project_id]) projects[d.project_id] = { name: d.project_name, execs: [], defects: [] };
        projects[d.project_id].defects.push(d);
    }

    return { projects, evidByExec, evidByDef, dateFrom, dateTo };
}

function renderTesterReportHTML(data, userName) {
    const { projects, evidByExec, evidByDef, dateFrom, dateTo } = data;
    const dateLabel = dateFrom && dateTo ? `${dateFrom} al ${dateTo}` : dateFrom ? `Desde ${dateFrom}` : dateTo ? `Hasta ${dateTo}` : 'Completo';
    const title = `Reporte de Actividad - ${dateLabel}`;
    const totalExecs = Object.values(projects).reduce((s, p) => s + p.execs.length, 0);
    const totalDefects = Object.values(projects).reduce((s, p) => s + p.defects.length, 0);
    const totalPassed = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => ['OK', 'PASS'].includes(e.status)).length, 0);
    const totalFailed = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => e.status === 'FAIL').length, 0);
    const totalBlocked = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => ['BLOCK', 'BLOCKED'].includes(e.status)).length, 0);
    const passRate = totalExecs > 0 ? ((totalPassed / totalExecs) * 100).toFixed(1) : 0;

    let projectsHTML = '';
    for (const [pid, proj] of Object.entries(projects)) {
        const pPassed = proj.execs.filter(e => ['OK', 'PASS'].includes(e.status)).length;
        const pFailed = proj.execs.filter(e => e.status === 'FAIL').length;
        const pBlocked = proj.execs.filter(e => ['BLOCK', 'BLOCKED'].includes(e.status)).length;
        const pSkip = proj.execs.filter(e => ['SKIP', 'SKIPPED'].includes(e.status)).length;

        let execRows = '';
        for (const e of proj.execs) {
            const statusClass = ['OK', 'PASS'].includes(e.status) ? 'pass' : e.status === 'FAIL' ? 'fail' : e.status === 'SKIP' || e.status === 'SKIPPED' ? 'skip' : 'block';
            const evidHTML = (evidByExec[e.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
            execRows += `<tr>
                <td>${e.tc_title || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${e.status}</span></td>
                <td>${e.executed_at ? new Date(e.executed_at).toLocaleString('es-AR') : 'N/A'}</td>
                <td>${e.obtained_result || '-'}</td>
                <td>${evidHTML || '-'}</td>
            </tr>`;
        }

        let defectRows = '';
        for (const d of proj.defects) {
            const sevClass = d.severity === 'Alta' || d.severity === 'Crítica' ? 'fail' : d.severity === 'Media' ? 'block' : 'pass';
            const evidHTML = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
            defectRows += `<tr>
                <td>${d.title}</td>
                <td><span class="status-badge ${sevClass}">${d.severity}</span></td>
                <td><span class="status-badge ${d.status === 'OPEN' ? 'fail' : 'pass'}">${d.status}</span></td>
                <td>${d.actual_result || '-'}</td>
                <td>${d.created_at ? new Date(d.created_at).toLocaleString('es-AR') : 'N/A'}</td>
                <td>${evidHTML || '-'}</td>
            </tr>`;
        }

        projectsHTML += `
        <div class="project-section">
            <h2>${proj.name}</h2>
            <div class="project-kpis">
                <div class="kpi"><div class="kpi-val">${proj.execs.length}</div><div class="kpi-lab">Tests</div></div>
                <div class="kpi green"><div class="kpi-val">${pPassed}</div><div class="kpi-lab">Pasados</div></div>
                <div class="kpi red"><div class="kpi-val">${pFailed}</div><div class="kpi-lab">Fallidos</div></div>
                <div class="kpi orange"><div class="kpi-val">${pBlocked}</div><div class="kpi-lab">Bloqueados</div></div>
                <div class="kpi"><div class="kpi-val">${pSkip}</div><div class="kpi-lab">Saltados</div></div>
                <div class="kpi purple"><div class="kpi-val">${proj.defects.length}</div><div class="kpi-lab">Hallazgos</div></div>
            </div>
            ${proj.execs.length > 0 ? `
            <h3>Ejecuciones</h3>
            <table><thead><tr><th>Test Case</th><th>Estado</th><th>Fecha</th><th>Resultado Real</th><th>Evidencias</th></tr></thead><tbody>${execRows}</tbody></table>` : ''}
            ${proj.defects.length > 0 ? `
            <h3>Hallazgos</h3>
            <table><thead><tr><th>Título</th><th>Severidad</th><th>Estado</th><th>Resultado Actual</th><th>Fecha</th><th>Evidencias</th></tr></thead><tbody>${defectRows}</tbody></table>` : ''}
        </div>`;
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#1e40af,#7c3aed);color:white;border-radius:12px;padding:24px;margin-bottom:24px}
        .header h1{margin:0 0 4px;font-size:1.5rem}.header p{margin:0;opacity:.9;font-size:.9rem}
        .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
        .kpi{background:white;border-radius:8px;padding:16px;text-align:center;min-width:100px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi.green{border-top-color:#059669}.kpi.red{border-top-color:#dc2626}.kpi.orange{border-top-color:#d97706}.kpi.purple{border-top-color:#7c3aed}
        .kpi-val{font-size:1.5rem;font-weight:700;color:#111827}.kpi-lab{font-size:.7rem;color:#6b7280;text-transform:uppercase}
        .project-section{background:white;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        .project-section h2{margin:0 0 12px;font-size:1.1rem;color:#1e40af}
        .project-section h3{margin:16px 0 8px;font-size:.85rem;color:#6b7280;text-transform:uppercase}
        .project-kpis{display:flex;gap:12px;flex-wrap:wrap}
        table{width:100%;border-collapse:collapse;font-size:.82rem}
        th{background:#f9fafb;padding:8px;text-align:left;font-size:.7rem;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb}
        td{padding:8px;border-bottom:1px solid #f3f4f6;vertical-align:top}
        .status-badge{padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600}
        .status-badge.pass{background:#d1fae5;color:#059669}.status-badge.fail{background:#fee2e2;color:#dc2626}
        .status-badge.block{background:#fef3c7;color:#d97706}.status-badge.skip{background:#f3f4f6;color:#6b7280}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.75rem}
        @media print{body{background:white;padding:0}}
    </style></head><body>
    <div class="header">
        <h1>${title}</h1>
        <p>Tester: ${userName} | Periodo: ${dateLabel}</p>
    </div>
    <div class="kpis">
        <div class="kpi"><div class="kpi-val">${totalExecs}</div><div class="kpi-lab">Tests Totales</div></div>
        <div class="kpi green"><div class="kpi-val">${totalPassed}</div><div class="kpi-lab">Pasados</div></div>
        <div class="kpi red"><div class="kpi-val">${totalFailed}</div><div class="kpi-lab">Fallidos</div></div>
        <div class="kpi orange"><div class="kpi-val">${totalBlocked}</div><div class="kpi-lab">Bloqueados</div></div>
        <div class="kpi"><div class="kpi-val">${passRate}%</div><div class="kpi-lab">Tasa Aprobación</div></div>
        <div class="kpi purple"><div class="kpi-val">${totalDefects}</div><div class="kpi-lab">Hallazgos</div></div>
    </div>
    ${Object.keys(projects).length === 0 ? '<div style="text-align:center;padding:40px;color:#6b7280;">Sin actividad registrada</div>' : projectsHTML}
    <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR')}</div>
    ${lightboxHTML()}
    </body></html>`;
}

module.exports = { generateTesterReport, renderTesterReportHTML };
