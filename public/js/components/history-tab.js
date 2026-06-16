import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { ExecutionTab } from './execution-tab.js';
import { Modals } from './modals.js';
import { modalManager } from '../utils/modal-manager.js';

export const HistoryTab = {
    runs: [],
    bugs: [],
    currentTab: 'runs', // 'runs' | 'bugs'
    selectedRunIds: new Set(),

    async render(container) {
        const scrollPos = container.scrollTop;
        const { activeProjectId } = Store.state;
        if (!activeProjectId) {
            container.innerHTML = '<div class="empty-state"><h3>Historial de Ejecución</h3><p>Selecciona un proyecto para ver el historial.</p></div>';
            return;
        }

        UI.showLoading();
        try {
            if (this.currentTab === 'runs') {
                const res = await ApiService.getHistory(activeProjectId);
                this.runs = res.runs || [];
            } else {
                const res = await ApiService.getProjectDefects(activeProjectId);
                this.bugs = res.defects || [];

                const jiraRes = await ApiService.getDefectsJiraStatus(activeProjectId);
                const jiraStatuses = jiraRes.statuses || {};
                for (const bug of this.bugs) {
                    if (bug.jira_key && jiraStatuses[bug.jira_key]) {
                        bug.jira_status = jiraStatuses[bug.jira_key].status;
                        bug.jira_statusCategory = jiraStatuses[bug.jira_key].statusCategory;
                    }
                }
            }
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        container.innerHTML = `
            <div style="padding: 20px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated);">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 0.85rem; font-weight: 700; color: var(--apple-label);">${this.currentTab === 'runs' ? '📋 Ciclos de Ejecución' : '🐞 Historial de Defectos'}</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);">${this.currentTab === 'runs' ? this.runs.length + ' ciclos' : this.bugs.length + ' bugs'}</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${this.currentTab === 'runs' && this.selectedRunIds.size >= 2 ? `
                            <button class="btn btn-primary btn-sm" id="btn-consolidated-report" style="padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 600;">
                                📊 Reporte Consolidado (${this.selectedRunIds.size})
                            </button>
                        ` : ''}
                        <button class="btn btn-ghost btn-sm" id="btn-refresh-history" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🔄 Recargar</button>
                    </div>
                </div>

                <div style="display: flex; gap: 4px; background: var(--apple-fill); padding: 3px; border-radius: 20px;">
                    <button class="sub-tab-btn ${this.currentTab === 'runs' ? 'active' : ''}" data-tab="runs" style="padding: 6px 16px; border-radius: 18px; border: none; background: ${this.currentTab === 'runs' ? 'var(--apple-blue)' : 'transparent'}; color: ${this.currentTab === 'runs' ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">
                        📋 Ejecuciones
                    </button>
                    <button class="sub-tab-btn ${this.currentTab === 'bugs' ? 'active' : ''}" data-tab="bugs" style="padding: 6px 16px; border-radius: 18px; border: none; background: ${this.currentTab === 'bugs' ? 'var(--apple-blue)' : 'transparent'}; color: ${this.currentTab === 'bugs' ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">
                        🐞 Bugs & Defectos
                    </button>
                </div>
            </div>

            <div class="tt-container" style="padding: 16px 24px;">
                ${this.currentTab === 'runs' ? this.renderRunsView() : this.renderBugsView()}
            </div>
        `;

        this.bindEvents(container);
        container.scrollTop = scrollPos;
    },

    renderRunsView() {
        const allSelected = this.runs.length > 0 && this.runs.every(r => this.selectedRunIds.has(r.id));
        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <table class="tt-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--apple-fill);">
                            <th style="width: 40px; padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);"><input type="checkbox" id="select-all-runs" ${allSelected ? 'checked' : ''}></th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">ID</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Test Suite</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Inicio</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Fin</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Duración</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Tester</th>
                            <th style="padding: 10px 12px; text-align: center; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Resultado</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.runs.length === 0 ? `<tr><td colspan="9" style="text-align: center; padding: 40px; color: var(--apple-label-tertiary);">No hay ejecuciones finalizadas aún.</td></tr>` : ''}
                        ${this.runs.map(run => this.renderRunRow(run)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderBugsView() {
        const team = Store.state.team || [];
        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <table class="tt-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--apple-fill);">
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">ID</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Defecto / Título</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Contexto</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Severidad</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Estado</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Reportado por</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Fecha</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--apple-separator);">Detalle</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.bugs.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--apple-label-tertiary);">No hay bugs registrados en este proyecto.</td></tr>` : ''}
                        ${this.bugs.map(bug => `
                            <tr style="border-bottom: 1px solid var(--apple-separator);">
                                <td style="padding: 12px; font-size: 0.75rem; color: var(--apple-label-tertiary);">#${bug.id}</td>
                                <td style="padding: 12px;">
                                    <div style="font-weight: 600; color: var(--apple-label); font-size: 0.85rem;">${UI.escapeHTML(bug.title)}</div>
                                    <div style="font-size: 0.7rem; color: var(--apple-label-tertiary); margin-top: 2px; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHTML(bug.description || 'Sin descripción.')}</div>
                                </td>
                                <td style="padding: 12px;">
                                    <div style="font-size: 0.75rem; color: var(--apple-blue); font-weight: 600;">${UI.escapeHTML(bug.tc_key)}</div>
                                    <div style="font-size: 0.7rem; color: var(--apple-label-secondary);">${UI.escapeHTML(bug.tc_title)}</div>
                                </td>
                                <td style="padding: 12px;">
                                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; background: ${bug.severity === 'Crítica' || bug.severity === 'Alta' ? 'rgba(255,59,48,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.severity === 'Crítica' || bug.severity === 'Alta' ? 'var(--apple-red)' : 'var(--apple-orange)'};">
                                        ${UI.escapeHTML(bug.severity)}
                                    </span>
                                </td>
                                <td style="padding: 12px;">
                                    ${bug.jira_key ? `
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <a href="${UI.escapeHTML(bug.jira_url)}" target="_blank" rel="noopener" style="font-size: 0.7rem; font-weight: 600; color: var(--apple-blue); text-decoration: none;" title="Abrir en JIRA">
                                                ${UI.escapeHTML(bug.jira_key)}
                                            </a>
                                            ${bug.jira_status ? `
                                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.6rem; font-weight: 600; background: ${bug.jira_statusCategory === 'Done' ? 'rgba(52,199,89,0.1)' : bug.jira_statusCategory === 'In Progress' ? 'rgba(0,122,255,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.jira_statusCategory === 'Done' ? 'var(--apple-green)' : bug.jira_statusCategory === 'In Progress' ? 'var(--apple-blue)' : 'var(--apple-orange)'};">
                                                    ${UI.escapeHTML(bug.jira_status)}
                                                </span>
                                            ` : ''}
                                        </div>
                                    ` : `
                                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; background: ${bug.status === 'FIXED' ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.status === 'FIXED' ? 'var(--apple-green)' : 'var(--apple-orange)'};">
                                            ${UI.escapeHTML(bug.status)}
                                        </span>
                                    `}
                            </td>
                            <td style="padding: 12px;">
                                <div style="font-size: 0.78rem; color: var(--apple-label);">${UI.escapeHTML(bug.tester_name || '—')}</div>
                            </td>
                            <td style="padding: 12px; font-size: 0.72rem; color: var(--apple-label-tertiary);">
                                ${new Date(bug.created_at).toLocaleDateString()}
                            </td>
                            <td style="padding: 12px; text-align: right;">
                                <button class="btn btn-ghost btn-sm btn-view-bug-details" data-id="${bug.id}" title="Ver Detalle" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🔍 Ver</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    },

    renderRunRow(run) {
        const start = new Date(run.started_at);
        const end = new Date(run.finished_at);
        const duration = this.formatDuration(start, end);
        const { pass, fail, warn, block, skip, total } = run.stats;
        const passPct = (pass/total)*100;
        const failPct = (fail/total)*100;
        const warnPct = (warn/total)*100;
        const blockPct = (block/total)*100;
        const skipPct = (skip/total)*100;

        return `
            <tr style="border-bottom: 1px solid var(--apple-separator);">
                <td style="padding: 12px; text-align: center;"><input type="checkbox" class="run-checkbox" data-id="${run.id}" ${this.selectedRunIds.has(run.id) ? 'checked' : ''}></td>
                <td style="padding: 12px; font-size: 0.75rem; color: var(--apple-label-tertiary);">#${run.id}</td>
                <td style="padding: 12px;">
                    <div style="font-weight: 600; color: var(--apple-label); font-size: 0.85rem;">${UI.escapeHTML(run.suite_title)}</div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.6rem; font-weight: 600; background: var(--apple-fill); color: var(--apple-label-secondary);">
                            ${run.run_type === 'SMOKE' ? '💨' : ''}${run.run_type === 'REGRESSION' ? '🔄' : ''}${run.run_type === 'INTEGRATION' ? '🔗' : ''}${run.run_type === 'EXPLORATORY' ? '🔍' : ''}${run.run_type === 'RETEST' ? '🔁' : ''} ${UI.escapeHTML(run.run_type)}
                        </span>
                    </div>
                </td>
                <td style="padding: 12px; font-size: 0.78rem; color: var(--apple-label-secondary);">${start.toLocaleString()}</td>
                <td style="padding: 12px; font-size: 0.78rem; color: var(--apple-label-secondary);">${end.toLocaleString()}</td>
                <td style="padding: 12px;"><span style="display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; background: var(--apple-fill); color: var(--apple-label-secondary);">${duration}</span></td>
                <td style="padding: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, var(--apple-blue), var(--apple-indigo)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: white;">${run.tester_name ? UI.escapeHTML(run.tester_name.charAt(0)) : '?'}</span>
                        <span style="font-size: 0.78rem; color: var(--apple-label);">${UI.escapeHTML(run.tester_name || 'Desconocido')}</span>
                    </div>
                </td>
                <td style="padding: 12px;">
                    <div style="width: 100%; display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--apple-fill);">
                        <div title="PASS: ${pass}" style="width: ${passPct}%; background: var(--apple-green);"></div>
                        <div title="FAIL: ${fail}" style="width: ${failPct}%; background: var(--apple-red);"></div>
                        <div title="BLOCK: ${block}" style="width: ${blockPct}%; background: var(--apple-orange);"></div>
                        <div title="SKIP: ${skip}" style="width: ${skipPct}%; background: var(--apple-label-tertiary);"></div>
                    </div>
                    <div style="display: flex; justify-content: center; gap: 8px; margin-top: 6px; font-size: 0.6rem; font-weight: 600; flex-wrap: wrap;">
                        <span style="color: var(--apple-green);">${pass} OK</span>
                        <span style="color: var(--apple-red);">${fail} FAIL</span>
                        <span style="color: var(--apple-orange);">${block} BLK</span>
                        <span style="color: var(--apple-label-tertiary);">${skip} SKP</span>
                    </div>
                </td>
                <td style="padding: 12px; text-align: right;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-sm btn-view-report" data-id="${run.id}" title="Ver Reporte" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">📄</button>
                        <button class="btn btn-ghost btn-sm btn-view-bugs" data-id="${run.id}" title="Ver Defectos" ${fail === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🐛</button>
                        <button class="btn btn-primary btn-sm btn-retest" data-id="${run.id}" title="Retesting" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 600;">🔁 Retest</button>
                    </div>
                </td>
            </tr>
        `;
    },

    formatDuration(start, end) {
        const diff = end - start;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    },

    updateConsolidatedButton(container) {
        const toolbarRight = container.querySelector('.tab-toolbar-right');
        if (!toolbarRight) return;
        
        const existingBtn = toolbarRight.querySelector('#btn-consolidated-report');
        if (this.selectedRunIds.size >= 2) {
            if (!existingBtn) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-sm';
                btn.id = 'btn-consolidated-report';
                btn.innerHTML = `📊 Reporte Consolidado (${this.selectedRunIds.size})`;
                btn.addEventListener('click', () => {
                    const ids = [...this.selectedRunIds].join(',');
                    window.open(`/api/reports/multi?ids=${ids}`, '_blank');
                });
                toolbarRight.insertBefore(btn, toolbarRight.firstChild);
            } else {
                existingBtn.innerHTML = `📊 Reporte Consolidado (${this.selectedRunIds.size})`;
            }
        } else if (existingBtn) {
            existingBtn.remove();
        }
    },

    bindEvents(container) {
        container.querySelector('#btn-refresh-history')?.addEventListener('click', () => this.render(container));

        container.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTab = btn.dataset.tab;
                this.render(container);
            });
        });

        if (this.currentTab === 'runs') {
            container.querySelectorAll('.btn-retest').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    if (!await modalManager.confirm('¿Deseas iniciar un nuevo ciclo de retesting para esta suite? Se activará en la pestaña de Ejecución.')) return;
                    
                    UI.showLoading();
                    try {
                        const res = await ApiService.retestRun(id);
                        UI.toast('Ciclo de retesting iniciado. Ve a la pestaña Ejecución.');
                        ExecutionTab.projectSuites = [];
                        ExecutionTab.expandedSuiteId = parseInt(res.suite_id || 0);
                        window.dispatchEvent(new CustomEvent('change-tab', { detail: 'execution' }));
                    } catch (err) {
                        UI.toast(err.message, 'error');
                    }
                    UI.hideLoading();
                });
            });

            container.querySelectorAll('.btn-view-report').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    window.open(`/api/reports/${id}`, '_blank');
                });
            });

            container.querySelectorAll('.btn-view-bugs').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    UI.showLoading();
                    try {
                        const res = await ApiService.getRunBugs(id);
                        Modals.render('view-bugs', { runId: id, bugs: res.bugs || [] });
                    } catch (err) {
                        UI.toast(err.message, 'error');
                    }
                    UI.hideLoading();
                });
            });

            // Checkbox handlers para selección múltiple
            container.querySelectorAll('.run-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    const id = parseInt(cb.dataset.id);
                    if (cb.checked) {
                        this.selectedRunIds.add(id);
                    } else {
                        this.selectedRunIds.delete(id);
                    }
                    this.updateConsolidatedButton(container);
                });
            });

            const selectAll = container.querySelector('#select-all-runs');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    if (selectAll.checked) {
                        this.runs.forEach(r => this.selectedRunIds.add(r.id));
                    } else {
                        this.selectedRunIds.clear();
                    }
                    container.querySelectorAll('.run-checkbox').forEach(cb => {
                        cb.checked = selectAll.checked;
                    });
                    this.updateConsolidatedButton(container);
                });
            }

            const consolidatedBtn = container.querySelector('#btn-consolidated-report');
            if (consolidatedBtn) {
                consolidatedBtn.addEventListener('click', () => {
                    const ids = [...this.selectedRunIds].join(',');
                    window.open(`/api/reports/multi?ids=${ids}`, '_blank');
                });
            }
        } else {
            // Eventos de la pestaña de BUGS
            container.querySelectorAll('.btn-view-bug-details').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = parseInt(btn.dataset.id);
                    const bug = this.bugs.find(b => b.id === id);
                    if (bug) {
                        const content = this.getBugDetailsHtml(bug);
                        UI.showSidePanel('DETALLE TÉCNICO DE DEFECTO', content);
                        this.initJiraIntegration(bug);
                    }
                });
            });
        }
    },

    async initJiraIntegration(bug) {
        if (bug.jira_key) return;

        const container = document.getElementById('jira-integration-container');
        const epicSelect = document.getElementById('jira-epic-select');
        const assigneeSelect = document.getElementById('jira-assignee-select');
        const prioritySelect = document.getElementById('jira-priority-select');
        const btnCreate = document.getElementById('btn-create-jira');
        const successContainer = document.getElementById('jira-success-container');
        const ticketLink = document.getElementById('jira-ticket-link');

        try {
            const projectId = Store.state.activeProjectId || bug.project_id;
            if (!projectId) return;

            container.style.display = 'block';
            
            // 1. Cargar Contexto Completo
            const { epics, users, priorities, customFields, error } = await ApiService.getJiraContext(projectId);
            
            if (error) {
                UI.toast(error, 'warn');
                epicSelect.innerHTML = '<option value="">— ' + (error.includes('token') ? 'Configura tu token' : error) + ' —</option>';
                assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>';
                prioritySelect.innerHTML = '<option value="">Media</option>';
            } else {
                if (epics && epics.length > 0) {
                    epicSelect.innerHTML = '<option value="">— Sin Épica (General) —</option>' + 
                        epics.map(e => `<option value="${e.id}">${UI.escapeHTML(e.key)} | ${UI.escapeHTML(e.summary)}</option>`).join('');
                } else {
                    epicSelect.innerHTML = '<option value="">— Sin Épicas disponibles —</option>';
                }

                assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>' + 
                    (users || []).map(u => `<option value="${u.accountId}">${UI.escapeHTML(u.displayName)}</option>`).join('');

                prioritySelect.innerHTML = (priorities || []).map(p => 
                    `<option value="${p.id}" ${p.name === 'Medium' ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>`
                ).join('');
            }

            const customFieldsContainer = document.getElementById('jira-custom-fields-container');
            if (customFields && customFields.length > 0) {
                let html = '';
                for (const field of customFields) {
                    html += `<div class="field-group" style="margin-bottom: 16px;">
                        <label class="field-label" style="font-size: 0.68rem;">${UI.escapeHTML(field.name)}${field.required ? ' *' : ''}</label>`;
                    if (field.options && field.options.length > 0) {
                        html += `<select id="jira-cf-${field.fieldId}" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                            <option value="">— Seleccionar —</option>`;
                        for (const opt of field.options) {
                            html += `<option value="${opt.id}">${UI.escapeHTML(opt.name)}</option>`;
                        }
                        html += `</select>`;
                    } else {
                        html += `<input type="text" id="jira-cf-${field.fieldId}" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);" placeholder="Ingresar valor...">`;
                    }
                    html += `</div>`;
                }
                customFieldsContainer.innerHTML = html;
                customFieldsContainer.style.display = 'block';
            } else {
                customFieldsContainer.style.display = 'none';
            }

            btnCreate.onclick = async () => {
                const epicId = epicSelect.value;
                const assigneeId = assigneeSelect.value;
                const priorityId = prioritySelect.value;

                const customFieldValues = {};
                if (customFields && customFields.length > 0) {
                    for (const field of customFields) {
                        const el = document.getElementById(`jira-cf-${field.fieldId}`);
                        if (el && el.value) {
                            const val = el.value;
                            customFieldValues[field.fieldId] = field.options?.length > 0 ? { id: val } : val;
                        }
                    }
                }

                btnCreate.disabled = true;
                btnCreate.innerText = '⌛ CREANDO TICKET...';

                try {
                    const result = await ApiService.createJiraBug(bug.id, epicId, assigneeId, priorityId, customFieldValues);
                    bug.jira_key = result.jira.key;
                    bug.jira_url = result.jira.browser_url;
                    container.style.display = 'none';
                    successContainer.style.display = 'block';
                    
                    ticketLink.innerText = result.jira.key;
                    ticketLink.href = result.jira.browser_url;
                    
                    let toastMsg = 'Ticket de Jira creado exitosamente';
                    if (result.attachment_count > 0) {
                        toastMsg += ` — ${result.attachment_count} evidencia(s) adjuntada(s)`;
                    }
                    if (result.attachment_errors && result.attachment_errors.length > 0) {
                        toastMsg += ` (${result.attachment_errors.length} error(es) al adjuntar)`;
                        console.warn('Errores al adjuntar evidencias:', result.attachment_errors);
                    }
                    UI.toast(toastMsg);
                } catch (err) {
                    UI.toast(err.message, 'error');
                    btnCreate.disabled = false;
                    btnCreate.innerText = '🚀 CREAR TICKET EN JIRA';
                }
            };

        } catch (err) {
            console.log('Jira no configurado o error al cargar:', err.message);
        }
    },

    getBugDetailsHtml(bug) {
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h4 style="margin: 0; color: var(--apple-red); font-size: 0.92rem; font-weight: 700;">ID: #${bug.id}</h4>
                    <p style="color: var(--apple-label-tertiary); margin-top: 4px; font-size: 0.72rem;">Reportado en: ${new Date(bug.created_at).toLocaleString()}</p>
                </div>
                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 4px 12px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; background: ${bug.status === 'FIXED' ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.status === 'FIXED' ? 'var(--apple-green)' : 'var(--apple-orange)'};">
                    ${bug.status}
                </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">TÍTULO DEL BUG</label>
                    <div style="padding: 10px 12px; background: var(--apple-fill); border-radius: var(--apple-radius-md); font-weight: 600; font-size: 0.88rem; color: var(--apple-label);">
                        ${UI.escapeHTML(bug.title)}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">TEST CASE ORIGEN</label>
                    <div style="padding: 10px 12px; background: var(--apple-fill); border-radius: var(--apple-radius-md); color: var(--apple-blue); font-weight: 600; font-size: 0.82rem;">
                        ${UI.escapeHTML(bug.tc_key)} - ${UI.escapeHTML(bug.tc_title)}
                    </div>
                </div>

                ${bug.description ? `
                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">DESCRIPCIÓN GENERAL</label>
                    <div style="padding: 12px; background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); white-space: pre-wrap; font-size: 0.85rem; line-height: 1.6; color: var(--apple-label);">
                        ${UI.escapeHTML(bug.description)}
                    </div>
                </div>
                ` : ''}

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">PASOS PARA REPRODUCIR</label>
                    <div style="padding: 12px; background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; line-height: 1.6; color: var(--apple-label-secondary);">
                        ${UI.escapeHTML(bug.steps_to_reproduce || 'No se proporcionaron pasos.')}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="field-group">
                        <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-green); text-transform: uppercase; margin-bottom: 6px;">✔️ Resultado Esperado</div>
                        <div style="padding: 10px 12px; background: rgba(52,199,89,0.06); border: 1px solid rgba(52,199,89,0.12); border-radius: var(--apple-radius-md); min-height: 70px; font-size: 0.85rem; color: var(--apple-label);">
                            ${UI.escapeHTML(bug.expected_result || '—')}
                        </div>
                    </div>
                    <div class="field-group">
                        <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-red); text-transform: uppercase; margin-bottom: 6px;">❌ Resultado Actual</div>
                        <div style="padding: 10px 12px; background: rgba(255,59,48,0.06); border: 1px solid rgba(255,59,48,0.12); border-radius: var(--apple-radius-md); min-height: 70px; font-size: 0.85rem; color: var(--apple-label);">
                            ${UI.escapeHTML(bug.actual_result || '—')}
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--apple-bg-elevated); padding: 14px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator);">
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.65rem;">SEVERIDAD</label>
                        <span style="font-weight: 700; color: var(--apple-red); font-size: 0.85rem;">${UI.escapeHTML(bug.severity)}</span>
                    </div>
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.65rem;">FRECUENCIA</label>
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--apple-label);">${UI.escapeHTML(bug.frequency || 'Siempre')}</span>
                    </div>
                    <div class="field-group" style="grid-column: span 2;">
                        <label class="field-label" style="font-size: 0.65rem;">IMPACTO EN EL NEGOCIO</label>
                        <span style="font-size: 0.82rem; color: var(--apple-label-secondary);">${UI.escapeHTML(bug.business_impact || 'No especificado')}</span>
                    </div>
                </div>

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--apple-separator); display: flex; flex-direction: column; gap: 10px;">
                    <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase;">Metadatos de Reporte</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
                        <span style="color: var(--apple-label-secondary);">Reportado por:</span>
                        <span style="font-weight: 600; color: var(--apple-label);">${UI.escapeHTML(bug.tester_name || 'Desconocido')}</span>
                    </div>
                </div>

                <div id="jira-custom-fields-container" style="margin-top: 16px; display: none;"></div>

                <div id="jira-integration-container" style="margin-top: 20px; padding: 18px; background: var(--apple-blue-soft); border: 1px solid rgba(0,122,255,0.15); border-radius: var(--apple-radius-lg); display: ${bug.jira_key ? 'none' : 'block'};">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
                        <img src="https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png" style="width: 16px; height: 16px;">
                        <span style="font-size: 0.72rem; font-weight: 700; color: var(--apple-blue); text-transform: uppercase; letter-spacing: 0.04em;">Integración con Jira</span>
                    </div>
                    
                    <div class="field-group" style="margin-bottom: 14px;">
                        <label class="field-label" style="font-size: 0.68rem;">ÉPICA DESTINO</label>
                        <select id="jira-epic-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                            <option value="">Cargando...</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.68rem;">ASIGNADO A</label>
                            <select id="jira-assignee-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.68rem;">PRIORIDAD</label>
                            <select id="jira-priority-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                    </div>

                    <button id="btn-create-jira" class="btn btn-primary" style="width: 100%; background: var(--apple-blue); border: none; font-weight: 600; font-size: 0.82rem; padding: 10px; border-radius: var(--apple-radius-md); color: white; cursor: pointer;">
                        🚀 Crear Ticket en Jira
                    </button>
                </div>

                <div id="jira-success-container" style="margin-top: 20px; padding: 14px; background: rgba(52,199,89,0.06); border: 1px solid rgba(52,199,89,0.15); border-radius: var(--apple-radius-lg); display: ${bug.jira_key ? 'block' : 'none'}; text-align: center;">
                    <div style="font-size: 0.82rem; font-weight: 600; color: var(--apple-green); margin-bottom: 6px;">✅ Ticket de Jira vinculado</div>
                    <a id="jira-ticket-link" href="${bug.jira_url || '#'}" target="_blank" style="font-size: 0.88rem; font-weight: 700; color: var(--apple-blue); text-decoration: none;">
                        ${bug.jira_key || 'BUG-XXX'}
                    </a>
                </div>
            </div>
        `;
    }
};
