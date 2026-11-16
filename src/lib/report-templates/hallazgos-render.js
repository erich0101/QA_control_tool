const { evidenceHTML, lightboxHTML } = require('../report-evidence');

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render del reporte de hallazgos seleccionados (HTML autocontenido).
 */
function renderHallazgosReport(data) {
    const { defects, evidByDef } = data;
const sevColors = { 'Crítica': '#dc2626', 'Alta': '#ea580c', 'Media': '#d97706', 'Baja': '#059669' };
        const sevBg = { 'Crítica': '#fee2e2', 'Alta': '#ffedd5', 'Media': '#fef3c7', 'Baja': '#d1fae5' };

        let defectsHTML = '';
        for (const d of defects.rows) {
            const evidHTML = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 250)).join('');
            const sevColor = sevColors[d.severity] || '#6b7280';
            const sevBgColor = sevBg[d.severity] || '#f3f4f6';

            defectsHTML += `
                <div style="padding:16px; background:white; border-radius:10px; margin-bottom:14px; border-left:5px solid ${sevColor}; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:0.9rem; color:var(--apple-label);">#${d.id} - ${esc(d.title)}</div>
                            <div style="font-size:0.72rem; color:var(--apple-label-secondary); margin-top:2px;">
                                ${esc(d.project_name)} | Reportado por: ${esc(d.reporter_name || '—')} | ${d.created_at ? new Date(d.created_at).toLocaleDateString('es-AR') : '—'}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <span style="padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:700; background:${sevBgColor}; color:${sevColor};">${esc(d.severity)}</span>
                            <span style="padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:700; background:${d.status === 'OPEN' ? '#fee2e2' : '#d1fae5'}; color:${d.status === 'OPEN' ? '#dc2626' : '#059669'};">${esc(d.status)}</span>
                        </div>
                    </div>
                    ${d.description ? `<div style="font-size:0.8rem; margin-top:6px; padding:8px; background:var(--apple-fill); border-radius:6px;">${esc(d.description)}</div>` : ''}
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
                        ${d.steps_to_reproduce ? `<div style="font-size:0.75rem; padding:8px; background:#f9fafb; border-radius:6px;"><strong>Pasos:</strong><br>${esc(d.steps_to_reproduce)}</div>` : ''}
                        ${d.expected_result ? `<div style="font-size:0.75rem; padding:8px; background:rgba(52,199,89,0.06); border-radius:6px;"><strong>Esperado:</strong><br>${esc(d.expected_result)}</div>` : ''}
                        ${d.actual_result ? `<div style="font-size:0.75rem; padding:8px; background:rgba(255,59,48,0.06); border-radius:6px;"><strong>Actual:</strong><br>${esc(d.actual_result)}</div>` : ''}
                        ${d.observations ? `<div style="font-size:0.75rem; padding:8px; background:#f9fafb; border-radius:6px;"><strong>Observaciones:</strong><br>${esc(d.observations)}</div>` : ''}
                    </div>
                    ${d.jira_key ? `<div style="font-size:0.72rem; margin-top:6px; color:var(--apple-blue);">Jira: <a href="${esc(d.jira_url || '#')}" target="_blank">${esc(d.jira_key)}</a></div>` : ''}
                    ${evidHTML ? `<div style="margin-top:10px;"><div style="font-size:0.68rem; font-weight:700; color:var(--apple-label-tertiary); text-transform:uppercase; margin-bottom:4px;">Evidencias</div><div>${evidHTML}</div></div>` : ''}
                </div>
            `;
        }

        const totalOpen = defects.rows.filter(d => d.status === 'OPEN').length;
        const totalCrit = defects.rows.filter(d => d.severity === 'Crítica' || d.severity === 'Alta').length;

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Hallazgos Seleccionados</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border-radius:12px;padding:24px;margin-bottom:24px}
        .header h1{margin:0 0 4px;font-size:1.3rem}.header p{margin:0;opacity:.9;font-size:.85rem}
        .kpi{background:white;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi-val{font-size:1.4rem;font-weight:700}.kpi-lab{font-size:.65rem;color:#6b7280;text-transform:uppercase}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.75rem}
        @media print{body{background:white;padding:0}}</style></head><body>
        <div class="header">
            <h1>Reporte de Hallazgos Seleccionados</h1>
            <p>${defects.rows.length} hallazgo(s) | ${new Date().toLocaleDateString('es-AR')}</p>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div class="kpi"><div class="kpi-val">${defects.rows.length}</div><div class="kpi-lab">Total</div></div>
            <div class="kpi"><div class="kpi-val" style="color:#dc2626">${totalOpen}</div><div class="kpi-lab">Abiertos</div></div>
            <div class="kpi"><div class="kpi-val" style="color:#ea580c">${totalCrit}</div><div class="kpi-lab">Alta/Crítica</div></div>
        </div>
        ${defectsHTML}
        <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR')}</div>
        ${lightboxHTML()}
        </body></html>`;

    return html;
}

module.exports = { renderHallazgosReport };
