import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const DashboardEpicReport = {
    epics: [],
    selectedEpic: null,
    dateFrom: null,
    dateTo: null,
    data: null,
    loading: false,

    async render(container) {
        this.dateFrom = this.dateFrom || this.defaultFrom();
        this.dateTo = this.dateTo || this.defaultTo();
        container.innerHTML = this.renderLayout();
        this.bindEvents(container);
        await this.loadInitial();
    },

    defaultFrom() {
        const d = new Date();
        d.setDate(d.getDate() - 28);
        return d.toISOString().split('T')[0];
    },

    defaultTo() {
        return new Date().toISOString().split('T')[0];
    },

    renderLayout() {
        return `
            <div id="epic-report-area" style="padding: 0 24px 24px;">
                ${this.renderFilters()}
                <div id="epic-report-body" style="margin-top: 20px; display: ${this.data ? 'block' : 'none'};">
                    ${this.data ? this.renderReport() : ''}
                </div>
                <div id="epic-report-empty" style="margin-top: 20px; display: ${this.data ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">📋</div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Seleccioná una épica y un período para generar el reporte.</p>
                </div>
            </div>
        `;
    },

    renderFilters() {
        const epicOptions = this.epics.length > 0
            ? this.epics.map(e => `<option value="${e.key}" ${this.selectedEpic === e.key ? 'selected' : ''}>${e.key} - ${e.summary}</option>`).join('')
            : '<option value="">Cargando épicas...</option>';

        return `
            <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end;">
                <div style="flex: 1; min-width: 200px;">
                    <label style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">ÉPICA</label>
                    <select id="er-epic-select" style="width: 100%; padding: 10px 12px; border-radius: 10px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-main); font-size: 0.85rem;">
                        <option value="">— Seleccionar Épica —</option>
                        ${epicOptions}
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">DESDE</label>
                    <input type="date" id="er-date-from" value="${this.dateFrom}" style="padding: 10px 12px; border-radius: 10px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-main); font-size: 0.85rem;">
                </div>
                <div>
                    <label style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">HASTA</label>
                    <input type="date" id="er-date-to" value="${this.dateTo}" style="padding: 10px 12px; border-radius: 10px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-main); font-size: 0.85rem;">
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-ghost btn-sm" id="er-refresh" title="Recargar" style="padding: 10px 14px;">🔄</button>
                    <button class="btn btn-primary btn-sm" id="er-generate" style="padding: 10px 20px; font-size: 0.8rem;">📊 Generar Reporte</button>
                    <button class="btn btn-ghost btn-sm" id="er-export" title="Exportar como PNG" style="padding: 10px 14px; ${!this.data ? 'opacity:0.4;pointer-events:none;' : ''}">📥</button>
                </div>
            </div>
        `;
    },

    renderReport() {
        if (!this.data || this.data.error) {
            return `
                <div style="background: var(--apple-red-soft); border: 1px solid var(--apple-red-soft); border-radius: var(--apple-radius-lg); padding: 24px; text-align: center;">
                    <p style="color: var(--error); font-weight: 600;">${this.data?.error || 'Error al cargar datos'}</p>
                </div>
            `;
        }

        const d = this.data;
        const { summary, statusBreakdown, priorityBreakdown, trend, avgAgeByStatus, agingBuckets, insights, healthScore, riskScore, riskLabel, sla, qaMetrics } = d;

        const riskColors = { low: '#10b981', moderate: '#f59e0b', high: '#ef4444' };
        const riskBgColors = { low: 'var(--apple-green-soft)', moderate: 'var(--apple-orange-soft)', high: 'var(--apple-red-soft)' };
        const insightColors = { success: { bg: 'var(--apple-green-soft)', border: 'var(--apple-green-soft)', text: 'var(--apple-green)' }, warning: { bg: 'var(--apple-orange-soft)', border: 'var(--apple-orange-soft)', text: 'var(--apple-orange)' }, critical: { bg: 'var(--apple-red-soft)', border: 'var(--apple-red-soft)', text: 'var(--apple-red)' } };

        // Helper: etiqueta con tooltip de ayuda. Lenguaje simple orientado a PM/cliente.
        const helpTip = (txt) => `<span title="${UI.escapeHTML(txt)}" style="display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 50%; background: var(--apple-fill); color: var(--apple-label-secondary); font-size: 0.6rem; font-weight: 800; margin-left: 4px; cursor: help; user-select: none;">?</span>`;

        const totalBugs = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);
        const maxTrend = Math.max(...trend.map(w => Math.max(w.created, w.resolved, w.backlogEnd)), 1);
        const chartHeight = 200;

        return `
            <div id="epic-report-exportable">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin: 0;">📋 Resumen de la Épica ${this.selectedEpic}</h2>
                    <p style="color: var(--text-muted); font-size: 0.8rem; margin: 4px 0 0;">Período: ${this.dateFrom} al ${this.dateTo}</p>
                </div>

                <!-- INSIGHTS (macOS Banner Style) -->
                ${insights && insights.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
                    ${insights.map(i => {
                        const c = insightColors[i.type] || insightColors.warning;
                        return `<div style="background: ${c.bg}; border-left: 4px solid ${c.text}; border-radius: 0 var(--apple-radius-sm) var(--apple-radius-sm) 0; padding: 12px 16px; display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 1rem;">${i.type === 'success' ? '✅' : i.type === 'critical' ? '🚨' : '⚠️'}</span>
                            <span style="color: ${c.text}; font-size: 0.85rem; font-weight: 500;">${i.text}</span>
                        </div>`;
                    }).join('')}
                </div>` : ''}

                <!-- TOP ROW: Health Score + Risk + Key Metrics (macOS Cards) -->
                <div style="display: grid; grid-template-columns: 140px 160px repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">

                    <!-- Health Score Gauge (macOS Glass Card) -->
                    <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--apple-shadow-sm);">
                        <div style="position: relative; width: 90px; height: 90px; margin-bottom: 10px;">
                            <svg width="90" height="90" viewBox="0 0 90 90" style="transform: rotate(-90deg);">
                                <circle cx="45" cy="45" r="38" fill="none" stroke="var(--apple-fill)" stroke-width="6"/>
                                <circle cx="45" cy="45" r="38" fill="none" stroke="${healthScore >= 70 ? 'var(--apple-green)' : healthScore >= 40 ? 'var(--apple-orange)' : 'var(--apple-red)'}" stroke-width="6"
                                    stroke-dasharray="${(healthScore / 100) * 238.76} 238.76" stroke-linecap="round"/>
                            </svg>
                            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                                <span style="font-size: 1.4rem; font-weight: 900; color: var(--apple-label);">${healthScore}</span>
                                <span style="font-size: 0.55rem; color: var(--apple-label-tertiary); font-weight: 600;">/ 100</span>
                            </div>
                        </div>
                        <div style="font-size: 0.65rem; font-weight: 800; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center;">Calidad General${helpTip('Puntaje de 0 a 100 que resume el estado general del testing de la épica. Combina la cantidad de bugs, su gravedad y qué tan rápido se resuelven.')}</div>
                    </div>

                    <!-- Release Risk (macOS Status Card) -->
                    <div style="background: ${riskBgColors[riskLabel]}; border: 1px solid ${riskBgColors[riskLabel]}; border-radius: var(--apple-radius-xl); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--apple-shadow-sm);">
                        <div style="font-size: 0.6rem; font-weight: 800; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: flex; align-items: center;">Riesgo de Entrega${helpTip('Indica qué tan seguro es liberar esta épica a producción. "Bajo" = listo, "Moderado" = revisar pendientes, "Alto" = no recomendable liberar.')}</div>
                        <div style="font-size: 1.5rem; font-weight: 900; color: ${riskColors[riskLabel]}; text-transform: uppercase;">${riskLabel}</div>
                        <div style="font-size: 0.75rem; color: var(--apple-label-secondary); margin-top: 4px;">Score: ${riskScore}/100</div>
                        <div style="margin-top: 10px; width: 100%; height: 6px; background: var(--apple-fill); border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; width: ${riskScore}%; background: ${riskColors[riskLabel]}; border-radius: 3px;"></div>
                        </div>
                    </div>

                    <!-- KPI: Total (macOS Glass Card) -->
                    <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); padding: 18px; text-align: center; box-shadow: var(--apple-shadow-sm); transition: transform 0.2s, box-shadow 0.2s;">
                        <div style="font-size: 2rem; font-weight: 900; color: var(--apple-blue);">${summary.total}</div>
                        <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 6px;">Total Bugs</div>
                    </div>

                    <!-- KPI: Resolution Rate (macOS Glass Card) -->
                    <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); padding: 18px; text-align: center; box-shadow: var(--apple-shadow-sm); transition: transform 0.2s, box-shadow 0.2s;">
                        <div style="font-size: 2rem; font-weight: 900; color: ${summary.bugResolutionRate >= 100 ? 'var(--apple-green)' : summary.bugResolutionRate >= 50 ? 'var(--apple-orange)' : 'var(--apple-red)'};">${summary.bugResolutionRate}%</div>
                        <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 6px; display: flex; align-items: center; justify-content: center;">% Bugs Resueltos${helpTip('Porcentaje de bugs reportados que ya fueron solucionados. 100% = todos resueltos.')}</div>
                        <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); margin-top: 2px;">${summary.resolved} de ${summary.total} resueltos</div>
                    </div>

                    <!-- KPI: Backlog Trend (macOS Glass Card) -->
                    <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); padding: 18px; text-align: center; box-shadow: var(--apple-shadow-sm); transition: transform 0.2s, box-shadow 0.2s;">
                        <div style="font-size: 2rem; font-weight: 900; color: ${summary.backlogDelta <= 0 ? 'var(--apple-green)' : 'var(--apple-red)'};">${summary.backlogDelta > 0 ? '+' : ''}${summary.backlogDelta}</div>
                        <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 6px; display: flex; align-items: center; justify-content: center;">Variación de Pendientes${helpTip('Cuántos bugs sin resolver se sumaron o restaron en el período. Positivo = se acumularon más, Negativo = se resolvieron más de los que entraron.')}</div>
                        <div style="font-size: 0.65rem; color: ${summary.backlogDeltaPercent > 0 ? 'var(--apple-red)' : 'var(--apple-green)'}; margin-top: 2px;">${summary.backlogDelta > 0 ? '+' : ''}${summary.backlogDeltaPercent}% vs. inicio</div>
                    </div>

                    <!-- KPI: Open (macOS Alert Card) -->
                    <div style="background: var(--apple-red-soft); border: 1px solid var(--apple-red-soft); border-radius: var(--apple-radius-xl); padding: 18px; text-align: center; box-shadow: var(--apple-shadow-sm);">
                        <div style="font-size: 2rem; font-weight: 900; color: var(--apple-red);">${summary.open}</div>
                        <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 6px; display: flex; align-items: center; justify-content: center;">Pendientes${helpTip('Bugs reportados que aún no fueron resueltos por el equipo.')}</div>
                        <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); margin-top: 2px;">aún sin resolver</div>
                    </div>
                </div>

                <!-- QA TESTING METRICS (macOS Card) -->
                ${qaMetrics ? `
                <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); padding: 24px; margin-bottom: 24px; box-shadow: var(--apple-shadow-sm);">
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px; display: flex; align-items: center;">🧪 Resultados del Testing${helpTip('Métricas del trabajo de testing ejecutado sobre la épica.')}</div>
                    
                    <!-- QA KPIs (macOS Glass Cards) -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px;">
                        <div style="text-align: center; padding: 16px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md);">
                            <div style="font-size: 1.8rem; font-weight: 900; color: var(--apple-blue);">${qaMetrics.totalTestCases}</div>
                            <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center;">Casos de Prueba${helpTip('Cantidad de pruebas diseñadas y ejecutadas en esta épica.')}</div>
                        </div>
                        <div style="text-align: center; padding: 16px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md);">
                            <div style="font-size: 1.8rem; font-weight: 900; color: ${qaMetrics.passRate >= 80 ? 'var(--apple-green)' : qaMetrics.passRate >= 50 ? 'var(--apple-orange)' : 'var(--apple-red)'};">${qaMetrics.passRate}%</div>
                            <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center;">% Aprobados${helpTip('Porcentaje de pruebas que pasaron sin encontrar errores.')}</div>
                        </div>
                        <div style="text-align: center; padding: 16px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md);">
                            <div style="font-size: 1.8rem; font-weight: 900; color: ${qaMetrics.defectDensity > 0.5 ? 'var(--apple-red)' : 'var(--apple-green)'};">${qaMetrics.defectDensity}%</div>
                            <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center;">Tasa de Defectos${helpTip('Porcentaje de pruebas que encontraron defectos. Más bajo = mejor calidad del entregable.')}</div>
                        </div>
                        <div style="text-align: center; padding: 16px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md);">
                            <div style="font-size: 1.8rem; font-weight: 900; color: var(--apple-blue);">${qaMetrics.totalExecutions}</div>
                            <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center;">Ciclos de Test${helpTip('Cantidad de corridas completas del set de pruebas en el período.')}</div>
                        </div>
                        <div style="text-align: center; padding: 16px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md);">
                            <div style="font-size: 1.8rem; font-weight: 900; color: var(--apple-orange);">${qaMetrics.executionTime.totalMinutes >= 60 ? Math.floor(qaMetrics.executionTime.totalMinutes / 60) + 'h ' + Math.round(qaMetrics.executionTime.totalMinutes % 60) + 'm' : Math.round(qaMetrics.executionTime.totalMinutes) + 'm'}</div>
                            <div style="font-size: 0.6rem; color: var(--apple-label-secondary); text-transform: uppercase; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center;">Tiempo Invertido${helpTip('Horas-hombre acumuladas en testing sobre la épica.')}</div>
                        </div>
                    </div>

                    <!-- Pass/Fail Bar + Defects by Severity (macOS Layout) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <!-- Pass/Fail Distribution -->
                        <div style="background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md); padding: 16px;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: var(--apple-label-secondary); text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 4px;">Resultados por Estado${helpTip('Cómo se distribuyen las corridas: aprobadas, fallidas, bloqueadas o pendientes.')}</div>
                            ${qaMetrics.totalExecutions > 0 ? `
                            <div style="display: flex; height: 20px; border-radius: var(--apple-radius-full); overflow: hidden; margin-bottom: 12px;">
                                ${qaMetrics.executionsByStatus.PASS > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.PASS / qaMetrics.totalExecutions * 100)}%; background: var(--apple-green);" title="PASS: ${qaMetrics.executionsByStatus.PASS}"></div>` : ''}
                                ${qaMetrics.executionsByStatus.FAIL > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.FAIL / qaMetrics.totalExecutions * 100)}%; background: var(--apple-red);" title="FAIL: ${qaMetrics.executionsByStatus.FAIL}"></div>` : ''}
                                ${qaMetrics.executionsByStatus.BLOCK > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.BLOCK / qaMetrics.totalExecutions * 100)}%; background: var(--apple-red);" title="BLOCK: ${qaMetrics.executionsByStatus.BLOCK}"></div>` : ''}
                                ${qaMetrics.executionsByStatus.BLOCKED > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.BLOCKED / qaMetrics.totalExecutions * 100)}%; background: var(--apple-orange);" title="BLOCKED: ${qaMetrics.executionsByStatus.BLOCKED}"></div>` : ''}
                                ${qaMetrics.executionsByStatus.PENDING > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.PENDING / qaMetrics.totalExecutions * 100)}%; background: var(--apple-label-secondary);" title="PENDING: ${qaMetrics.executionsByStatus.PENDING}"></div>` : ''}
                                ${qaMetrics.executionsByStatus.SKIP > 0 ? `<div style="width: ${(qaMetrics.executionsByStatus.SKIP / qaMetrics.totalExecutions * 100)}%; background: var(--apple-label-tertiary);" title="SKIP: ${qaMetrics.executionsByStatus.SKIP}"></div>` : ''}
                            </div>
                            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                                <span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-green);"></span> PASS: ${qaMetrics.executionsByStatus.PASS}</span>
                                <span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-red);"></span> FAIL: ${qaMetrics.executionsByStatus.FAIL}</span>
                                ${(qaMetrics.executionsByStatus.BLOCK || 0) > 0 ? `<span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-red);"></span> BLOCK: ${qaMetrics.executionsByStatus.BLOCK}</span>` : ''}
                                ${(qaMetrics.executionsByStatus.BLOCKED || 0) > 0 ? `<span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-orange);"></span> BLOCKED: ${qaMetrics.executionsByStatus.BLOCKED}</span>` : ''}
                                <span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-label-secondary);"></span> PENDING: ${qaMetrics.executionsByStatus.PENDING}</span>
                                ${(qaMetrics.executionsByStatus.SKIP || 0) > 0 ? `<span style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--apple-label);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--apple-label-tertiary);"></span> SKIP: ${qaMetrics.executionsByStatus.SKIP}</span>` : ''}
                            </div>
                            ` : '<div style="color: var(--apple-label-tertiary); font-size: 0.8rem; text-align: center; padding: 24px;">Sin ejecuciones registradas</div>'}
                        </div>

                        <!-- Defects by Severity (macOS List) -->
                        <div style="background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md); padding: 16px;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: var(--apple-label-secondary); text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 4px;">Defectos por Gravedad${helpTip('Distribución de bugs según su impacto: Crítica/Alta (bloqueantes), Media, Baja (cosméticos).')}</div>
                            ${qaMetrics.defectsFound > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${Object.entries(qaMetrics.defectsBySeverity).map(([severity, count]) => {
                                    const pct = (count / qaMetrics.defectsFound * 100);
                                    const colors = { 'Crítica': 'var(--apple-red)', 'Alta': 'var(--apple-orange)', 'Media': 'var(--apple-blue)', 'Baja': 'var(--apple-green)' };
                                    return `
                                    <div>
                                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                                            <span style="color: var(--apple-label); font-weight: 600;">${severity}</span>
                                            <span style="color: var(--apple-label-secondary);">${count} (${pct.toFixed(0)}%)</span>
                                        </div>
                                        <div style="height: 6px; background: var(--apple-fill); border-radius: var(--apple-radius-full); overflow: hidden;">
                                            <div style="height: 100%; width: ${pct}%; background: ${colors[severity] || 'var(--apple-label-tertiary)'}; border-radius: var(--apple-radius-full);"></div>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                            ` : `<div style="color: var(--apple-label-tertiary); font-size: 0.8rem; text-align: center; padding: 24px;">${qaMetrics.totalTestCases > 0 ? 'Sin defectos registrados' : 'Sin datos de testing'}</div>`}
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- SECOND ROW: SLA + Aging Buckets + Trend Chart -->
                <div style="display: grid; grid-template-columns: 280px 1fr 1fr; gap: 16px; margin-bottom: 24px;">

                    <!-- SLA Advanced -->
                    ${sla ? `
                    <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 4px;">⏱️ Tiempo Objetivo: ${sla.target} días${helpTip('Plazo objetivo para resolver un bug. Mide qué tan rápido el equipo resuelve los pendientes.')}</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px;">
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 900; color: var(--brand);">${sla.median}</div>
                                <div style="font-size: 0.6rem; color: var(--text-muted);">Mediana (días)</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 900; color: var(--apple-orange);">${sla.p90}</div>
                                <div style="font-size: 0.6rem; color: var(--text-muted);">Peor caso (días)</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 1.3rem; font-weight: 900; color: ${sla.compliance >= 80 ? '#10b981' : sla.compliance >= 50 ? '#f59e0b' : '#ef4444'};">${sla.compliance}%</div>
                                <div style="font-size: 0.6rem; color: var(--text-muted);">Cumplimiento</div>
                            </div>
                        </div>
                        <div style="height: 8px; background: var(--bg-main); border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                            <div style="height: 100%; width: ${sla.compliance}%; background: ${sla.compliance >= 80 ? '#10b981' : sla.compliance >= 50 ? '#f59e0b' : '#ef4444'}; border-radius: 4px;"></div>
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center;">${sla.withinSLA} de ${sla.total} bugs resueltos dentro del plazo${helpTip('Cantidad de bugs resueltos antes de vencer el plazo.')}</div>
                    </div>
                    ` : ''}

                    <!-- Aging Buckets -->
                    ${agingBuckets ? `
                    <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 4px;">⏳ Antigüedad de Pendientes${helpTip('Cuánto tiempo llevan abiertos los bugs sin resolver. Rangos: 0-3d (fresco), 4-7d (alerta), 8-15d (riesgo), +15d (crítico).')}</div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${Object.entries(agingBuckets).map(([bucket, count]) => {
                                const pct = summary.open > 0 ? (count / summary.open * 100) : 0;
                                const color = bucket === '+15d' ? '#ef4444' : bucket === '8-15d' ? '#f59e0b' : bucket === '4-7d' ? '#3b82f6' : '#10b981';
                                return `
                                <div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 3px;">
                                        <span style="color: var(--text-main); font-weight: 600;">${bucket}</span>
                                        <span style="color: var(--text-muted);">${count} (${pct.toFixed(0)}%)</span>
                                    </div>
                                    <div style="height: 10px; background: var(--bg-main); border-radius: 5px; overflow: hidden;">
                                        <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 5px; transition: width 0.5s ease;"></div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Backlog Evolution Chart -->
                    <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 4px;">📈 Evolución de Pendientes${helpTip('Cómo varió la cantidad de bugs pendientes semana a semana. La línea azul muestra el total acumulado.')}</div>
                        <div style="position: relative; height: ${chartHeight}px;">
                            <svg width="100%" height="${chartHeight}" style="overflow: visible;">
                                ${this.renderTrendSVG(trend, maxTrend, chartHeight)}
                            </svg>
                        </div>
                        <div style="display: flex; gap: 16px; margin-top: 10px; justify-content: center;">
                            <span style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; color: var(--apple-label-tertiary);"><span style="width: 10px; height: 10px; border-radius: 2px; background: var(--apple-red); display: inline-block;"></span> Creados</span>
                            <span style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; color: var(--apple-label-tertiary);"><span style="width: 10px; height: 10px; border-radius: 2px; background: var(--apple-green); display: inline-block;"></span> Resueltos</span>
                            <span style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; color: var(--text-muted);"><span style="width: 10px; height: 10px; border-radius: 50%; background: var(--brand); display: inline-block;"></span> Backlog</span>
                        </div>
                    </div>
                </div>

                <!-- THIRD ROW: Status Breakdown + Priority + Age by Status + Weekly Table -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">

                    <!-- Status Breakdown -->
                    <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 4px;">📊 Distribución por Estado${helpTip('En qué estado se encuentra cada bug: To Do (pendiente), In Progress (en curso), In Review (revisión), Done (resuelto).')}</div>
                        ${Object.entries(statusBreakdown).filter(([_, v]) => v > 0).map(([s, count]) => {
                            const pct = totalBugs > 0 ? (count / totalBugs * 100) : 0;
                            const colors = { 'To Do': '#6b7280', 'In Progress': '#f59e0b', 'In Review': '#3b82f6', 'Done': '#10b981', 'Other': '#9ca3af' };
                            return `
                            <div style="margin-bottom: 10px;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                                    <span style="color: var(--text-main); font-weight: 600;">${s}</span>
                                    <span style="color: var(--text-muted);">${count} (${pct.toFixed(0)}%)</span>
                                </div>
                                <div style="height: 7px; background: var(--bg-main); border-radius: 4px; overflow: hidden;">
                                    <div style="height: 100%; width: ${pct}%; background: ${colors[s] || '#9ca3af'}; border-radius: 4px;"></div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>

                    <!-- Age by Status + Priority -->
                    <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 4px;">⏱️ Días Promedio por Estado${helpTip('Cuántos días en promedio lleva un bug en cada estado antes de avanzar.')}</div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
                            ${Object.entries(avgAgeByStatus).filter(([_, v]) => v > 0).map(([k, v]) => `
                                <div style="text-align: center; min-width: 80px;">
                                    <div style="font-size: 1.4rem; font-weight: 900; color: ${v > 7 ? '#ef4444' : v > 3 ? '#f59e0b' : '#10b981'};">${v}</div>
                                    <div style="font-size: 0.6rem; color: var(--text-muted);">${k}</div>
                                </div>
                            `).join('')}
                        </div>
                        ${Object.keys(priorityBreakdown).length > 0 ? `
                        <div style="border-top: 1px solid var(--border); padding-top: 14px;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">Por Prioridad${helpTip('Cantidad de bugs según urgencia: High/Medium.')}</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${Object.entries(priorityBreakdown).map(([k, v]) => `<span style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 0.7rem; color: var(--text-main);">${k}: <strong>${v}</strong></span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Weekly Table -->
                ${trend.length > 0 ? `
                <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; overflow-x: auto;">
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; display: flex; align-items: center; gap: 4px;">📅 Resumen Semanal${helpTip('Comparación semana a semana: cuántos bugs se reportaron, cuántos se resolvieron y cuál fue el saldo.')}</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="text-align: left; padding: 8px 12px; color: var(--text-muted); font-weight: 700;">Semana</th>
                                <th style="text-align: right; padding: 8px 12px; color: var(--apple-red); font-weight: 700;">Reportados</th>
                                <th style="text-align: right; padding: 8px 12px; color: var(--apple-green); font-weight: 700;">Resueltos</th>
                                <th style="text-align: right; padding: 8px 12px; color: var(--brand); font-weight: 700;">Pendientes al Cierre</th>
                                <th style="text-align: right; padding: 8px 12px; font-weight: 700;">Variación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trend.map(w => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 8px 12px; color: var(--text-main);">${w.label}</td>
                                    <td style="padding: 8px 12px; text-align: right; color: var(--apple-red); font-weight: 600;">${w.created}</td>
                                    <td style="padding: 8px 12px; text-align: right; color: var(--apple-green); font-weight: 600;">${w.resolved}</td>
                                    <td style="padding: 8px 12px; text-align: right; color: var(--brand); font-weight: 700;">${w.backlogEnd}</td>
                                    <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: ${(w.delta || 0) <= 0 ? '#10b981' : '#ef4444'};">${w.delta > 0 ? '+' : ''}${w.delta || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}
            </div>
        `;
    },

    renderTrendSVG(trend, maxTrend, chartHeight) {
        if (!trend || trend.length === 0) return '';

        const padding = { top: 10, right: 10, bottom: 10, left: 10 };
        const width = 100;
        const height = chartHeight;
        const availW = width - padding.left - padding.right;
        const availH = height - padding.top - padding.bottom;
        const slotW = availW / trend.length;
        const barW = slotW * 0.28;

        let rects = [];
        let circles = [];
        let linePath = '';

        trend.forEach((w, i) => {
            const x = padding.left + i * slotW + slotW / 2;
            const createdH = (w.created / maxTrend) * availH;
            const resolvedH = (w.resolved / maxTrend) * availH;
            const backlogH = (w.backlogEnd / maxTrend) * availH;

            rects.push(`<rect x="${x - barW - 1}" y="${padding.top + availH - createdH}" width="${barW}" height="${createdH}" fill="#ef4444" opacity="0.85" rx="1"/>`);
            rects.push(`<rect x="${x + 1}" y="${padding.top + availH - resolvedH}" width="${barW}" height="${resolvedH}" fill="#10b981" opacity="0.85" rx="1"/>`);

            const backlogY = padding.top + availH - backlogH;
            circles.push(`<circle cx="${x}" cy="${backlogY}" r="3" fill="var(--brand)"/>`);
            if (i === 0) linePath += `M ${x} ${backlogY}`;
            else linePath += ` L ${x} ${backlogY}`;
        });

        return `${rects.join('')}<path d="${linePath}" stroke="var(--brand)" stroke-width="1.5" fill="none" opacity="0.8"/>${circles.join('')}`;
    },

    bindEvents(container) {
        container.querySelector('#er-epic-select')?.addEventListener('change', e => {
            this.selectedEpic = e.target.value;
        });

        container.querySelector('#er-date-from')?.addEventListener('change', e => {
            this.dateFrom = e.target.value;
        });

        container.querySelector('#er-date-to')?.addEventListener('change', e => {
            this.dateTo = e.target.value;
        });

        container.querySelector('#er-refresh')?.addEventListener('click', async () => {
            await this.loadInitial();
        });

        container.querySelector('#er-generate')?.addEventListener('click', async () => {
            await this.loadReport(container);
        });

        container.querySelector('#er-export')?.addEventListener('click', () => {
            this.exportPNG();
        });
    },

    async loadInitial() {
        const projectId = Store.state.activeProjectId;
        if (!projectId) return;

        UI.showLoading();
        try {
            const ctx = await ApiService.getJiraContext(projectId);
            if (ctx?.error) {
                if (ctx.error.includes('token')) {
                    UI.toast('🔑 Configura tu token de Jira para cargar épicas', 'warn');
                }
                this.epics = [];
            } else {
                this.epics = ctx?.epics || [];
            }
        } catch (err) {
            this.epics = [];
        }
        UI.hideLoading();

        const select = document.querySelector('#er-epic-select');
        if (select) {
            if (this.epics.length === 0) {
                select.innerHTML = '<option value="">— Sin épicas disponibles —</option>';
            } else {
                select.innerHTML = '<option value="">— Seleccionar Épica —</option>' +
                    this.epics.map(e => `<option value="${e.key}">${e.key} - ${e.summary}</option>`).join('');
            }
        }
    },

    async loadReport(container) {
        if (!this.selectedEpic) {
            UI.toast('Seleccioná una épica primero', 'warn');
            return;
        }
        if (!this.dateFrom || !this.dateTo) {
            UI.toast('Completá el período de fechas', 'warn');
            return;
        }

        const projectId = Store.state.activeProjectId;
        if (!projectId) return;

        this.loading = true;
        UI.showLoading();
        try {
            this.data = await ApiService.getJiraEpicStats(projectId, this.selectedEpic, this.dateFrom, this.dateTo);

            const bodyEl = container.querySelector('#epic-report-body');
            const emptyEl = container.querySelector('#epic-report-empty');
            const filtersEl = container.querySelector('#epic-report-area > div:first-child');

            bodyEl.innerHTML = this.renderReport();
            bodyEl.style.display = 'block';
            emptyEl.style.display = 'none';
            filtersEl.querySelector('#er-export').style.opacity = '';
            filtersEl.querySelector('#er-export').style.pointerEvents = '';
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();
        this.loading = false;
    },

    exportPNG() {
        const el = document.querySelector('#epic-report-exportable');
        if (!el) return;

        if (!window.html2canvas) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => this.doExport(el);
            document.head.appendChild(script);
        } else {
            this.doExport(el);
        }
    },

    doExport(el) {
        window.html2canvas(el, { scale: 2, backgroundColor: '#0f1117' }).then(canvas => {
            const link = document.createElement('a');
            link.download = `reporte-epica-${this.selectedEpic}-${this.dateFrom}-${this.dateTo}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            UI.toast('📥 Reporte exportado');
        }).catch(err => {
            UI.toast('Error al exportar: ' + err.message, 'error');
        });
    }
};