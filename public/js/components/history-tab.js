import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { ExecutionTab } from './execution-tab.js';
import { Modals } from './modals.js';

export const HistoryTab = {
    runs: [],
    bugs: [],
    currentTab: 'runs', // 'runs' | 'bugs'

    async render(container) {
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
            }
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        container.innerHTML = `
            <div class="tab-toolbar" style="flex-direction: column; align-items: flex-start; gap: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <div class="tab-toolbar-left">
                        <span class="tab-toolbar-title">${this.currentTab === 'runs' ? 'Ciclos de Ejecución' : 'Historial de Defectos (Bugs)'}</span>
                        <span class="tab-toolbar-count">${this.currentTab === 'runs' ? this.runs.length + ' ciclos' : this.bugs.length + ' bugs'}</span>
                    </div>
                    <div class="tab-toolbar-right">
                        <button class="btn btn-ghost btn-sm" id="btn-refresh-history">🔄 Recargar</button>
                    </div>
                </div>

                <div class="sub-tab-nav" style="display: flex; gap: 8px; background: var(--bg-surface-elevated); padding: 4px; border-radius: 8px; border: 1px solid var(--border);">
                    <button class="sub-tab-btn ${this.currentTab === 'runs' ? 'active' : ''}" data-tab="runs" style="padding: 6px 16px; border-radius: 6px; border: none; background: ${this.currentTab === 'runs' ? 'var(--brand)' : 'transparent'}; color: ${this.currentTab === 'runs' ? 'white' : 'var(--text-secondary)'}; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
                        📋 EJECUCIONES
                    </button>
                    <button class="sub-tab-btn ${this.currentTab === 'bugs' ? 'active' : ''}" data-tab="bugs" style="padding: 6px 16px; border-radius: 6px; border: none; background: ${this.currentTab === 'bugs' ? 'var(--brand)' : 'transparent'}; color: ${this.currentTab === 'bugs' ? 'white' : 'var(--text-secondary)'}; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
                        🐞 BUGS & DEFECTOS
                    </button>
                </div>
            </div>

            <div class="tt-container">
                ${this.currentTab === 'runs' ? this.renderRunsView() : this.renderBugsView()}
            </div>
        `;

        this.bindEvents(container);
    },

    renderRunsView() {
        return `
            <table class="tt-table">
                <thead>
                    <tr>
                        <th style="width: 40px">ID</th>
                        <th>Test Suite</th>
                        <th>Fecha Inicio</th>
                        <th>Fecha Fin</th>
                        <th>Duración</th>
                        <th>Tester</th>
                        <th style="text-align: center;">Resultado</th>
                        <th style="text-align: right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.runs.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No hay ejecuciones finalizadas aún.</td></tr>` : ''}
                    ${this.runs.map(run => this.renderRunRow(run)).join('')}
                </tbody>
            </table>
        `;
    },

    renderBugsView() {
        const team = Store.state.team || [];
        return `
            <table class="tt-table">
                <thead>
                    <tr>
                        <th style="width: 40px">ID</th>
                        <th>Defecto / Título</th>
                        <th>Contexto (Test Case)</th>
                        <th>Severidad</th>
                        <th>Estado</th>
                        <th>Reportado por</th>
                        <th>Fecha</th>
                        <th style="text-align: right;">Detalle</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.bugs.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No hay bugs registrados en este proyecto.</td></tr>` : ''}
                    ${this.bugs.map(bug => `
                        <tr>
                            <td style="opacity: 0.5;">#${bug.id}</td>
                            <td>
                                <div style="font-weight: 700; color: var(--text-main);">${UI.escapeHTML(bug.title)}</div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHTML(bug.description || 'Sin descripción.')}</div>
                            </td>
                            <td>
                                <div style="font-size: 0.75rem; color: var(--brand); font-weight: 600;">${UI.escapeHTML(bug.tc_key)}</div>
                                <div style="font-size: 0.7rem; color: var(--text-secondary);">${UI.escapeHTML(bug.tc_title)}</div>
                            </td>
                            <td>
                                <span style="color: ${bug.severity === 'Crítica' ? 'var(--fail)' : bug.severity === 'Alta' ? 'var(--fail)' : 'var(--warn)'}; font-weight: 800; font-size: 0.7rem;">
                                    ${UI.escapeHTML(bug.severity)}
                                </span>
                            </td>
                            <td>
                                <span class="status-pill ${bug.status === 'FIXED' ? 'ok' : 'warn'}" style="font-size: 0.65rem;">${UI.escapeHTML(bug.status)}</span>
                            </td>
                            <td>
                                <div style="font-size: 0.75rem;">${UI.escapeHTML(bug.tester_name || '—')}</div>
                            </td>
                            <td style="text-align: right; font-size: 0.7rem; color: var(--text-muted);">
                                ${new Date(bug.created_at).toLocaleDateString()}
                            </td>
                            <td style="text-align: right;">
                                <button class="btn btn-ghost btn-sm btn-view-bug-details" data-id="${bug.id}" title="Ver Detalle Técnico">🔍</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
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
            <tr>
                <td style="opacity: 0.5;">#${run.id}</td>
                <td>
                    <div style="font-weight: 600; color: var(--text-main);">${UI.escapeHTML(run.suite_title)}</div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <span class="status-pill ${run.run_type.toLowerCase()}" style="font-size: 9px; padding: 1px 6px;">
                            ${run.run_type === 'SMOKE' ? '💨 ' : ''}${run.run_type === 'REGRESSION' ? '🔄 ' : ''}${run.run_type === 'INTEGRATION' ? '🔗 ' : ''}${run.run_type === 'EXPLORATORY' ? '🔍 ' : ''}${run.run_type === 'RETEST' ? '🔁 ' : ''}${UI.escapeHTML(run.run_type)}
                        </span>
                    </div>
                </td>
                <td class="tt-date">${start.toLocaleString()}</td>
                <td class="tt-date">${end.toLocaleString()}</td>
                <td><span class="badge badge-ghost">${duration}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="avatar-small">${run.tester_name ? UI.escapeHTML(run.tester_name.charAt(0)) : '?'}</div>
                        <span style="font-size: 12px;">${UI.escapeHTML(run.tester_name || 'Desconocido')}</span>
                    </div>
                </td>
                <td>
                    <div class="tt-progress-mini">
                        <div class="tt-progress-bar" style="width: 100%; display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--bg-hover);">
                            <div title="PASS: ${pass}" style="width: ${passPct}%; background: #52c41a;"></div>
                            <div title="FAIL: ${fail}" style="width: ${failPct}%; background: #ff4d4f;"></div>
                            <div title="BLOCK: ${block}" style="width: ${blockPct}%; background: #fadb14;"></div>
                            <div title="SKIP: ${skip}" style="width: ${skipPct}%; background: #595959;"></div>
                            <div title="WARN: ${warn}" style="width: ${warnPct}%; background: #faad14;"></div>
                        </div>
                        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 6px; font-size: 9px; font-weight: 700; flex-wrap: wrap;">
                            <span style="color: #52c41a;">${pass} OK</span>
                            <span style="color: #ff4d4f;">${fail} FAIL</span>
                            <span style="color: #fadb14;">${block} BLOCK</span>
                            <span style="color: #595959;">${skip} SKIP</span>
                        </div>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 4px; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-sm btn-view-report" data-id="${run.id}" title="Generar Reporte">📄</button>
                        <button class="btn btn-ghost btn-sm btn-view-bugs" data-id="${run.id}" title="Ver Defectos" ${fail === 0 ? 'disabled' : ''}>🐛</button>
                        <button class="btn btn-primary btn-sm btn-retest" data-id="${run.id}" title="Iniciar Retesting de Fallos">🔁 Retest</button>
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
                    if (!confirm('¿Deseas iniciar un nuevo ciclo de retesting para esta suite? Se activará en la pestaña de Ejecución.')) return;
                    
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
            const { epics, users, priorities } = await ApiService.getJiraContext(projectId);
            
            // Poblar Épicas
            if (epics && epics.length > 0) {
                epicSelect.innerHTML = '<option value="">— Sin Épica (General) —</option>' + 
                    epics.map(e => `<option value="${e.id}">${UI.escapeHTML(e.key)} | ${UI.escapeHTML(e.summary)}</option>`).join('');
            } else {
                epicSelect.innerHTML = '<option value="">— Sin Épicas disponibles —</option>';
            }

            // Poblar Usuarios
            assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>' + 
                (users || []).map(u => `<option value="${u.accountId}">${UI.escapeHTML(u.displayName)}</option>`).join('');

            // Poblar Prioridades
            prioritySelect.innerHTML = (priorities || []).map(p => 
                `<option value="${p.id}" ${p.name === 'Medium' ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>`
            ).join('');

            // 2. Evento de creación
            btnCreate.onclick = async () => {
                const jira_domain = document.getElementById('jira-domain')?.value;
                const jira_project_key = document.getElementById('jira-project-key')?.value?.toUpperCase();
                const jira_user_email = document.getElementById('jira-user-email')?.value;
                const jira_token = document.getElementById('jira-token')?.value;

                if (!jira_domain || !jira_project_key || !jira_user_email) {
                    UI.toast('Dominio, Proyecto y Email son obligatorios', 'error');
                    return;
                }

                await ApiService.saveJiraConfig(Store.state.activeProjectId, {
                    jira_domain,
                    jira_project_key,
                    jira_user_email,
                    jira_token: jira_token || undefined
                });

                const epicId = epicSelect.value;
                const assigneeId = assigneeSelect.value;
                const priorityId = prioritySelect.value;

                btnCreate.disabled = true;
                btnCreate.innerText = '⌛ CREANDO TICKET...';

                try {
                    const result = await ApiService.createJiraBug(bug.id, epicId, assigneeId, priorityId);
                    container.style.display = 'none';
                    successContainer.style.display = 'block';
                    
                    ticketLink.innerText = result.jira.key;
                    ticketLink.href = result.jira.browser_url;
                    
                    UI.toast('Ticket de Jira creado exitosamente');
                } catch (err) {
                    UI.toast(err.message, 'error');
                    btnCreate.disabled = false;
                    btnCreate.innerText = '🚀 CREAR TICKET EN JIRA';
                }
            };

        } catch (err) {
            console.log('Jira no configurado o error al cargar épicas:', err.message);
            container.style.display = 'none';
        }
    },

    getBugDetailsHtml(bug) {
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <div>
                    <h4 style="margin: 0; color: var(--fail); font-size: 0.9rem;">ID: #${bug.id}</h4>
                    <p style="color: var(--text-muted); margin-top: 4px; font-size: 0.75rem;">Reportado en: ${new Date(bug.created_at).toLocaleString()}</p>
                </div>
                <div class="status-pill ${bug.status === 'FIXED' ? 'ok' : 'warn'}" style="font-size: 0.65rem; padding: 4px 12px;">
                    ${bug.status}
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label" style="font-size: 0.65rem;">TÍTULO DEL BUG</label>
                    <div style="padding: 12px; background: var(--bg-hover); border-radius: 8px; font-weight: 700; font-size: 0.85rem;">
                        ${UI.escapeHTML(bug.title)}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.65rem;">TEST CASE ORIGEN</label>
                    <div style="padding: 12px; background: var(--bg-hover); border-radius: 8px; color: var(--brand); font-weight: 600; font-size: 0.8rem;">
                        ${UI.escapeHTML(bug.tc_key)} - ${UI.escapeHTML(bug.tc_title)}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.65rem;">PASOS PARA REPRODUCIR</label>
                    <div style="padding: 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; line-height: 1.6; color: var(--text-secondary);">
                        ${UI.escapeHTML(bug.steps_to_reproduce || 'No se proporcionaron pasos.')}
                    </div>
                </div>

                <div class="bug-result-compare" style="display: grid; grid-template-columns: 1fr; gap: 16px;">
                    <div class="field-group">
                        <div class="result-box-title" style="color: #52c41a; font-size: 0.65rem;">✔️ RESULTADO ESPERADO</div>
                        <div style="padding: 12px; background: rgba(82, 196, 26, 0.05); border: 1px solid rgba(82, 196, 26, 0.2); border-radius: 8px; min-height: 80px; font-size: 0.8rem;">
                            ${UI.escapeHTML(bug.expected_result || '—')}
                        </div>
                    </div>
                    <div class="field-group">
                        <div class="result-box-title" style="color: #ff4d4f; font-size: 0.65rem;">❌ RESULTADO ACTUAL</div>
                        <div style="padding: 12px; background: rgba(255, 77, 79, 0.05); border: 1px solid rgba(255, 77, 79, 0.2); border-radius: 8px; min-height: 80px; font-size: 0.8rem;">
                            ${UI.escapeHTML(bug.actual_result || '—')}
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: var(--bg-surface-elevated); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.6rem;">SEVERIDAD</label>
                        <span style="font-weight: 800; color: var(--fail); font-size: 0.8rem;">${UI.escapeHTML(bug.severity)}</span>
                    </div>
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.6rem;">FRECUENCIA</label>
                        <span style="font-weight: 700; font-size: 0.8rem;">${UI.escapeHTML(bug.frequency || 'Siempre')}</span>
                    </div>
                    <div class="field-group" style="grid-column: span 2;">
                        <label class="field-label" style="font-size: 0.6rem;">IMPACTO EN EL NEGOCIO</label>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${UI.escapeHTML(bug.business_impact || 'No especificado')}</span>
                    </div>
                </div>

                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px;">
                    <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Metadatos de Reporte</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                        <span style="color: var(--text-secondary);">Reportado por:</span>
                        <span style="font-weight: 600;">${UI.escapeHTML(bug.tester_name || 'Desconocido')}</span>
                    </div>
                </div>

                <!-- Sección Jira Integration (Persistida o Nueva) -->
                <div id="jira-integration-container" style="margin-top: 24px; padding: 20px; background: rgba(0, 82, 204, 0.05); border: 1px solid rgba(0, 82, 204, 0.2); border-radius: 16px; display: ${bug.jira_key ? 'none' : 'none'};">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                        <img src="https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png" style="width: 16px; height: 16px;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: #0052cc; text-transform: uppercase; letter-spacing: 0.05em;">Integración con Jira</span>
                    </div>
                    
                    <div class="field-group" style="margin-bottom: 16px;">
                        <label class="field-label" style="font-size: 0.65rem;">SELECCIONAR ÉPICA DESTINO</label>
                        <select id="jira-epic-select" style="width: 100%; font-size: 0.8rem; padding: 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main);">
                            <option value="">Cargando épicas...</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.65rem;">PERSONA ASIGNADA</label>
                            <select id="jira-assignee-select" style="width: 100%; font-size: 0.8rem; padding: 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.65rem;">PRIORIDAD</label>
                            <select id="jira-priority-select" style="width: 100%; font-size: 0.8rem; padding: 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div class="field-group" style="grid-column: span 2;">
                            <label class="field-label" style="font-size: 0.65rem;">PROYECTO JIRA (KEY)</label>
                            <input type="text" id="jira-project-key" placeholder="Ej: PROY" style="width: 100%; font-size: 0.8rem; padding: 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main);">
                        </div>
                    </div>

                    <button id="btn-create-jira" class="btn btn-primary" style="width: 100%; background: #0052cc; border: none; font-weight: 700; font-size: 0.8rem; height: 40px; color: white;">
                        🚀 CREAR TICKET EN JIRA
                    </button>
                </div>

                <div id="jira-success-container" style="margin-top: 24px; padding: 16px; background: rgba(82, 196, 26, 0.1); border: 1px solid var(--ok); border-radius: 12px; display: ${bug.jira_key ? 'block' : 'none'}; text-align: center;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--ok); margin-bottom: 8px;">✅ Ticket de Jira vinculado</div>
                    <a id="jira-ticket-link" href="${bug.jira_url || '#'}" target="_blank" style="font-size: 0.9rem; font-weight: 800; color: #0052cc; text-decoration: underline;">
                        ${bug.jira_key || 'BUG-XXX'}
                    </a>
                </div>
            </div>
        `;
    }
};
