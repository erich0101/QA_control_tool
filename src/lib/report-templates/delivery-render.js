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
    const style = STATUS_STYLE[status] || STATUS_STYLE.PENDING;
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

function evidenceBlock(evidence, maxWidth = 180) {
    if (!evidence || evidence.length === 0) return '';
    return `<details style="margin-top:6px;">
        <summary style="cursor:pointer;font-size:.66rem;font-weight:800;color:#6b7280;text-transform:uppercase;">Adjuntos (${evidence.length})</summary>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
            ${evidence.map((ev) => evidenceHTML(ev, maxWidth)).join('')}
        </div>
    </details>`;
}

function renderDefects(defects, showEvidence = true) {
    if (!defects || defects.length === 0) return '';
    return `<div style="margin-top:8px;">
        <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Defectos (${defects.length})</div>
        ${defects.map((defect) => {
            const open = ['OPEN', 'IN_PROGRESS'].includes(String(defect.status || 'OPEN').toUpperCase());
            return `<div style="padding:7px 9px;border-radius:6px;margin-top:4px;background:${open ? '#fef2f2' : '#f0fdf4'};border-left:3px solid ${open ? '#dc2626' : '#16a34a'};">
                <div style="font-weight:700;font-size:.76rem;">#${defect.id} · ${esc(defect.title)}</div>
                <div style="font-size:.68rem;color:#6b7280;">Severidad: ${esc(defect.severity || 'Media')} · Estado: <strong>${esc(defect.status || 'OPEN')}</strong>${defect.jira_key ? ` · Jira: ${esc(defect.jira_key)}` : ''}</div>
                ${defect.actual_result ? `<div style="font-size:.7rem;margin-top:2px;"><strong>Obtenido:</strong> ${esc(defect.actual_result)}</div>` : ''}
                ${showEvidence && defect.evidence && defect.evidence.length > 0 ? evidenceBlock(defect.evidence, 140) : ''}
            </div>`;
        }).join('')}
    </div>`;
}

function renderTest(test) {
    const retestLabel = test.was_retested && test.latest_exec?.run_type === 'RETEST'
        ? `<span style="font-size:.6rem;font-weight:800;color:#15803d;background:#dcfce7;border-radius:10px;padding:1px 7px;">RETEST</span>`
        : '';
    const transition = test.was_retested
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.66rem;">${statusBadge(test.first_status)} <span style="color:#9ca3af;">→</span> ${statusBadge(test.effective_status)}</span>`
        : statusBadge(test.effective_status);

    return `<details style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;background:#fff;">
        <summary style="cursor:pointer;padding:8px 11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-family:monospace;font-size:.66rem;color:#6b7280;min-width:70px;">${esc(test.key_id || `TC-${test.id}`)}</span>
            <span style="flex:1;min-width:180px;font-size:.76rem;font-weight:600;">${esc(test.title)}</span>
            ${retestLabel}
            ${transition}
            ${test.evidence.length > 0 ? `<span style="font-size:.62rem;color:#4f46e5;font-weight:700;">${test.evidence.length} adjunto(s)</span>` : ''}
            ${test.open_defects.length > 0 ? `<span style="font-size:.62rem;color:#dc2626;font-weight:800;">${test.open_defects.length} bug(s) abierto(s)</span>` : ''}
        </summary>
        <div style="border-top:1px solid #f3f4f6;padding:9px 11px;">
            ${test.first_exec ? `<div style="font-size:.68rem;color:#6b7280;">Original: ${statusBadge(test.first_status)} · ${fmt(test.first_exec.executed_at)}</div>` : ''}
            ${test.latest_exec && test.was_retested ? `<div style="font-size:.68rem;color:#6b7280;margin-top:2px;">Último resultado: ${statusBadge(test.effective_status)} · ${fmt(test.latest_exec.executed_at)}</div>` : ''}
            ${test.latest_exec?.obtained_result ? `<div style="font-size:.72rem;margin-top:4px;"><strong>Obtenido:</strong> ${esc(test.latest_exec.obtained_result)}</div>` : ''}
            ${test.latest_exec?.observations ? `<div style="font-size:.72rem;margin-top:2px;"><strong>Observaciones:</strong> ${esc(test.latest_exec.observations)}</div>` : ''}
            ${renderDefects(test.defects)}
            ${evidenceBlock(test.evidence)}
        </div>
    </details>`;
}

