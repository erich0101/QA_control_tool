const { evidenceHTML, lightboxHTML } = require('../../../src/lib/report-evidence');
const {
    STATUS_STYLE,
    STATUS_ORDER,
    acceptanceColor,
    sessionLink,
    transitionTone,
    distributionBar,
    distributionSection,
    sessionDonut,
    acceptanceBar,
    transitionsTable,
} = require('../report-ui/status-report-ui');

const REPORT_TZ = 'America/Argentina/Buenos_Aires';

function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtReportDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-AR', { timeZone: REPORT_TZ });
}

function fmtReportDay(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-AR', { timeZone: REPORT_TZ });
}

/**
 * Renderiza el reporte de estatus a partir de los datos de ./data.js.
 * No hace consultas: solo compone HTML autocontenido para print/PDF.
 */
function renderStatusReport(data) {
    const {
        project, from, to, testerLabel,
        runIds, runsById, hallazgos,
        extensionsByRun, planChangesByRun, blocksByRun,
        totalsByRun, transitionsRes, totalTransitions,
        execHistoryByTc, hallazgoHistoryById,
        evidByExec, evidByDef, omittedEvidence,
        defectsByExec, defectsByRun, totalDefects, totalFindings,
        counts, totalTests, execByRun, hallazgosByRun,
        sessionTotals, acceptanceEvaluatedPct, acceptanceTotalPct,
        coveredCount, coveragePct, verdictTone, verdictLabel, verdictDetail,
        pendingByRun, accumulatedCounts, alerts,
    } = data;

    const now = Date.now();

const alertsHTML = alerts.length === 0 ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:5px solid #16a34a;border-radius:10px;padding:12px 14px;margin-bottom:18px;">
                <div style="font-weight:800;color:#15803d;font-size:.82rem;">✓ Sin alertas críticas</div>
                <div style="font-size:.72rem;color:#166534;margin-top:2px;">No hay riesgos abiertos detectados en el rango seleccionado.</div>
            </div>` : `
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
                <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Atención requerida</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${alerts.map(alert => `
                        <div style="display:flex;gap:8px;align-items:flex-start;border-left:3px solid ${alert.tone === 'fail' ? '#dc2626' : '#d97706'};background:${alert.tone === 'fail' ? '#fef2f2' : '#fffbeb'};border-radius:6px;padding:8px 10px;">
                            <span style="font-size:.8rem;line-height:1.2;color:${alert.tone === 'fail' ? '#dc2626' : '#b45309'};">${alert.tone === 'fail' ? '✕' : '⚠'}</span>
                            <div style="flex:1;">
                                <div style="font-size:.75rem;font-weight:700;color:${alert.tone === 'fail' ? '#b91c1c' : '#92400e'};">${htmlEscape(alert.title)}</div>
                                <div style="font-size:.68rem;color:${alert.tone === 'fail' ? '#991b1b' : '#92400e'};">${htmlEscape(alert.detail)}</div>
                                ${alert.refs.length > 0 ? `<div style="font-size:.64rem;color:#6b7280;margin-top:2px;">Ir a: ${alert.refs.map(sessionLink).join(' · ')}</div>` : ''}
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;

        const distributionHTML = distributionSection({
            rangeCounts: counts,
            rangeTotal: totalTests,
            accumulatedCounts,
            accumulatedTotal: sessionTotals.total,
        });
        const execTransitions = transitionsRes.rows.filter((row) => row.entity_type === 'execution');
        const transitionsHTML = `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Evolución de re-tests</div>
                <div style="font-size:.68rem;color:#6b7280;">${totalTransitions} transición(es) en el rango</div>
            </div>
            ${execTransitions.length === 0 ? '<div style="font-size:.72rem;color:#6b7280;">Sin cambios de estado de TC en el rango.</div>' : `
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${execTransitions.map((row) => {
                        const tone = transitionTone(row.to_status);
                        return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:${tone.bg};color:${tone.fg};">
                            ${htmlEscape(row.prev_status)} → ${htmlEscape(row.to_status)}
                            <span style="font-size:.62rem;background:rgba(0,0,0,.06);border-radius:10px;padding:1px 6px;">${row.total}</span>
                        </span>`;
                    }).join('')}
                </div>`}
            <details style="margin-top:10px;">
                <summary style="cursor:pointer;font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Ver matriz completa</summary>
                <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;">
                    <div style="flex:1;min-width:280px;">
                        <div style="font-size:.64rem;font-weight:800;color:#4b5563;text-transform:uppercase;margin-bottom:4px;">TC / ejecuciones</div>
                        ${transitionsTable(transitionsRes.rows, 'execution')}
                    </div>
                    <div style="flex:1;min-width:280px;">
                        <div style="font-size:.64rem;font-weight:800;color:#4b5563;text-transform:uppercase;margin-bottom:4px;">Hallazgos</div>
                        ${transitionsTable(transitionsRes.rows, 'hallazgo')}
                    </div>
                </div>
            </details>
        </div>`;

        let sessionsHTML = '';
        let summaryRows = '';
        for (const runId of runIds) {
            const run = runsById.get(runId);
            if (!run) continue;
            const runExecs = execByRun.get(runId) || [];
            const runHallazgos = hallazgosByRun.get(runId) || [];

            // Resumen por sesión para la tabla de decisión.
            const st = totalsByRun.get(run.id) || {
                total: 0, ok: 0, fail: 0, warning: 0, block: 0, skip: 0, pending: 0, executed: 0,
            };
            const runAcceptance = st.total > 0 ? Math.round((st.ok / st.total) * 100) : null;
            const runEvaluables = st.ok + st.fail + st.warning;
            const runAcceptanceEval = runEvaluables > 0 ? Math.round((st.ok / runEvaluables) * 100) : null;
            const runProgress = st.total > 0 ? Math.round((st.executed / st.total) * 100) : 0;
            const runDistribution = {
                OK: st.ok,
                FAIL: st.fail,
                WARNING: st.warning,
                BLOCK: st.block,
                SKIP: st.skip,
                PENDING: st.pending,
            };
            const runDeadline = run.deadline_at ? new Date(run.deadline_at) : null;
            const runOverdue = run.status === 'RUNNING' && runDeadline && runDeadline.getTime() < now;
            const runNear = run.status === 'RUNNING' && runDeadline && !runOverdue
                && runDeadline.getTime() - now <= 86_400_000;
            summaryRows += `<tr>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
                    <div style="font-weight:700;font-size:.74rem;color:#111827;">#${run.id} · ${htmlEscape(run.name || 'Sesión')}</div>
                    <div style="font-size:.64rem;color:#6b7280;margin-top:1px;">${htmlEscape(run.charter || 'Sin charter')}</div>
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.68rem;color:#4b5563;white-space:nowrap;">
                    ${run.planned_start_at ? new Date(run.planned_start_at).toLocaleDateString('es-AR', { timeZone: REPORT_TZ }) : '—'}
                    →
                    ${run.planned_end_at ? new Date(run.planned_end_at).toLocaleDateString('es-AR', { timeZone: REPORT_TZ }) : '—'}
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.68rem;white-space:nowrap;color:${runOverdue ? '#dc2626' : '#4b5563'};font-weight:${runOverdue || runNear ? 700 : 400};">
                    ${runDeadline ? runDeadline.toLocaleDateString('es-AR', { timeZone: REPORT_TZ }) : '—'}
                    ${runOverdue ? '<div style="font-size:.6rem;color:#dc2626;">VENCIDA</div>' : runNear ? '<div style="font-size:.6rem;color:#b45309;">VENCE PRONTO</div>' : ''}
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.68rem;color:#4b5563;white-space:nowrap;">
                    <strong style="color:#111827;">${runProgress}%</strong>
                    <div style="font-size:.62rem;color:#6b7280;">${st.executed}/${st.total} · ${st.pending} pend.</div>
                    <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:#eef2f7;margin-top:4px;min-width:90px;">
                        ${st.ok ? `<div style="width:${(st.ok / Math.max(1, st.total)) * 100}%;background:#16a34a;" title="OK: ${st.ok}"></div>` : ''}
                        ${st.fail ? `<div style="width:${(st.fail / Math.max(1, st.total)) * 100}%;background:#dc2626;" title="FAIL: ${st.fail}"></div>` : ''}
                        ${st.warning ? `<div style="width:${(st.warning / Math.max(1, st.total)) * 100}%;background:#d97706;" title="WARNING: ${st.warning}"></div>` : ''}
                        ${st.block ? `<div style="width:${(st.block / Math.max(1, st.total)) * 100}%;background:#f97316;" title="BLOCK: ${st.block}"></div>` : ''}
                        ${st.skip ? `<div style="width:${(st.skip / Math.max(1, st.total)) * 100}%;background:#94a3b8;" title="SKIP: ${st.skip}"></div>` : ''}
                        ${st.pending ? `<div style="width:${(st.pending / Math.max(1, st.total)) * 100}%;background:#e5e7eb;" title="Pendientes: ${st.pending}"></div>` : ''}
                    </div>
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.66rem;white-space:nowrap;">
                    <span style="color:#15803d;font-weight:700;">${st.ok} OK</span> ·
                    <span style="color:#dc2626;font-weight:700;">${st.fail} F</span> ·
                    <span style="color:#b45309;font-weight:700;">${st.warning} W</span> ·
                    <span style="color:#c2410c;font-weight:700;">${st.block} B</span> ·
                    <span style="color:#4b5563;font-weight:700;">${st.skip} S</span> ·
                    <span style="color:#6b7280;font-weight:700;">${st.pending} P</span>
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.72rem;white-space:nowrap;">
                    <strong style="color:${acceptanceColor(runAcceptance)};">${runAcceptance === null ? '—' : `${runAcceptance}%`}</strong>
                    <div style="font-size:.62rem;color:#6b7280;">evaluada ${runAcceptanceEval === null ? '—' : `${runAcceptanceEval}%`}</div>
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.68rem;text-align:center;">
                    ${run.coverage_ready
                        ? '<span class="badge" style="background:#dcfce7;color:#15803d;">Declarado</span>'
                        : '<span class="badge" style="background:#fef3c7;color:#b45309;">Sin declarar</span>'}
                </td>
                <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:.68rem;text-align:center;color:#4b5563;font-weight:700;" title="Defectos de ejecución / hallazgos">
                    ${defectsByRun.get(run.id) || 0} / ${runHallazgos.length}
                </td>
            </tr>`;

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
                const evidList = evidByExec[e.id] || [];
                const evidHTML = evidList.map(ev => evidenceHTML(ev, 180)).join('');
                const evidBlock = evidHTML ? `<details style="margin-top:5px;">
                    <summary style="cursor:pointer;font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Evidencias (${evidList.length})</summary>
                    <div style="margin-top:4px;">${evidHTML}</div>
                </details>` : '';
                const history = execHistoryByTc.get(e.tc_id) || [];
                const historyForCard = [...history];
                const lastHistory = historyForCard[historyForCard.length - 1];
                if (lastHistory && lastHistory.to_status !== e.status) {
                    historyForCard.push({
                        id: `current-${e.id}`,
                        from_status: lastHistory.to_status,
                        to_status: e.status,
                        changed_at: e.executed_at,
                        changed_by_name: e.tester,
                        reason: 'Estado actual (transición no registrada en el histórico)',
                    });
                }
                // Con una sola transición el historial repite el estado actual:
                // se muestra recién cuando aporta evolución real.
                const historyHTML = historyForCard.length <= 1 ? '' : `<details class="collapsible" style="margin-top:6px;">
                    <summary style="cursor:pointer;font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Historial de estados (${historyForCard.length})</summary>
                    <ol style="margin:4px 0 0 16px;padding:0;font-size:.66rem;color:#4b5563;">
                        ${historyForCard.map((row) => `<li style="margin-bottom:2px;">
                            <strong>${row.from_status ? htmlEscape(row.from_status) + ' → ' : 'Inicial: '}${htmlEscape(row.to_status)}</strong>
                            ${row.reason ? ` · <em>${htmlEscape(row.reason)}</em>` : ''}
                            · ${htmlEscape(row.changed_by_name || '—')} · ${fmtReportDate(row.changed_at)}
                        </li>`).join('')}
                    </ol>
                </details>`;
                const normalize = (value) => String(value || '').trim().toLowerCase();
                const showObservations = e.observations
                    && normalize(e.observations) !== normalize(e.obtained_result);
                const defectsHTML = execDefects.map(d => {
                    const defEvidList = evidByDef[d.id] || [];
                    const defEvid = defEvidList.map(ev => evidenceHTML(ev, 160)).join('');
                    const defEvidBlock = defEvid ? `<details style="margin-top:4px;">
                        <summary style="cursor:pointer;font-size:.64rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Evidencias (${defEvidList.length})</summary>
                        <div style="margin-top:3px;">${defEvid}</div>
                    </details>` : '';
                    return `<div style="padding:7px 9px;background:rgba(220,38,38,.05);border-radius:6px;margin-top:5px;">
                        <div style="font-weight:700;font-size:.78rem;">${htmlEscape(d.title)}</div>
                        <div style="font-size:.7rem;color:#6b7280;">Severidad: ${htmlEscape(d.severity)} · Estado: ${htmlEscape(d.status)}${d.jira_key ? ' · Jira: ' + (d.jira_url ? `<a href="${htmlEscape(d.jira_url)}" target="_blank" style="color:#2563eb;font-weight:600;text-decoration:none;">${htmlEscape(d.jira_key)} ↗</a>` : htmlEscape(d.jira_key)) : ''}</div>
                        ${d.actual_result ? `<div style="font-size:.72rem;margin-top:3px;"><strong>Obtenido:</strong> ${htmlEscape(d.actual_result)}</div>` : ''}
                        ${defEvidBlock}
                    </div>`;
                }).join('');

                return `<div class="test-card" data-status="${htmlEscape(e.status)}" style="padding:12px;background:#fff;border-radius:8px;margin-bottom:9px;border-left:4px solid ${color.fg};box-shadow:0 1px 3px rgba(0,0,0,.07);">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <div style="font-weight:700;font-size:.82rem;">${htmlEscape(e.key_id || '')} — ${htmlEscape(e.tc_title)}</div>
                        <span class="badge" style="background:${color.bg};color:${color.fg};">${htmlEscape(e.status)}</span>
                    </div>
                    <div style="font-size:.7rem;color:#6b7280;margin-top:2px;">Tester: ${htmlEscape(e.tester || '—')} · ${fmtReportDate(e.executed_at)}</div>
                    ${e.obtained_result ? `<div style="font-size:.74rem;margin-top:4px;"><strong>Obtenido:</strong> ${htmlEscape(e.obtained_result)}</div>` : ''}
                    ${showObservations ? `<div style="font-size:.74rem;margin-top:2px;"><strong>Observaciones:</strong> ${htmlEscape(e.observations)}</div>` : ''}
                    ${evidBlock}
                    ${execDefects.length > 0 ? `<div style="margin-top:6px;"><div style="font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Defectos (${execDefects.length})</div>${defectsHTML}</div>` : ''}
                    ${historyHTML}
                </div>`;
            };

            const okRows = (list) => `<div class="ok-table">
                <div class="ok-head">
                    <span>ID</span><span>Caso</span><span>Tester</span><span>Fecha</span>
                </div>
                ${list.map((e) => `<details class="ok-row collapsible" data-status="OK">
                    <summary class="ok-summary">
                        <span class="ok-key">${htmlEscape(e.key_id || '')}</span>
                        <span class="ok-title">${htmlEscape(e.tc_title)}</span>
                        <span class="ok-tester">${htmlEscape(e.tester || '—')}</span>
                        <span class="ok-date">${fmtReportDate(e.executed_at)}</span>
                    </summary>
                    <div class="ok-detail">${testCard(e)}</div>
                </details>`).join('')}
            </div>`;

            const testsHTML = statusesToRender.map((status) => {
                const list = byStatus.get(status) || [];
                if (list.length === 0) return '';
                const style = STATUS_STYLE[status] || { fg: '#4b5563', chart: '#94a3b8' };
                return `<div class="status-group" data-status="${htmlEscape(status)}" style="margin-bottom:10px;">
                    <div style="display:inline-flex;align-items:center;gap:6px;font-size:.68rem;font-weight:800;color:${style.fg};text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${style.chart};"></span>${status} · ${list.length}
                    </div>
                    ${status === 'OK' ? okRows(list) : list.map(testCard).join('')}
                </div>`;
            }).join('');

            const hallazgosHTML = runHallazgos.map(h => {
                const history = hallazgoHistoryById.get(h.id) || [];
                return `<div style="padding:7px 9px;background:#fffbeb;border-radius:6px;margin-top:5px;border-left:3px solid #d97706;">
                    <div style="font-weight:700;font-size:.78rem;">H-${h.id} · ${htmlEscape(h.title)}</div>
                    <div style="font-size:.7rem;color:#6b7280;">Severidad: ${htmlEscape(h.severity || 'Media')} · Estado: ${htmlEscape(h.status)} · ${htmlEscape(h.reporter_name)} · ${fmtReportDate(h.created_at)}</div>
                    ${history.length <= 1 ? '' : `<details class="collapsible" style="margin-top:4px;">
                        <summary style="cursor:pointer;font-size:.64rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Historial de estados (${history.length})</summary>
                        <ol style="margin:3px 0 0 16px;padding:0;font-size:.64rem;color:#4b5563;">
                            ${history.map((row) => `<li style="margin-bottom:2px;">
                                <strong>${row.from_status ? htmlEscape(row.from_status) + ' → ' : 'Inicial: '}${htmlEscape(row.to_status)}</strong>
                                ${row.reason ? ` · <em>${htmlEscape(row.reason)}</em>` : ''}
                                · ${htmlEscape(row.changed_by_name || '—')} · ${fmtReportDate(row.changed_at)}
                            </li>`).join('')}
                        </ol>
                    </details>`}
                </div>`;
            }).join('');

            sessionsHTML += `<details id="sesion-${run.id}" class="session-block" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;">
                <summary class="session-summary" style="cursor:pointer;padding:10px 14px;font-size:.76rem;font-weight:700;color:#111827;">
                    Detalle de la sesión #${run.id} · ${htmlEscape(run.name || 'Sesión exploratoria')}
                    <span style="float:right;font-size:.64rem;font-weight:400;color:#6b7280;">${runExecs.length} test(s) en el rango · ${defectsByRun.get(run.id) || 0} defecto(s) · ${runHallazgos.length} hallazgo(s)</span>
                </summary>
                <div style="border-top:1px solid #e5e7eb;padding:12px 14px;">
                <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;margin-bottom:10px;border-left:3px solid #4f46e5;">
                    <div style="font-size:.72rem;color:#4b5563;">${htmlEscape(run.charter || '')}</div>
                    <div style="font-size:.68rem;color:#6b7280;margin-top:2px;">${fmtReportDay(run.started_at)} → ${run.finished_at ? fmtReportDay(run.finished_at) : 'en curso'} · ${runExecs.length} tests en el rango</div>
                    <div style="font-size:.68rem;color:#4b5563;margin-top:2px;">
                        Plan: ${run.planned_start_at ? fmtReportDay(run.planned_start_at) : 'sin definir'} → ${run.planned_end_at ? fmtReportDay(run.planned_end_at) : 'sin definir'}
                    </div>
                    <div style="font-size:.68rem;margin-top:2px;color:${run.deadline_at && new Date(run.deadline_at) < new Date() ? '#dc2626' : '#4b5563'};">
                        Límite: ${run.deadline_at ? fmtReportDay(run.deadline_at) : 'sin definir'}${run.deadline_at && new Date(run.deadline_at) < new Date() ? ' · VENCIDA' : ''}
                    </div>
                    ${(() => {
                        const FIELD_LABEL = {
                            planned_start: 'Inicio planificado',
                            planned_end: 'Fin planificado',
                            deadline: 'Fecha límite',
                        };
                        const runExts = extensionsByRun.get(run.id) || [];
                        const runPlanChanges = planChangesByRun.get(run.id) || [];
                        const runBlocks = blocksByRun.get(run.id) || [];
                        const original = runExts[0]?.previous_deadline || run.planned_end_at || run.deadline_at;
                        const current = runExts[runExts.length - 1]?.new_deadline || run.deadline_at;
                        const changeRows = [...runPlanChanges, ...runExts].sort((a, b) => a.id - b.id);
                        const blocksRows = runBlocks.map((block) => {
                            const from = new Date(block.blocked_from).getTime();
                            const to = block.blocked_to ? new Date(block.blocked_to).getTime() : Date.now();
                            const days = Math.round((Math.max(0, to - from) / 86_400_000) * 10) / 10;
                            return `<li style="margin-bottom:2px;">${fmtReportDate(block.blocked_from)} → ${block.blocked_to ? fmtReportDate(block.blocked_to) : '<strong>activo</strong>'} · ${days} día(s) · <em>${htmlEscape(block.reason)}</em> · ${htmlEscape(block.created_by_name || '—')}${block.ended_by_name ? ` · retomó ${htmlEscape(block.ended_by_name)}` : ''}</li>`;
                        }).join('');
                        return `<div style="margin-top:6px;border-top:1px dashed #e5e7eb;padding-top:6px;">
                            <div style="font-size:.64rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Trazabilidad de fechas</div>
                            <div style="font-size:.68rem;color:#4b5563;margin-top:2px;">Original: ${original ? fmtReportDate(original) : 'sin definir'} · Actual: ${current ? fmtReportDate(current) : 'sin definir'}${runExts.length ? ` · ${runExts.length} postergación(es)` : ''}</div>
                            ${changeRows.length ? `<ol style="margin:4px 0 0 16px;padding:0;font-size:.66rem;color:#4b5563;">${changeRows.map((ext) => `<li style="margin-bottom:2px;"><strong>${FIELD_LABEL[ext.field] || ext.field}</strong>: ${ext.previous_deadline ? fmtReportDate(ext.previous_deadline) : '—'} → ${fmtReportDate(ext.new_deadline)} · <em>${htmlEscape(ext.reason)}</em> · ${htmlEscape(ext.created_by_name || '—')} · ${fmtReportDate(ext.created_at)}</li>`).join('')}</ol>` : '<div style="font-size:.66rem;color:#6b7280;">Sin cambios de fechas.</div>'}
                            <div style="font-size:.64rem;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:6px;">Bloqueos por fuerza mayor${runBlocks.length ? ` · ${runBlocks.length}` : ''}</div>
                            ${runBlocks.length ? `<ol style="margin:4px 0 0 16px;padding:0;font-size:.66rem;color:#4b5563;">${blocksRows}</ol>` : '<div style="font-size:.66rem;color:#6b7280;">Sin bloqueos registrados.</div>'}
                        </div>`;
                    })()}
                    <div style="margin-top:4px;">${run.coverage_ready
                        ? '<span style="font-size:.62rem;font-weight:700;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;">✓ TC de cobertura declarados</span>'
                        : '<span style="font-size:.62rem;font-weight:700;background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;">⚠ TC de cobertura sin declarar</span>'}</div>
                </div>
                <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin-bottom:10px;border:1px solid #eef2f7;border-radius:8px;background:#fff;">
                    ${sessionDonut(runDistribution, st.total)}
                    <div style="flex:1;min-width:240px;">
                        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:.6rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
                            <span>Estado general de la sesión</span>
                            <span>${st.total} TC · ${runProgress}% ejecutado</span>
                        </div>
                        <div style="margin-top:6px;">${distributionBar(runDistribution, st.total)}</div>
                        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;">
                            ${acceptanceBar('Aceptación total', runAcceptance)}
                            ${acceptanceBar('Aceptación evaluada', runAcceptanceEval)}
                        </div>
                    </div>
                </div>
                ${testsHTML || '<div style="font-size:.74rem;color:#6b7280;padding:4px 0;">Sin tests ejecutados en el rango.</div>'}
                ${(() => {
                    const runPending = pendingByRun.get(run.id) || [];
                    if (runPending.length === 0) return '';
                    return `<details class="collapsible" style="margin-top:8px;">
                        <summary style="cursor:pointer;font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Pendientes sin ejecutar (${runPending.length})</summary>
                        <ol style="margin:4px 0 0 16px;padding:0;font-size:.66rem;color:#4b5563;">
                            ${runPending.map((row) => `<li style="margin-bottom:2px;"><strong>${htmlEscape(row.key_id || '')}</strong> — ${htmlEscape(row.title)}</li>`).join('')}
                        </ol>
                    </details>`;
                })()}
                ${runHallazgos.length > 0 ? `<div style="margin-top:6px;"><div style="font-size:.66rem;font-weight:700;color:#6b7280;text-transform:uppercase;">Hallazgos exploratorios (${runHallazgos.length})</div>${hallazgosHTML}</div>` : ''}
                </div>
            </details>`;
        }

        const sessionsSummaryHTML = summaryRows === '' ? '' : `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Resumen por sesión</div>
                <div style="font-size:.66rem;color:#6b7280;">Aceptación total = OK / total de TC (pendientes incluidos)</div>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:.7rem;">
                    <thead>
                        <tr style="background:#f9fafb;">
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Sesión</th>
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Plan</th>
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Límite</th>
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Avance</th>
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Resultados</th>
                            <th style="text-align:left;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Aceptación</th>
                            <th style="text-align:center;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Cobertura TC</th>
                            <th style="text-align:center;padding:6px 10px;font-size:.6rem;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;" title="Defectos de ejecución / hallazgos">Def. / Hall.</th>
                        </tr>
                    </thead>
                    <tbody>${summaryRows}</tbody>
                </table>
            </div>
        </div>`;

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de estatus - Exploratoria</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#4f46e5,#3730a3);color:#fff;border-radius:12px;padding:22px 24px;margin-bottom:16px}
        .header h1{margin:0 0 4px;font-size:1.25rem}.header p{margin:0;opacity:.9;font-size:.8rem}
        .kpi{background:#fff;border-radius:10px;padding:14px;text-align:left;box-shadow:0 1px 3px rgba(0,0,0,.08);border-top:3px solid #e5e7eb}
        .kpi-val{font-size:1.5rem;font-weight:800;line-height:1.1}.kpi-lab{font-size:.62rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
        .kpi-sub{font-size:.66rem;color:#6b7280;margin-top:4px}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.72rem}
        .badge{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:.62rem;font-weight:700;white-space:nowrap;line-height:1.4}
        .test-card{break-inside:avoid;page-break-inside:avoid}
        .session-block{scroll-margin-top:70px}
        .ok-table{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
        .ok-head,.ok-summary{display:grid;grid-template-columns:90px minmax(0,1fr) 130px 130px;gap:8px;align-items:center;padding:6px 10px}
        .ok-head{background:#f9fafb;font-size:.58rem;text-transform:uppercase;color:#6b7280;font-weight:700}
        .ok-row{border-top:1px solid #f3f4f6}
        .ok-summary{cursor:pointer;font-size:.68rem;color:#4b5563;list-style:none}
        .ok-summary:hover{background:#f9fafb}
        .ok-key{font-weight:700;color:#111827}
        .ok-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ok-detail{padding:8px 10px;background:#fafafa}
        .ok-detail .test-card{margin-bottom:0!important;box-shadow:none!important}
        .toolbar{position:sticky;top:0;z-index:30;display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:rgba(255,255,255,.97);border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.06)}
        .toolbar button{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:4px 9px;font-size:.68rem;font-weight:600;color:#4b5563;cursor:pointer}
        .toolbar button:hover{background:#f3f4f6}
        .toolbar a{font-size:.68rem;color:#4f46e5;font-weight:700;text-decoration:none}
        .toolbar .spacer{flex:1}
        details summary::-webkit-details-marker{display:none}
        @media print{body{background:#fff;padding:0}.kpi{box-shadow:none;border:1px solid #e5e7eb}.toolbar{display:none}.test-card,.ok-row{break-inside:avoid;page-break-inside:avoid}.ok-title{white-space:normal}}</style></head><body>
        <div class="header">
            <h1>Reporte de estatus — Exploratoria</h1>
            <p>${htmlEscape(project.name)} · ${htmlEscape(testerLabel)} · ${from} → ${to} · generado ${new Date().toLocaleString('es-AR', { timeZone: REPORT_TZ })}</p>
            ${omittedEvidence > 0 ? `<p style="margin:6px 0 0;font-size:.7rem;opacity:.85;" title="El reporte se generó en modo offline: las evidencias no disponibles en esta máquina no se embeben. Los archivos siguen asociados a cada ejecución en el sistema.">ⓘ ${omittedEvidence} evidencia(s) no adjuntas en este reporte (modo offline)</p>` : ''}
        </div>

        <div style="background:${verdictTone === 'ok' ? '#f0fdf4' : verdictTone === 'warn' ? '#fffbeb' : '#fef2f2'};border:1px solid ${verdictTone === 'ok' ? '#bbf7d0' : verdictTone === 'warn' ? '#fde68a' : '#fecaca'};border-left:6px solid ${verdictTone === 'ok' ? '#16a34a' : verdictTone === 'warn' ? '#d97706' : '#dc2626'};border-radius:10px;padding:14px 16px;margin-bottom:14px;">
            <div style="font-size:.62rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Veredicto del período</div>
            <div style="font-size:1.05rem;font-weight:800;color:${verdictTone === 'ok' ? '#15803d' : verdictTone === 'warn' ? '#b45309' : '#b91c1c'};margin-top:2px;">
                ${verdictTone === 'ok' ? '✓' : verdictTone === 'warn' ? '⚠' : '✕'} ${htmlEscape(verdictLabel)}
            </div>
            <div style="font-size:.74rem;color:#4b5563;margin-top:2px;">${htmlEscape(verdictDetail)}</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:6px;">
            <div class="kpi" style="border-top-color:${coveredCount === runsById.size ? '#16a34a' : '#d97706'};">
                <div class="kpi-val" style="color:${coveredCount === runsById.size ? '#15803d' : '#b45309'};">${coveredCount}/${runsById.size}</div>
                <div class="kpi-lab">Cobertura del regresivo</div>
                <div class="kpi-sub">${coveragePct === null ? 'Sin sesiones' : `${coveragePct}% de sesiones con TC declarados`}</div>
            </div>
            <div class="kpi" style="border-top-color:${acceptanceColor(acceptanceTotalPct)};">
                <div class="kpi-val" style="color:${acceptanceColor(acceptanceTotalPct)};">${acceptanceTotalPct === null ? '—' : `${acceptanceTotalPct}%`}</div>
                <div class="kpi-lab">Aceptación total (acumulado)</div>
                <div class="kpi-sub">${sessionTotals.ok} OK de ${sessionTotals.total} TC · pendientes incluidos</div>
            </div>
            <div class="kpi" style="border-top-color:${acceptanceColor(acceptanceEvaluatedPct)};">
                <div class="kpi-val" style="color:${acceptanceColor(acceptanceEvaluatedPct)};">${acceptanceEvaluatedPct === null ? '—' : `${acceptanceEvaluatedPct}%`}</div>
                <div class="kpi-lab">Aceptación evaluada (acumulado)</div>
                <div class="kpi-sub">Calidad de lo ya probado · sesiones incluidas</div>
            </div>
            <div class="kpi" style="border-top-color:${sessionTotals.pending > 0 ? '#d97706' : '#16a34a'};">
                <div class="kpi-val" style="color:${sessionTotals.pending > 0 ? '#b45309' : '#15803d'};">${sessionTotals.pending}</div>
                <div class="kpi-lab">TC pendientes (acumulado)</div>
                <div class="kpi-sub">${sessionTotals.executed}/${sessionTotals.total} ejecutados en las sesiones</div>
            </div>
            <div class="kpi" style="border-top-color:${counts.FAIL > 0 ? '#dc2626' : '#16a34a'};">
                <div class="kpi-val" style="color:${sessionTotals.fail > 0 ? '#dc2626' : '#15803d'};">${sessionTotals.fail}</div>
                <div class="kpi-lab">TC en FAIL (acumulado)</div>
                <div class="kpi-sub">${counts.FAIL} ejecución(es) en FAIL dentro del rango</div>
            </div>
            <div class="kpi" style="border-top-color:#4f46e5;">
                <div class="kpi-val" style="color:#4f46e5;">${totalFindings}</div>
                <div class="kpi-lab">Defectos / Hallazgos</div>
                <div class="kpi-sub">${totalDefects} de ejecución · ${hallazgos.rows.length} hallazgos exploratorios</div>
            </div>
        </div>
        <div style="font-size:.64rem;color:#6b7280;margin:6px 0 16px 2px;">
            <strong>Aceptación total</strong> = OK / total de TC (pendientes, BLOCK y SKIP cuentan como no aceptados).
            <strong>Aceptación evaluada</strong> = OK / (OK + FAIL + WARNING): calidad de lo probado.
        </div>

        <div class="toolbar">
            <span style="font-size:.6rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Navegación</span>
            <button type="button" onclick="reportFilter('all')">Todos</button>
            <button type="button" onclick="reportFilter('problems')">Fallos y bloqueos</button>
            <button type="button" onclick="reportFilter('ok')">Solo OK</button>
            <span style="width:1px;height:16px;background:#e5e7eb;"></span>
            <button type="button" onclick="reportToggleAll(true)">Expandir todo</button>
            <button type="button" onclick="reportToggleAll(false)">Colapsar todo</button>
            <span class="spacer"></span>
            <span style="font-size:.62rem;color:#6b7280;">Ir a:</span>
            ${[...runsById.values()].map(run => `<a href="#sesion-${run.id}">#${run.id}</a>`).join(' ')}
        </div>

        ${alertsHTML}
        ${sessionsSummaryHTML}
        ${distributionHTML}
        ${transitionsHTML}

        <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:4px 2px 8px;">Detalle por sesión</div>
        ${sessionsHTML || '<div style="text-align:center;padding:40px;color:#6b7280;">Sin actividad en el rango seleccionado.</div>'}
        <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR', { timeZone: REPORT_TZ })}</div>
        ${lightboxHTML()}
        <script>
        function reportFilter(kind) {
            document.querySelectorAll('[data-status]').forEach(function (el) {
                var status = el.getAttribute('data-status');
                var show = true;
                if (kind === 'problems') show = ['FAIL', 'WARNING', 'BLOCK', 'SKIP'].indexOf(status) !== -1;
                else if (kind === 'ok') show = status === 'OK';
                el.style.display = show ? '' : 'none';
            });
            if (kind !== 'all') {
                document.querySelectorAll('details.session-block').forEach(function (d) { d.open = true; });
            }
        }
        function reportToggleAll(open) {
            document.querySelectorAll('details').forEach(function (d) { d.open = open; });
        }
        </script>
        </body></html>`;

            return html;
}

module.exports = { renderStatusReport };
