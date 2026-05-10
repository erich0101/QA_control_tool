import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { DashboardJiraDaily } from './dashboard-jira-daily.js';
import { DashboardJiraTeam } from './dashboard-jira-team.js';

export const DashboardTab = {
    stats: [],
    overview: null,
    activeSubTab: 'overview', // 'overview', 'performance', 'team'

    async render(container) {
        const { activeProjectId } = Store.state;

        if (!activeProjectId) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <h3>Dashboard de Control</h3>
                    <p>Selecciona un proyecto para ver las métricas.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="tab-toolbar" style="padding-bottom: 0;">
                <div class="tab-toolbar-left">
                    <span class="tab-toolbar-title">Dashboard del Proyecto</span>
                </div>
            </div>

            <div class="sub-tab-bar" style="display: flex; gap: 32px; padding: 0 24px; border-bottom: 1px solid var(--border); background: var(--bg-surface);">
                <div class="sub-tab-item ${this.activeSubTab === 'overview' ? 'active' : ''}" data-subtab="overview" style="padding: 12px 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; color: ${this.activeSubTab === 'overview' ? 'var(--brand)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeSubTab === 'overview' ? 'var(--brand)' : 'transparent'};">Vista General</div>
                <div class="sub-tab-item ${this.activeSubTab === 'performance' ? 'active' : ''}" data-subtab="performance" style="padding: 12px 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; color: ${this.activeSubTab === 'performance' ? 'var(--brand)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeSubTab === 'performance' ? 'var(--brand)' : 'transparent'};">Control & Tiempos</div>
                <div class="sub-tab-item ${this.activeSubTab === 'daily' ? 'active' : ''}" data-subtab="daily" style="padding: 12px 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; color: ${this.activeSubTab === 'daily' ? 'var(--brand)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeSubTab === 'daily' ? 'var(--brand)' : 'transparent'};">Jira & Daily</div>
                <div class="sub-tab-item ${this.activeSubTab === 'team' ? 'active' : ''}" data-subtab="team" style="padding: 12px 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; color: ${this.activeSubTab === 'team' ? 'var(--brand)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeSubTab === 'team' ? 'var(--brand)' : 'transparent'};">Productividad</div>
            </div>
            <div id="dashboard-content-area"></div>
        `;

        const contentArea = container.querySelector('#dashboard-content-area');
        if (this.activeSubTab === 'daily') {
            await DashboardJiraDaily.render(contentArea);
        } else if (this.activeSubTab === 'team') {
            await DashboardJiraTeam.render(contentArea);
        } else {
            contentArea.innerHTML = await this.renderSubTabContent(activeProjectId);
        }

        this.bindEvents(container);
    },

    async renderSubTabContent(projectId) {
        if (this.activeSubTab === 'overview') {
            return await this.renderOverviewStats(projectId);
        } else if (this.activeSubTab === 'performance') {
            return await this.renderPerformanceStats(projectId);
        } else if (this.activeSubTab === 'daily') {
            const tempDiv = document.createElement('div');
            await DashboardJiraDaily.render(tempDiv);
            return tempDiv.innerHTML;
        } else {
            return `
                <div style="padding: 40px; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 16px;">👥</div>
                    <h3 style="color: var(--text-main);">Métricas de Equipo</h3>
                    <p style="color: var(--text-muted);">Próximamente: Carga de trabajo por tester y efectividad de hallazgos.</p>
                </div>
            `;
        }
    },

    async renderOverviewStats(projectId) {
        UI.showLoading();
        try {
            this.overview = await ApiService.getOverviewStats(projectId);
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        if (!this.overview) return '<div class="empty-state">Error cargando datos.</div>';

        const { summary, statuses, coverage } = this.overview;
        const totalTC = summary.total_tc || 1;
        const passData = statuses.find(s => s.status === 'OK' || s.status === 'PASS')?.count || 0;
        const failData = statuses.find(s => s.status === 'FAIL')?.count || 0;
        const warnData = statuses.find(s => s.status === 'WARNING')?.count || 0;
        const pendingData = statuses.find(s => s.status === 'PENDING')?.count || 0;

        const passPct = Math.round((passData / totalTC) * 100);

        return `
            <div style="padding: 24px; display: flex; flex-direction: column; gap: 32px;">
                <!-- TOP KPI Row -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;">
                    <div style="background: var(--bg-surface); padding: 20px; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Casos de Uso</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--text-main); margin-top: 8px;">${summary.total_cu}</div>
                    </div>
                    <div style="background: var(--bg-surface); padding: 20px; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Total Test Cases</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--brand); margin-top: 8px;">${summary.total_tc}</div>
                    </div>
                    <div style="background: var(--bg-surface); padding: 20px; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Cobertura OK</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--ok); margin-top: 8px;">${passPct}%</div>
                    </div>
                    <div style="background: var(--bg-surface); padding: 20px; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Riesgo Detectado</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--fail); margin-top: 8px;">${Math.round((failData / totalTC) * 100)}%</div>
                    </div>
                </div>

                <!-- Main Grid: Status vs Coverage -->
                <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 32px;">
                    <!-- Status Breakdown Card -->
                    <div style="background: var(--bg-surface); border-radius: 20px; border: 1px solid var(--border); padding: 24px;">
                        <h3 style="font-size: 0.9rem; font-weight: 800; margin-bottom: 24px; color: var(--text-main);">ESTADO GLOBAL DE CALIDAD</h3>
                        
                        <div style="display: flex; flex-direction: column; gap: 20px;">
                            ${this.renderStatusRow('PASS / OK', passData, totalTC, 'var(--ok)')}
                            ${this.renderStatusRow('FAILED', failData, totalTC, 'var(--fail)')}
                            ${this.renderStatusRow('WARNING', warnData, totalTC, 'var(--warning)')}
                            ${this.renderStatusRow('PENDING', pendingData, totalTC, 'var(--text-muted)')}
                        </div>

                        <div style="margin-top: 32px; padding: 20px; background: var(--bg-main); border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Índice de Salud del Proyecto</div>
                            <div style="font-size: 2.2rem; font-weight: 900; color: ${passPct > 80 ? 'var(--ok)' : passPct > 50 ? 'var(--warning)' : 'var(--fail)'}; margin: 8px 0;">${passPct}%</div>
                            <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);">${passPct > 80 ? 'Excelente Calidad' : passPct > 50 ? 'Calidad Aceptable' : 'Riesgo Crítico'}</div>
                        </div>
                    </div>

                    <!-- Coverage by CU List -->
                    <div style="background: var(--bg-surface); border-radius: 20px; border: 1px solid var(--border); padding: 24px;">
                        <h3 style="font-size: 0.9rem; font-weight: 800; margin-bottom: 24px; color: var(--text-main);">COBERTURA POR CASO DE USO</h3>
                        <div style="display: flex; flex-direction: column; gap: 16px; max-height: 400px; overflow-y: auto; padding-right: 8px;">
                            ${coverage.map(cu => {
                                const cuPct = cu.total > 0 ? Math.round((cu.ok / cu.total) * 100) : 0;
                                return `
                                    <div style="display: flex; flex-direction: column; gap: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">${UI.escapeHTML(cu.title)}</span>
                                            <span style="font-size: 0.75rem; font-weight: 800; color: ${cuPct === 100 ? 'var(--ok)' : 'var(--text-main)'};">${cuPct}%</span>
                                        </div>
                                        <div style="height: 6px; background: var(--bg-main); border-radius: 3px; overflow: hidden;">
                                            <div style="height: 100%; background: ${cuPct === 100 ? 'var(--ok)' : 'var(--brand)'}; width: ${cuPct}%; border-radius: 3px; transition: width 0.8s ease-out;"></div>
                                        </div>
                                        <div style="font-size: 0.6rem; color: var(--text-muted); text-align: right;">${cu.ok} de ${cu.total} tests completados</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderStatusRow(label, value, total, color) {
        const pct = Math.round((value / total) * 100);
        return `
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">${label}</span>
                    <span style="font-size: 0.75rem; font-weight: 800; color: ${color};">${value} (${pct}%)</span>
                </div>
                <div style="height: 8px; background: var(--bg-main); border-radius: 4px; overflow: hidden; border: 1px solid var(--border);">
                    <div style="height: 100%; background: ${color}; width: ${pct}%; border-radius: 4px; transition: width 1s ease-in-out;"></div>
                </div>
            </div>
        `;
    },

    async renderPerformanceStats(projectId) {
        UI.showLoading();
        try {
            const res = await ApiService.getSuiteStats(projectId);
            this.stats = res.stats || [];
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        return `
            <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr; gap: 24px; padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 0.85rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Métricas de Rendimiento y Ciclo de Vida</h2>
                    <button class="btn btn-ghost btn-sm" id="btn-refresh-stats">🔄 Recargar Datos</button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                    <div class="kpi-card" style="background: var(--bg-surface); padding: 24px; border-radius: 16px; border: 1px solid var(--border); text-align: center;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Total Ejecuciones</div>
                        <div style="font-size: 2rem; font-weight: 900; color: var(--brand);">${this.stats.reduce((acc, s) => acc + Number(s.total_runs || 0), 0)}</div>
                    </div>
                    <div class="kpi-card" style="background: var(--bg-surface); padding: 24px; border-radius: 16px; border: 1px solid var(--border); text-align: center;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Tiempo Total</div>
                        <div style="font-size: 2rem; font-weight: 900; color: var(--ok);">${this.formatTime(this.stats.reduce((acc, s) => acc + Number(s.total_minutes || 0), 0))}</div>
                    </div>
                    <div class="kpi-card" style="background: var(--bg-surface); padding: 24px; border-radius: 16px; border: 1px solid var(--border); text-align: center;">
                        <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Promedio por Suite</div>
                        <div style="font-size: 2rem; font-weight: 900; color: var(--warning);">${this.formatTime(this.stats.length > 0 ? this.stats.reduce((acc, s) => acc + Number(s.avg_minutes || 0), 0) / this.stats.length : 0)}</div>
                    </div>
                </div>

                <div style="background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border); overflow: hidden;">
                    <table class="stats-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--bg-main); text-align: left;">
                                <th style="padding: 12px 24px; font-size: 0.7rem; color: var(--text-muted);">SUITE</th>
                                <th style="padding: 12px 24px; font-size: 0.7rem; color: var(--text-muted); text-align: center;">EJECUCIONES</th>
                                <th style="padding: 12px 24px; font-size: 0.7rem; color: var(--text-muted); text-align: center;">PROMEDIO</th>
                                <th style="padding: 12px 24px; font-size: 0.7rem; color: var(--text-muted); text-align: center;">TOTAL ACUMULADO</th>
                                <th style="padding: 12px 24px; font-size: 0.7rem; color: var(--text-muted);">RENDIMIENTO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.stats.map(s => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 16px 24px;">
                                        <div style="font-weight: 700; color: var(--text-main);">${UI.escapeHTML(s.title)}</div>
                                        <div style="font-size: 0.65rem; color: var(--text-muted);">ID: ${s.id}</div>
                                    </td>
                                    <td style="padding: 16px 24px; text-align: center; font-weight: 800; color: var(--brand);">${s.total_runs}</td>
                                    <td style="padding: 16px 24px; text-align: center; color: var(--warning); font-family: monospace;">${this.formatTime(s.avg_minutes)}</td>
                                    <td style="padding: 16px 24px; text-align: center; color: var(--ok); font-family: monospace; font-weight: 700;">${this.formatTime(s.total_minutes)}</td>
                                    <td style="padding: 16px 24px; width: 200px;">
                                        <div style="height: 6px; background: var(--bg-main); border-radius: 3px; overflow: hidden; border: 1px solid var(--border);">
                                            <div style="height: 100%; background: var(--brand); width: ${Math.min(100, (s.total_minutes / (this.stats[0]?.total_minutes || 1)) * 100)}%; opacity: 0.7;"></div>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="background: linear-gradient(135deg, var(--brand)11, transparent); border: 1px solid var(--brand)33; padding: 24px; border-radius: 16px; display: flex; align-items: center; gap: 20px;">
                    <div style="font-size: 2rem;">💡</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                        <strong>Análisis de Time-to-Quality:</strong> Estos datos representan la eficiencia del ciclo completo. Si el promedio de una suite aumenta, considere dividirla en HU más pequeñas o revisar la complejidad del entorno.
                    </div>
                </div>
            </div>
        `;
    },

    formatTime(minutes) {
        if (!minutes || minutes === 0) return '0m';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h}h ${m}m`;
    },

    bindEvents(container) {
        container.querySelectorAll('.sub-tab-item').forEach(item => {
            item.addEventListener('click', () => {
                this.activeSubTab = item.dataset.subtab;
                this.render(container);
            });
        });

        container.querySelector('#btn-refresh-stats')?.addEventListener('click', () => {
            this.render(container);
        });
    }
};
