const { evidenceHTML, lightboxHTML } = require('../../../src/lib/report-evidence');

function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render del reporte de bugs de una sesion (HTML autocontenido).
 */
function renderBugsReport(data) {
    const { run, execs, defects, evidByExec, evidByDef, omittedEvidence, defectsByExec, testerName } = data;
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

                return html;
}

module.exports = { renderBugsReport };
