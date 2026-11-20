const { evidenceHTML, lightboxHTML } = require('../report-evidence');

const TZ = 'America/Argentina/Buenos_Aires';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmt(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-AR', { timeZone: TZ });
}

function fmtDay(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-AR', { timeZone: TZ });
}

const STATUS_STYLE = {
    OK: { bg: '#dcfce7', fg: '#15803d', label: 'OK' },
    PASS: { bg: '#dcfce7', fg: '#15803d', label: 'PASS' },
    FAIL: { bg: '#fee2e2', fg: '#dc2626', label: 'FAIL' },
    WARNING: { bg: '#fef3c7', fg: '#b45309', label: 'WARNING' },
    BLOCK: { bg: '#ffedd5', fg: '#c2410c', label: 'BLOCK' },
    SKIP: { bg: '#e5e7eb', fg: '#4b5563', label: 'SKIP' },
    SKIPPED: { bg: '#e5e7eb', fg: '#4b5563', label: 'SKIPPED' },
    PENDING: { bg: '#f3f4f6', fg: '#6b7280', label: 'PENDIENTE' },
};

function statusBadge(status) {
    const style = STATUS_STYLE[String(status || 'PENDING').toUpperCase()] || STATUS_STYLE.PENDING;
    return `<span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:12px;font-size:.62rem;font-weight:800;white-space:nowrap;background:${style.bg};color:${style.fg};">${esc(style.label)}</span>`;
}