/**
 * Reporte de estado de entrega de un ciclo, con su cadena de retest.
 * HTML autocontenido y apto para imprimir/guardar como PDF.
 */
function renderDeliveryReport(data) {
    const tone = toneColor(data.verdictTone);
    const cycleLabel = `#${data.root.id}`;
    const retestIds = data.retestRuns.map((run) => `#${run.id}`).join(' · ');

    const testsHTML = data.tests.length === 0
        ? '<div style="text-align:center;padding:32px;color:#6b7280;">El ciclo no tiene test cases ejecutados.</div>'
        : data.tests.map(renderTest).join('');

    const retestRows = data.retestedTests.map((test) => `<tr>
        <td style="padding:6px 9px;border-bottom:1px solid #f3f4f6;font-size:.7rem;">${esc(test.key_id || `TC-${test.id}`)}</td>
        <td style="padding:6px 9px;border-bottom:1px solid #f3f4f6;font-size:.7rem;">${esc(test.title)}</td>
        <td style="padding:6px 9px;border-bottom:1px solid #f3f4f6;text-align:center;">${statusBadge(test.first_status)}</td>
        <td style="padding:6px 9px;border-bottom:1px solid #f3f4f6;text-align:center;">${statusBadge(test.effective_status)}</td>
        <td style="padding:6px 9px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:.66rem;font-weight:800;color:${test.resolved_by_retest ? '#15803d' : test.regressed ? '#dc2626' : '#6b7280'};">
            ${test.resolved_by_retest ? 'RESUELTO' : test.regressed ? 'REGRESIÓN' : 'SIN CAMBIO'}
        </td>
    </tr>`).join('');

    const openDefectsHTML = data.openDefects.length === 0
        ? '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;font-size:.74rem;color:#15803d;font-weight:700;">✓ Sin defectos abiertos.</div>'
        : `<div style="display:grid;gap:6px;">${data.openDefects.map((defect) => `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px 11px;">
            <div style="font-weight:700;font-size:.76rem;">#${defect.id} · ${esc(defect.title)}</div>
            <div style="font-size:.68rem;color:#6b7280;">Severidad: ${esc(defect.severity || 'Media')} · Estado: ${esc(defect.status || 'OPEN')} · TC: ${esc(defect.tc_id || '—')}${defect.jira_key ? ` · Jira: ${esc(defect.jira_key)}` : ''}</div>
            ${defect.actual_result ? `<div style="font-size:.7rem;margin-top:2px;">${esc(defect.actual_result)}</div>` : ''}
            ${defect.evidence && defect.evidence.length > 0 ? evidenceBlock(defect.evidence, 140) : ''}
        </div>`).join('')}</div>`;

    const kpi = (label, value, sub, color = '#4f46e5') => `<div style="background:#fff;border-radius:10px;padding:12px;border-top:3px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <div style="font-size:1.35rem;font-weight:800;color:${color};line-height:1.1;">${value}</div>
        <div style="font-size:.6rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:3px;font-weight:700;">${label}</div>
        <div style="font-size:.64rem;color:#6b7280;margin-top:2px;">${sub}</div>
    </div>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Estado de entrega - ${esc(data.project.name)} - ${esc(cycleLabel)}</title>
    <style>
        body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .wrap{max-width:1180px;margin:0 auto}
        .header{background:linear-gradient(135deg,#1d4ed8,#3730a3);color:#fff;border-radius:12px;padding:22px 24px;margin-bottom:14px}
        .header h1{margin:0 0 4px;font-size:1.3rem}
        .header p{margin:0;font-size:.78rem;opacity:.9}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:14px}
        .section-title{font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:9px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse}
        details summary::-webkit-details-marker{display:none}
        @media print{body{background:#fff;padding:0}.card{box-shadow:none;break-inside:avoid}details{break-inside:avoid}}
    </style></head><body><div class="wrap">
        <div class="header">
            <h1>Estado de entrega — QA</h1>
            <p>${esc(data.project.name)} · ${esc(data.suite.title)} · Ciclo ${esc(cycleLabel)}${retestIds ? ` · Retest ${esc(retestIds)}` : ' · Sin retest'}</p>
            <p style="margin-top:4px;">${esc(data.useCase.key || '')} ${esc(data.useCase.title || '')} · Tester(s): ${esc(data.testers.join(', ') || '—')} · Generado ${fmt(new Date())}</p>
        </div>

        <div style="background:${tone.bg};border:1px solid ${tone.border};border-left:6px solid ${tone.accent};border-radius:10px;padding:13px 16px;margin-bottom:14px;">
            <div style="font-size:.6rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Veredicto de entrega</div>
            <div style="font-size:1.05rem;font-weight:800;color:${tone.fg};margin-top:2px;">${tone.icon} ${esc(data.verdictLabel)}</div>
            <div style="font-size:.72rem;color:#4b5563;margin-top:2px;">
                ${data.total} TC · ${data.counts.OK} OK · ${data.counts.FAIL} FAIL · ${data.counts.BLOCK} BLOCK · ${data.counts.PENDING} pendientes · ${data.openDefects.length} defecto(s) abierto(s)
                ${data.retestRuns.length > 0 ? ` · ${data.resolvedByRetest.length} resuelto(s) por retest` : ''}
            </div>
        </div>

        <div class="grid">
            ${kpi('Aceptación total', data.acceptanceTotalPct == null ? '—' : `${data.acceptanceTotalPct}%`, `${data.counts.OK} OK de ${data.total} TC`, acceptanceColor(data.acceptanceTotalPct))}
            ${kpi('Aceptación evaluada', data.acceptanceEvaluatedPct == null ? '—' : `${data.acceptanceEvaluatedPct}%`, 'OK / (OK+FAIL+WARNING)', acceptanceColor(data.acceptanceEvaluatedPct))}
            ${kpi('TC OK', data.counts.OK, 'Resultado efectivo', '#15803d')}
            ${kpi('TC FAIL / BLOCK', data.counts.FAIL + data.counts.BLOCK, 'Requieren atención', data.counts.FAIL + data.counts.BLOCK > 0 ? '#dc2626' : '#15803d')}
            ${kpi('Pendientes', data.counts.PENDING, 'Sin ejecutar', data.counts.PENDING > 0 ? '#b45309' : '#15803d')}
            ${kpi('Retest', data.retestRuns.length, `${data.retestedTests.length} TC re-testeados`, data.retestRuns.length > 0 ? '#4f46e5' : '#6b7280')}
            ${kpi('Adjuntos', data.evidenceCount, `${data.omittedEvidence} no disponible(s)`, '#4f46e5')}
            ${kpi('Defectos abiertos', data.openDefects.length, `${data.resolvedDefects.length} resuelto(s)`, data.openDefects.length > 0 ? '#dc2626' : '#15803d')}
        </div>

        <div class="card">
            <div class="section-title">Distribución de resultados efectivos</div>
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

        <div class="card">
            <div class="section-title">Defectos abiertos que impactan la entrega</div>
            ${openDefectsHTML}
        </div>

        ${data.retestRuns.length > 0 ? `<div class="card">
            <div class="section-title">Resultado del retest (${data.retestedTests.length} TC re-testeados)</div>
            ${retestRows ? `<table><thead><tr>
                <th style="text-align:left;padding:5px 9px;font-size:.58rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">TC</th>
                <th style="text-align:left;padding:5px 9px;font-size:.58rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Título</th>
                <th style="padding:5px 9px;font-size:.58rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Original</th>
                <th style="padding:5px 9px;font-size:.58rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Retest</th>
                <th style="padding:5px 9px;font-size:.58rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Resultado</th>
            </tr></thead><tbody>${retestRows}</tbody></table>` : '<div style="font-size:.72rem;color:#6b7280;">El retest no ejecutó TC.</div>'}
        </div>` : ''}

        <div class="card">
            <div class="section-title">Detalle por test case (${data.tests.length})</div>
            ${testsHTML}
        </div>

        <div style="text-align:center;padding:16px;color:#6b7280;font-size:.7rem;">
            Reporte generado automáticamente · ${fmt(new Date())}
        </div>
        ${lightboxHTML()}
    </div></body></html>`;
}

module.exports = { renderDeliveryReport };