function toneColor(tone) {
    if (tone === 'ok') return { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d', accent: '#16a34a', icon: '✓' };
    if (tone === 'fail') return { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c', accent: '#dc2626', icon: '✕' };
    return { bg: '#fffbeb', border: '#fde68a', fg: '#b45309', accent: '#d97706', icon: '⚠' };
}

function acceptanceColor(pct) {
    if (pct == null) return '#6b7280';
    return pct >= 80 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';
}

function distributionBar(counts, total) {
    const items = [
        { key: 'OK', color: '#16a34a' },
        { key: 'FAIL', color: '#dc2626' },
        { key: 'WARNING', color: '#d97706' },
        { key: 'BLOCK', color: '#f97316' },
        { key: 'SKIP', color: '#94a3b8' },
        { key: 'PENDING', color: '#e5e7eb' },
    ];
    return `<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:#eef2f7;margin-top:8px;">
        ${items.map((item) => counts[item.key]
            ? `<div style="width:${(counts[item.key] / Math.max(1, total)) * 100}%;background:${item.color};" title="${item.key}: ${counts[item.key]}"></div>`
            : '').join('')}
    </div>`;
}

function evidenceBlock(evidence, maxWidth = 170) {
    if (!evidence || evidence.length === 0) return '';
    return `<details style="margin-top:6px;">
        <summary style="cursor:pointer;font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;">Adjuntos (${evidence.length})</summary>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
            ${evidence.map((ev) => evidenceHTML(ev, maxWidth)).join('')}
        </div>
    </details>`;
}

function renderDefects(defects) {
    if (!defects || defects.length === 0) return '';
    return `<div style="margin-top:6px;">
        <div style="font-size:.62rem;font-weight:800;color:#6b7280;text-transform:uppercase;margin-bottom:3px;">Defectos (${defects.length})</div>
        ${defects.map((defect) => `<div style="padding:5px 8px;border-radius:6px;margin-top:3px;background:${['FIXED','CLOSED','CERRADO','WONT_FIX','DISMISSED'].includes(String(defect.status || '').toUpperCase()) ? '#f0fdf4' : '#fef2f2'};">
            <div style="font-weight:700;font-size:.72rem;">#${defect.id} · ${esc(defect.title)}</div>
            <div style="font-size:.66rem;color:#6b7280;">Severidad: ${esc(defect.severity || 'Media')} · Estado: <strong>${esc(defect.status || 'OPEN')}</strong>${defect.jira_key ? ` · Jira: ${esc(defect.jira_key)}` : ''}</div>
            ${defect.actual_result ? `<div style="font-size:.68rem;margin-top:2px;"><strong>Obtenido:</strong> ${esc(defect.actual_result)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function renderTest(test) {
    return `<details style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;background:#fff;">
        <summary style="cursor:pointer;padding:8px 11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-family:monospace;font-size:.64rem;color:#6b7280;min-width:74px;">${esc(test.key_id || `TC-${test.id}`)}</span>
            <span style="flex:1;min-width:180px;font-size:.76rem;font-weight:600;">${esc(test.title)}</span>
            ${test.us_key ? `<span style="font-size:.6rem;font-weight:800;color:#4f46e5;background:#eef2ff;border-radius:10px;padding:1px 7px;">${esc(test.us_key)}</span>` : ''}
            ${statusBadge(test.status)}
            ${test.evidence.length > 0 ? `<span style="font-size:.62rem;color:#4f46e5;font-weight:700;">${test.evidence.length} adjunto(s)</span>` : ''}
        </summary>
        <div style="border-top:1px solid #f3f4f6;padding:9px 11px;">
            <div style="font-size:.68rem;color:#6b7280;">
                Tester: ${esc(test.tester || '—')} · Último guardado: ${fmt(test.executed_at)}
            </div>
            ${test.obtained_result ? `<div style="font-size:.72rem;margin-top:3px;"><strong>Obtenido:</strong> ${esc(test.obtained_result)}</div>` : ''}
            ${test.observations ? `<div style="font-size:.72rem;margin-top:2px;"><strong>Observaciones:</strong> ${esc(test.observations)}</div>` : ''}
            ${renderDefects(test.defects)}
            ${evidenceBlock(test.evidence)}
        </div>
    </details>`;
}

function renderHallazgos(hallazgos) {
    if (!hallazgos || hallazgos.length === 0) return '';
    return `<div class="card">
        <div class="section-title">Hallazgos de la sesión (${hallazgos.length})</div>
        ${hallazgos.map((hallazgo) => `<div style="padding:7px 9px;border-radius:6px;margin-top:4px;background:${['FIXED','CLOSED','CERRADO','WONT_FIX','DISMISSED'].includes(String(hallazgo.status || '').toUpperCase()) ? '#f0fdf4' : '#fffbeb'};border-left:3px solid ${['FIXED','CLOSED','CERRADO'].includes(String(hallazgo.status || '').toUpperCase()) ? '#16a34a' : '#d97706'};">
            <div style="font-weight:700;font-size:.76rem;">H-${hallazgo.id} · ${esc(hallazgo.title)}</div>
            <div style="font-size:.68rem;color:#6b7280;">Severidad: ${esc(hallazgo.severity || 'Media')} · Estado: <strong>${esc(hallazgo.status || 'OPEN')}</strong> · ${esc(hallazgo.reporter_name || '—')}</div>
            ${hallazgo.actual_result ? `<div style="font-size:.7rem;margin-top:2px;">${esc(hallazgo.actual_result)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

/**
 * Reporte de estado actual de una ejecución o sesión exploratoria.
 * Usa el último resultado guardado por TC, sin cadena histórica de retests.
 */
function renderCurrentStateReport(data) {
    const tone = toneColor(data.verdictTone);
    const stateLabel = data.isFinished ? 'FINALIZADA' : 'ACTIVA / EN CURSO';
    const cycleLabel = data.isExploratory
        ? `Sesión exploratoria #${data.run.id}`
        : `Ejecución #${data.run.id}`;

    const kpi = (label, value, sub, color = '#4f46e5') => `<div style="background:#fff;border-radius:10px;padding:12px;border-top:3px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <div style="font-size:1.35rem;font-weight:800;color:${color};line-height:1.1;">${value}</div>
        <div style="font-size:.6rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:3px;font-weight:700;">${label}</div>
        <div style="font-size:.64rem;color:#6b7280;margin-top:2px;">${sub}</div>
    </div>`;

    const testsHTML = data.tests.length === 0
        ? '<div style="text-align:center;padding:28px;color:#6b7280;">La ejecución no tiene test cases.</div>'
        : data.tests.map(renderTest).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Estado actual de entrega - ${esc(data.project.name)} - ${esc(cycleLabel)}</title>
    <style>
        body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .wrap{max-width:1180px;margin:0 auto}
        .header{background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;border-radius:12px;padding:22px 24px;margin-bottom:14px}
        .header h1{margin:0 0 4px;font-size:1.3rem}
        .header p{margin:0;font-size:.78rem;opacity:.9}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:14px}
        .section-title{font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin-bottom:14px}
        details summary::-webkit-details-marker{display:none}
        @media print{body{background:#fff;padding:0}.card{box-shadow:none;break-inside:avoid}details{break-inside:avoid}}
    </style></head><body><div class="wrap">
        <div class="header">
            <h1>Estado actual de entrega — QA</h1>
            <p>${esc(data.project.name)} · ${esc(data.suite.title)} · ${esc(cycleLabel)} · ${esc(stateLabel)}</p>
            <p style="margin-top:4px;">${esc(data.useCase.key || '')} ${esc(data.useCase.title || '')} · ${esc(data.run.name || 'Sin nombre')} · Generado ${fmt(new Date())}</p>
        </div>

        <div style="background:${tone.bg};border:1px solid ${tone.border};border-left:6px solid ${tone.accent};border-radius:10px;padding:13px 16px;margin-bottom:14px;">
            <div style="font-size:.6rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Estado de la entrega</div>
            <div style="font-size:1.05rem;font-weight:800;color:${tone.fg};margin-top:2px;">${tone.icon} ${esc(data.verdictLabel)}</div>
            <div style="font-size:.72rem;color:#4b5563;margin-top:2px;">
                ${data.total} TC · ${data.counts.OK} OK · ${data.counts.FAIL} FAIL · ${data.counts.BLOCK} BLOCK · ${data.counts.PENDING} pendientes · ${data.openBugs.length} bug(s) abierto(s)
            </div>
        </div>

        <div class="grid">
            ${kpi('Aceptación total', data.acceptanceTotalPct == null ? '—' : `${data.acceptanceTotalPct}%`, `${data.counts.OK} OK de ${data.total} TC`, acceptanceColor(data.acceptanceTotalPct))}
            ${kpi('Aceptación evaluada', data.acceptanceEvaluatedPct == null ? '—' : `${data.acceptanceEvaluatedPct}%`, 'OK / (OK+FAIL+WARNING)', acceptanceColor(data.acceptanceEvaluatedPct))}
            ${kpi('TC OK', data.counts.OK, 'Último estado guardado', '#15803d')}
            ${kpi('TC FAIL / BLOCK', data.counts.FAIL + data.counts.BLOCK, 'Requieren atención', data.counts.FAIL + data.counts.BLOCK > 0 ? '#dc2626' : '#15803d')}
            ${kpi('Pendientes', data.counts.PENDING, 'Sin ejecutar / sin guardar', data.counts.PENDING > 0 ? '#b45309' : '#15803d')}
            ${kpi('Adjuntos disponibles', data.evidenceCount, `${data.evidenceCount + data.omittedEvidence} detectado(s) · ${data.omittedEvidence} no disponible(s)`, '#4f46e5')}
            ${kpi('Bugs abiertos', data.openBugs.length, `${data.defects.length - data.openBugs.length} resuelto(s)`, data.openBugs.length > 0 ? '#dc2626' : '#15803d')}
            ${kpi('Hallazgos abiertos', data.openHallazgos.length, `${data.hallazgos.length - data.openHallazgos.length} resuelto(s)`, data.openHallazgos.length > 0 ? '#b45309' : '#15803d')}
        </div>

        <div class="card">
            <div class="section-title">Distribución de estados actuales</div>
            ${distributionBar(data.counts, data.total)}
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:.68rem;color:#4b5563;">
                <span><strong style="color:#15803d;">${data.counts.OK}</strong> OK</span>
                <span><strong style="color:#dc2626;">${data.counts.FAIL}</strong> FAIL</span>
                <span><strong style="color:#b45309;">${data.counts.WARNING}</strong> WARNING</span>
                <span><strong style="color:#c2410c;">${data.counts.BLOCK}</strong> BLOCK</span>
                <span><strong style="color:#4b5563;">${data.counts.SKIP}</strong> SKIP</span>
                <span><strong style="color:#6b7280;">${data.counts.PENDING}</strong> PENDIENTE</span>
            </div>
        </div>

        ${renderHallazgos(data.hallazgos)}

        <div class="card">
            <div class="section-title">TC de la ejecución (${data.total}) — último estado guardado</div>
            ${testsHTML}
        </div>

        <div style="text-align:center;padding:16px;color:#6b7280;font-size:.7rem;">
            Reporte generado automáticamente · ${fmt(new Date())}
        </div>
        ${lightboxHTML()}
    </div></body></html>`;
}

module.exports = { renderCurrentStateReport };
