import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { SBS } from './sbs.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';
import { ExecutionTab } from './execution-tab.js';
import { modalManager } from '../utils/modal-manager.js';

/**
 * TEST-SUITES-TAB.JS - Tab "Test Suites"
 * Grid/Table view with detail panel, inline execution, and dark theme.
 */
export const TestSuitesTab = {
    selectedSuiteId: null,
    selectedTCId: null,
    editingTCId: null,
    detailTab: 'steps',
    executionOverlay: null,
    _isListening: false,
    searchQuery: '',
    suiteSearchQuery: '',
    filterStatus: 'all',
    _lastJiraProjectId: null,
    _lastMainScroll: 0,
    _lastSidebarScroll: 0,
    _lastWindowScrollY: 0,

    render(container) {
        const sidebarList = container.querySelector('.ts-sidebar-list');
        const mainContent = container.querySelector('.ts-main-content');
        const sidebarScroll = sidebarList ? sidebarList.scrollTop : 0;
        const mainScroll = mainContent ? mainContent.scrollTop : 0;
        const windowScrollY = window.scrollY;

        const useMainScroll = this._lastMainScroll > 0 ? this._lastMainScroll : mainScroll;
        const useSidebarScroll = this._lastSidebarScroll > 0 ? this._lastSidebarScroll : sidebarScroll;
        const useWindowScrollY = this._lastWindowScrollY > 0 ? this._lastWindowScrollY : windowScrollY;

        const { testSuites, activeProjectId, selectedUseCaseId, jiraEpics, loadedForUC } = Store.state;
        const totalTests = testSuites.reduce((acc, s) => acc + (s.test_cases || []).length, 0);

        if (selectedUseCaseId && loadedForUC.testSuites !== selectedUseCaseId) {
            this.loadSuitesForUC(selectedUseCaseId);
            return;
        }

        if (!selectedUseCaseId && loadedForUC.testSuites) {
            Store.setTestSuites([]);
            return;
        }

        if (activeProjectId && this._lastJiraProjectId !== activeProjectId) {
            this._lastJiraProjectId = activeProjectId;
            ApiService.getJiraContext(activeProjectId).then(ctx => {
                if (ctx?.error) {
                    if (ctx.error.includes('token')) {
                        UI.toast('🔑 Configura tu token de Jira para ver las épicas', 'warn');
                    }
                    return;
                }
                if (ctx && ctx.epics) {
                    Store.setJiraEpics(ctx.epics);
                }
            });
        }

        if (!activeProjectId) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📁</div>
                    <h3>Selecciona un Proyecto</h3>
                    <p>Usa el selector en la barra superior para comenzar.</p>
                </div>
            `;
            return;
        }

        if (testSuites.length > 0 && !this.selectedSuiteId) {
            this.selectedSuiteId = testSuites[0].id;
        }

        const selectedSuite = testSuites.find(s => s.id === this.selectedSuiteId);

        container.innerHTML = `
            <div class="ts-layout">
                <div class="ts-sidebar">
                    <div class="ts-sidebar-header">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Test Suites</span>
                            <div style="display: flex; gap: 6px;">
                                <span class="tab-badge" title="Total de Suites">${testSuites.length} S</span>
                                <span class="tab-badge" style="background: var(--brand); color: white;" title="Total de Pruebas">${totalTests} T</span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <select id="uc-filter" class="w-full">
                                <option value="">Selecciona Caso de Uso</option>
                                ${Store.state.useCases.map(uc => `
                                    <option value="${uc.id}" ${uc.id === selectedUseCaseId ? 'selected' : ''}>${UI.escapeHTML(uc.key_id || 'CU')} - ${UI.escapeHTML(uc.title)}</option>
                                `).join('')}
                            </select>
                            <!-- Search suites + actions row -->
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <div style="position: relative; flex: 1;">
                                    <input type="text" id="suite-search" placeholder="Buscar suite..." value="${UI.escapeHTML(this.suiteSearchQuery)}"
                                        style="width: 100%; padding: 6px 10px 6px 30px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.78rem; outline: none; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn btn-primary btn-sm" id="btn-new-suite" ${!selectedUseCaseId ? 'disabled' : ''} style="flex: 1;">+ Nueva</button>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn btn-ghost btn-sm" id="btn-sidebar-import-xlsx" ${!selectedUseCaseId ? 'disabled' : ''} style="flex: 1; font-size: 0.72rem;">📥</button>
                                <button class="btn btn-success btn-sm" id="btn-export-matrix" ${!selectedUseCaseId ? 'disabled' : ''} style="flex: 1; font-size: 0.72rem; background: #10b981; border: none; color: white;">📊</button>
                            </div>
                        </div>
                    </div>
                    <div class="ts-sidebar-list">
                        ${this.renderSidebarList(testSuites)}
                    </div>
                </div>
                <div class="ts-main-content">
                    ${this.renderMainContent(selectedSuite)}
                </div>
            </div>
            ${this.renderExecutionOverlay()}
            <div id="hu-drawer-overlay" class="hu-drawer-overlay"></div>
            <div id="hu-drawer" class="hu-drawer"></div>
        `;

        this.bindEvents(container);

        const newSidebarList = container.querySelector('.ts-sidebar-list');
        const newMainContent = container.querySelector('.ts-main-content');
        if (newSidebarList && useSidebarScroll > 0) {
            newSidebarList.scrollTop = useSidebarScroll;
            this._lastSidebarScroll = useSidebarScroll;
        }
        if (newMainContent && useMainScroll > 0) {
            newMainContent.scrollTop = useMainScroll;
            this._lastMainScroll = useMainScroll;
        }
        if (useWindowScrollY > 0) {
            window.scrollTo(0, useWindowScrollY);
        }
    },

    renderSidebarList(suites) {
        let filtered = suites;
        if (this.suiteSearchQuery) {
            const q = this.suiteSearchQuery.toLowerCase();
            filtered = filtered.filter(s =>
                (s.title || '').toLowerCase().includes(q) ||
                (`${s.id}` || '').includes(q)
            );
        }
        if (filtered.length === 0) {
            return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">Sin suites encontradas</div>`;
        }
        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                <tbody>
                    ${filtered.map((suite, idx) => {
                        const isActive = this.selectedSuiteId === suite.id;
                        const isExecuting = !!suite.active_run_id;
                        const testCount = (suite.test_cases || []).length;

                        let incIndicator = '';
                        const rawInc = suite.inconsistencies;
                        const incList = Array.isArray(rawInc) ? rawInc : (() => { try { return JSON.parse(rawInc || '[]'); } catch { return []; } })();
                        if (incList.length > 0) {
                            incIndicator = `<span title="Tiene inconsistencias" style="font-size: 0.65rem; color: #f59e0b;">⚠️</span>`;
                        }

                        return `
                            <tr class="ts-suite-row ${isActive ? 'selected' : ''}" data-id="${suite.id}"
                                style="border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.15s;"
                                onmouseover="this.style.background='rgba(99,102,241,0.08)'"
                                onmouseout="this.style.background='${isActive ? 'rgba(99,102,241,0.12)' : 'transparent'}'">
                                <td style="padding: 8px 10px;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                                        <span style="font-size: 0.6rem; font-weight: 800; color: var(--brand);">SUITE #${suite.id}</span>
                                        ${isExecuting ? '<span class="status-pill ok" style="font-size: 7px; padding: 1px 4px;">LIVE</span>' : ''}
                                    </div>
                                    <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-main); line-height: 1.2;">${UI.escapeHTML(suite.title)} ${incIndicator}</div>
                                    <div style="font-size: 0.62rem; color: var(--text-muted); margin-top: 3px;">
                                        🧪 ${testCount} tests${suite.assigned_to_name ? ` · 👤 ${UI.escapeHTML(suite.assigned_to_name)}` : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    renderMainContent(suite) {
        if (!suite) {
            return `
                <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center; opacity: 0.5;">
                        <div style="font-size: 3rem; margin-bottom: 16px;">🧪</div>
                        <h3 style="font-weight: 700;">Selecciona una Test Suite</h3>
                        <p>Haz clic en una suite de la izquierda para gestionar sus casos de prueba.</p>
                    </div>
                </div>
            `;
        }

        const tcs = suite.test_cases || [];
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const selectedTC = tcs.find(tc => tc.id === this.selectedTCId);

        return `
            <!-- Breadcrumb + Suite Header -->
            <div class="ts-detail-header" style="padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface); flex-shrink: 0; display: flex; align-items: center; gap: 16px;">
                <div style="flex: 1; min-width: 0;">
                    <h2 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHTML(suite.title)}</h2>
                    ${suite.jira_epic_key ? `<span class="tab-badge" style="background: rgba(59, 130, 246, 0.1); color: var(--brand); font-size: 0.65rem; margin-top: 2px; display: inline-block;">Épica: ${UI.escapeHTML(suite.jira_epic_key)}</span>` : ''}
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <button class="btn btn-ghost btn-sm edit-suite" data-id="${suite.id}" title="Editar Suite" style="padding: 4px 8px;">✏️</button>
                    <button class="btn btn-sm delete-suite" data-id="${suite.id}" title="Eliminar Suite" style="padding: 4px 8px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">🗑️</button>
                    <div style="width: 1px; height: 18px; background: var(--border);"></div>
                    <button class="btn btn-success btn-sm run-suite" data-id="${suite.id}" style="padding: 4px 10px; font-size: 0.72rem;">▶ EJECUTAR</button>
                    <button class="btn btn-sm" id="btn-ai-gen-tc" data-suite-id="${suite.id}" style="background: linear-gradient(135deg,#a855f7,#6366f1); color: white; border: none; padding: 4px 10px; font-size: 0.72rem;">✨ AI Tool</button>
                    <button class="btn btn-primary btn-sm" id="btn-new-tc" data-suite-id="${suite.id}" style="padding: 4px 10px; font-size: 0.72rem;">+ Nuevo TC</button>
                </div>
            </div>

            <!-- Toolbar: search + filters -->
            <div class="ts-toolbar" style="padding: 10px 20px; background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border); display: flex; gap: 10px; align-items: center; flex-shrink: 0;">
                <div style="position: relative; flex: 1; max-width: 320px;">
                    <input type="text" id="ts-search" placeholder="🔍 Buscar test case..." value="${UI.escapeHTML(this.searchQuery)}"
                        style="width: 100%; padding: 7px 12px 7px 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.82rem; outline: none;" />
                    <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.85rem; opacity: 0.4;">🔍</span>
                </div>
                <select id="ts-filter-status" style="padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.82rem; outline: none;">
                    <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>Todos</option>
                    <option value="PENDING" ${this.filterStatus === 'PENDING' ? 'selected' : ''}>Pendientes</option>
                    <option value="OK" ${this.filterStatus === 'OK' ? 'selected' : ''}>Aprobados</option>
                    <option value="FAIL" ${this.filterStatus === 'FAIL' ? 'selected' : ''}>Fallidos</option>
                    <option value="BLOCKED" ${this.filterStatus === 'BLOCKED' ? 'selected' : ''}>Bloqueados</option>
                </select>
                <div style="margin-left: auto; font-size: 0.75rem; color: var(--text-muted);">
                    ${tcs.length} tests
                </div>
            </div>

            <!-- Grid Panel -->
            <div class="ts-grid-panel" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
                ${tcs.length === 0 ? `
                    <div class="empty-state" style="padding: 60px;">
                        <div class="empty-state-icon">📄</div>
                        <h3>Sin casos de prueba</h3>
                        <p>Esta suite aún no tiene tests. ¡Crea el primero!</p>
                    </div>
                ` : this.renderTCGrid(tcs, suite)}
            </div>
        `;
    },

    renderTCGrid(tcs, suite) {
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const user = Store.state.user;
        const activeRunId = suite?.active_run_id;

        let filtered = tcs;
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(tc =>
                (tc.title || '').toLowerCase().includes(q) ||
                (tc.key_id || '').toLowerCase().includes(q) ||
                (tc.assignee_name || '').toLowerCase().includes(q)
            );
        }
        if (this.filterStatus !== 'all') {
            filtered = filtered.filter(tc => tc.status === this.filterStatus);
        }

        if (filtered.length === 0) {
            return `<div style="text-align: center; padding: 40px; opacity: 0.5; color: var(--text-muted); font-size: 0.85rem;">No hay tests que coincidan</div>`;
        }

        return `
            <table class="ts-grid-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Key</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Título</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Prioridad</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Asignado</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Última Ejecución</th>
                        <th style="padding: 8px 12px; text-align: left; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Evidencia</th>
                        <th style="padding: 8px 12px; text-align: center; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.renderTCGridWithDetail(filtered, suite, isAdmin, user, activeRunId)}
                </tbody>
            </table>
        `;
    },

    renderTCGridWithDetail(tcs, suite, isAdmin, user, activeRunId) {
        let html = '';
        tcs.forEach((tc, index) => {
            html += this.renderTCGridRow(tc, suite, isAdmin, user, activeRunId);
            if (this.selectedTCId === tc.id) {
                html += this.renderExpandedDetailRow(tc, suite, isAdmin, user);
            }
        });
        return html;
    },

    renderTCGridRow(tc, suite, isAdmin, user, activeRunId) {
        const statusClass = (tc.status || 'pending').toLowerCase();
        const isSelected = this.selectedTCId === tc.id;
        const isAssignedToMe = tc.assigned_to === user?.id;
        const statusLabel = tc.status === 'OK' ? 'PASS' : UI.escapeHTML(tc.status || 'PENDING');
        const lastExec = tc.last_execution_at ? this._formatDate(tc.last_execution_at) : '—';
        const evidenceCount = (tc.executions || []).filter(e => e.attachments?.length).length;
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);

        const typeColors = { Epic: '#a78bfa', Bug: '#f87171', Task: '#60a5fa', Story: '#34d399' };
        const priorityColors = { Alta: '#ef4444', Media: '#f59e0b', Baja: '#22c55e' };

        const typeColor = typeColors['Task'] || '#60a5fa';
        const priorityColor = priorityColors[tc.priority] || '#f59e0b';

        return `
            <tr class="ts-grid-row ${isSelected ? 'selected' : ''}" data-tc-id="${tc.id}"
                style="border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.15s;"
                onmouseover="this.style.background='rgba(99,102,241,0.08)'"
                onmouseout="this.style.background='${isSelected ? 'rgba(99,102,241,0.12)' : 'transparent'}'">
                <td style="padding: 10px 12px;">
                    <span class="status-pill ${statusClass}" style="font-size: 9px; width: 60px; text-align: center; justify-content: center; font-weight: 700; display: inline-flex; padding: 3px 6px;">
                        ${statusLabel}
                    </span>
                </td>
                <td style="padding: 10px 12px; font-weight: 800; color: var(--brand); font-size: 0.75rem;">${UI.escapeHTML(tc.key_id || 'TC')}</td>
                <td style="padding: 10px 12px; color: var(--text-main); font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor}; flex-shrink: 0;"></span>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;">${UI.escapeHTML(tc.title)}</span>
                    </div>
                </td>
                <td style="padding: 10px 12px;">
                    <span style="font-size: 0.72rem; font-weight: 700; color: ${priorityColor};">${UI.escapeHTML(tc.priority || 'Media')}</span>
                </td>
                <td style="padding: 10px 12px;">
                    ${assignee ? `
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="width: 22px; height: 22px; border-radius: 50%; background: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800; color: white;">${assignee.name.charAt(0)}</span>
                            <span style="font-size: 0.78rem; color: var(--text-muted);">${UI.escapeHTML(assignee.name.split(' ')[0])}</span>
                        </div>
                    ` : '<span style="color: var(--text-muted); opacity: 0.4;">—</span>'}
                </td>
                <td style="padding: 10px 12px; font-size: 0.75rem; color: var(--text-muted);">${lastExec}</td>
                <td style="padding: 10px 12px; text-align: center;">
                    ${evidenceCount > 0 ? `<span style="background: rgba(34,197,94,0.15); color: #22c55e; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;">${evidenceCount}</span>` : '<span style="color: var(--text-muted); opacity: 0.3;">—</span>'}
                </td>
                <td style="padding: 10px 12px; text-align: center;">
                    <div style="display: flex; gap: 6px; justify-content: center;">
                        ${(isAssignedToMe || isAdmin) && !activeRunId ? `
                            <button class="btn btn-success btn-sm run-tc-grid" data-id="${tc.id}" title="Ejecutar" style="padding: 3px 10px; font-size: 0.65rem; font-weight: 800;">▶</button>
                        ` : ''}
                        ${isAdmin ? `
                            <button class="btn btn-sm delete-tc-grid" data-tc-id="${tc.id}" title="Eliminar" style="padding: 3px 10px; font-size: 0.65rem; font-weight: 800; opacity: ${activeRunId ? '0.3' : '1'}; cursor: ${activeRunId ? 'not-allowed' : 'pointer'}; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">🗑️</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    },

    renderExpandedDetailRow(tc, suite, isAdmin, user) {
        const isEditing = this.editingTCId === tc.id;
        const readOnlyAttr = isEditing ? '' : 'disabled';
        const readOnlyClass = isEditing ? '' : 'is-readonly';
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);
        const linkedUS = (Store.state.userStories || []).find(u => Number(u.id) === Number(tc.us_id));
        const executions = tc.executions || [];
        const tabs = ['steps', 'expected', 'metadata', 'evidencia'];
        const tabLabels = { steps: 'Pasos', expected: 'Esperado', metadata: 'Metadata', evidencia: 'Evidencia' };

        return `
            <tr class="ts-expanded-row" style="border-bottom: 1px solid var(--border); background: var(--bg-surface-elevated);">
                <td colspan="8" style="padding: 0;">
                    <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
                        <!-- Header row: TC info + actions -->
                        <div style="display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                            <div style="flex: 1;">
                                <span style="font-size: 0.65rem; font-weight: 800; color: var(--brand);">${UI.escapeHTML(tc.key_id || 'TC')}</span>
                                <span style="margin: 0 8px; color: var(--text-muted);">·</span>
                                <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">${UI.escapeHTML(tc.title)}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${isEditing ? `
                                    <button class="btn btn-ghost btn-sm cancel-edit-btn" data-tc-id="${tc.id}">Cancelar</button>
                                    <button class="btn btn-primary btn-sm save-tc-btn" data-tc-id="${tc.id}">Guardar</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm edit-tc-btn" data-tc-id="${tc.id}">✏️ EDITAR</button>
                                `}
                            </div>
                        </div>

                        <!-- Tabs -->
                        <div class="ts-expanded-tabs" style="display: flex; gap: 4px; border-bottom: 1px solid var(--border); padding-bottom: 0;">
                            ${tabs.map(t => `
                                <button class="ts-expanded-tab ${this.detailTab === t ? 'active' : ''}" data-tab="${t}" data-tc-id="${tc.id}"
                                    style="padding: 8px 16px; background: none; border: none; color: ${this.detailTab === t ? 'var(--brand)' : 'var(--text-muted)'}; font-size: 0.78rem; font-weight: ${this.detailTab === t ? '800' : '500'}; cursor: pointer; border-bottom: 2px solid ${this.detailTab === t ? 'var(--brand)' : 'transparent'}; margin-bottom: -1px; transition: all 0.15s;">
                                    ${tabLabels[t]}
                                </button>
                            `).join('')}
                        </div>

                        <!-- Tab Content -->
                        <div class="ts-expanded-body" style="display: flex; flex-direction: column; gap: 14px;">
                            ${this.renderDetailTabContent(tc, suite, isEditing, readOnlyAttr, readOnlyClass, linkedUS, assignee, isAdmin)}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    },

    renderDetailPanel(tc, suite) {
        const isEditing = this.editingTCId === tc.id;
        const readOnlyAttr = isEditing ? '' : 'disabled';
        const readOnlyClass = isEditing ? '' : 'is-readonly';
        const linkedUS = (Store.state.userStories || []).find(u => Number(u.id) === Number(tc.us_id));
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';

        const tabs = ['steps', 'expected', 'metadata', 'evidencia'];
        const tabLabels = { steps: 'Pasos', expected: 'Esperado', metadata: 'Metadata', evidencia: 'Evidencia' };

        return `
            <div class="ts-detail-panel" style="border-left: 1px solid var(--border); background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden;">
                <!-- Panel Header -->
                <div style="padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.68rem; color: var(--brand); font-weight: 800; margin-bottom: 2px;">${UI.escapeHTML(tc.key_id || 'TC')}</div>
                        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(tc.title)}</div>
                    </div>
                    <button id="ts-close-detail" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 4px;">✕</button>
                </div>

                <!-- Tabs -->
                <div class="ts-detail-tabs" style="display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;">
                    ${tabs.map(t => `
                        <button class="ts-detail-tab ${this.detailTab === t ? 'active' : ''}" data-tab="${t}"
                            style="flex: 1; padding: 10px 8px; background: none; border: none; color: ${this.detailTab === t ? 'var(--brand)' : 'var(--text-muted)'}; font-size: 0.78rem; font-weight: ${this.detailTab === t ? '800' : '500'}; cursor: pointer; border-bottom: 2px solid ${this.detailTab === t ? 'var(--brand)' : 'transparent'}; transition: all 0.15s;">
                            ${tabLabels[t]}
                        </button>
                    `).join('')}
                </div>

                <!-- Tab Content -->
                <div class="ts-detail-body" style="flex: 1; overflow-y: auto; padding: 16px;">
                    ${this.renderDetailTabContent(tc, suite, isEditing, readOnlyAttr, readOnlyClass, linkedUS, assignee, isAdmin)}
                </div>

                <!-- Actions Footer -->
                <div style="padding: 12px 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                    ${isEditing ? `
                        <button class="btn btn-ghost btn-sm cancel-edit-btn" data-tc-id="${tc.id}">Cancelar</button>
                        <button class="btn btn-primary btn-sm save-tc-btn" data-tc-id="${tc.id}">Guardar</button>
                    ` : `
                        <button class="btn btn-primary btn-sm edit-tc-btn" data-tc-id="${tc.id}">✏️ EDITAR</button>
                    `}
                </div>
            </div>
        `;
    },

    renderDetailTabContent(tc, suite, isEditing, readOnlyAttr, readOnlyClass, linkedUS, assignee, isAdmin) {
        switch (this.detailTab) {
            case 'steps':
                return `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="field-group">
                            <label class="field-label">Precondiciones</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="preconditions" ${readOnlyAttr} style="min-height: 60px;">${UI.escapeHTML(tc.preconditions || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Pasos del Test</label>
                            <div class="highlighter-container">
                                <div class="highlighter-backdrop">${UI.highlightSteps(tc.steps)}</div>
                                <textarea class="tc-edit-field highlighted-textarea ${readOnlyClass}" data-field="steps" ${readOnlyAttr} style="min-height: 180px;">${UI.escapeHTML(tc.steps || '')}</textarea>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Datos de Prueba</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="test_data" ${readOnlyAttr} style="min-height: 60px;">${UI.escapeHTML(tc.test_data || '')}</textarea>
                        </div>
                    </div>
                `;

            case 'expected':
                return `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="field-group">
                            <label class="field-label">Resultado Esperado</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="expected_result" ${readOnlyAttr} style="min-height: 100px;">${UI.escapeHTML(tc.expected_result || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Criterios de Aceptación</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="acceptance_criteria" ${readOnlyAttr} style="min-height: 100px;">${UI.escapeHTML(tc.acceptance_criteria || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Suposiciones</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="assumptions" ${readOnlyAttr} style="min-height: 60px;">${UI.escapeHTML(tc.assumptions || '')}</textarea>
                        </div>
                    </div>
                `;

            case 'metadata':
                return `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="tt-editor-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="field-group">
                                <label class="field-label">Historia de Usuario</label>
                                <select class="tc-us-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" ${readOnlyAttr}>
                                    <option value="">— No vinculada —</option>
                                    ${Store.state.userStories.map(us => {
                                        const fullTitle = `${us.key_id} - ${us.title}`;
                                        const displayTitle = fullTitle.length > 80 ? fullTitle.substring(0, 80) + '...' : fullTitle;
                                        return `<option value="${us.id}" ${us.id === tc.us_id ? 'selected' : ''} title="${UI.escapeHTML(fullTitle)}">${UI.escapeHTML(displayTitle)}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Asignado a</label>
                                <select class="tc-assign-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" ${readOnlyAttr}>
                                    <option value="">— Sin asignar —</option>
                                    ${(Store.state.team || []).map(u => `
                                        <option value="${u.id}" ${u.id === tc.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)} (${UI.escapeHTML(u.role)})</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="tt-editor-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="field-group">
                                <label class="field-label">Prioridad</label>
                                <select class="tc-meta-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" data-field="priority" ${readOnlyAttr}>
                                    ${['Alta', 'Media', 'Baja'].map(p => `<option value="${p}" ${tc.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Epic Jira</label>
                                <select class="tc-meta-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" data-field="jira_epic_key" ${readOnlyAttr}>
                                    <option value="">— Sin Épica —</option>
                                    ${(Store.state.jiraEpics || []).map(e => `<option value="${e.key}" ${tc.jira_epic_key === e.key ? 'selected' : ''}>${e.key} - ${e.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div style="background: rgba(0,0,0,0.1); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 10px;">
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.78rem; cursor: pointer;">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_smoke" ${tc.is_smoke ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                💨 Smoke
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.78rem; cursor: pointer;">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_regression" ${tc.is_regression ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                🔄 Regresión
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.78rem; cursor: pointer;">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_integration" ${tc.is_integration ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                🔗 Integración
                            </label>
                        </div>
                        ${linkedUS ? `
                            <button class="btn btn-ghost btn-sm view-hu-details" data-us-id="${linkedUS.id}" style="font-size: 0.72rem; font-weight: 800; color: var(--brand); border-color: rgba(59,130,246,0.2); padding: 5px 12px; align-self: flex-start;">
                                📖 Ver Detalles de HU
                            </button>
                        ` : ''}
                    </div>
                `;

            case 'evidencia':
                const executions = tc.executions || [];
                if (executions.length === 0) {
                    return `<div style="text-align: center; padding: 40px; opacity: 0.4; color: var(--text-muted); font-size: 0.85rem;">Sin ejecuciones aún</div>`;
                }
                return `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${executions.map(exec => {
                            const execDate = exec.executed_at ? this._formatDate(exec.executed_at) : '—';
                            const execStatus = exec.status === 'OK' ? 'PASS' : UI.escapeHTML(exec.status || 'PENDING');
                            const statusClass = (exec.status || 'pending').toLowerCase();
                            const attachments = exec.attachments || [];
                            return `
                                <div style="background: rgba(0,0,0,0.15); border: 1px solid var(--border); border-radius: 10px; padding: 12px;">
                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                        <span class="status-pill ${statusClass}" style="font-size: 8px; width: 55px; text-align: center; justify-content: center; font-weight: 700; display: inline-flex; padding: 2px 5px;">${execStatus}</span>
                                        <span style="font-size: 0.75rem; color: var(--text-muted);">${execDate}</span>
                                        ${exec.executed_by_name ? `<span style="font-size: 0.72rem; color: var(--text-muted);">· ${UI.escapeHTML(exec.executed_by_name)}</span>` : ''}
                                    </div>
                                    ${exec.notes ? `<div style="font-size: 0.8rem; color: var(--text-main); margin-bottom: 8px; line-height: 1.5;">${UI.escapeHTML(exec.notes)}</div>` : ''}
                                    ${attachments.length > 0 ? `
                                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                            ${attachments.map(att => `
                                                <a href="/api/attachments/${att.id}" target="_blank" style="font-size: 0.72rem; background: rgba(99,102,241,0.1); color: var(--brand); padding: 3px 10px; border-radius: 6px; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                                                    📎 ${UI.escapeHTML(att.filename || 'archivo')}
                                                </a>
                                            `).join('')}
                                        </div>
                                    ` : '<div style="font-size: 0.75rem; opacity: 0.4; color: var(--text-muted);">Sin evidencia</div>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;

            default:
                return '';
        }
    },

    renderExecutionOverlay() {
        if (!this.executionOverlay) return '';
        const { tcId, status, logs } = this.executionOverlay;
        return `
            <div id="ts-exec-overlay" style="position: fixed; bottom: 20px; right: 20px; width: 480px; background: var(--bg-surface-elevated); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); z-index: 9998; overflow: hidden;">
                <div style="padding: 14px 16px; background: linear-gradient(135deg,#6366f1,#a855f7); display: flex; align-items: center; gap: 10px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite;"></div>
                    <span style="font-size: 0.85rem; font-weight: 800; color: white;">Ejecución en curso</span>
                    <button id="ts-exec-close" style="margin-left: auto; background: rgba(0,0,0,0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 0.9rem;">✕</button>
                </div>
                <div style="padding: 14px 16px; font-size: 0.78rem; color: var(--text-muted); max-height: 200px; overflow-y: auto; font-family: monospace;">
                    ${(logs || []).map(log => `<div style="margin-bottom: 4px;">${UI.escapeHTML(log)}</div>`).join('')}
                </div>
            </div>
        `;
    },

    _formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    },

    showHUDrawer(usId) {
        const us = Store.state.userStories.find(u => Number(u.id) === Number(usId));
        if (!us) return;

        const overlay = document.getElementById('hu-drawer-overlay');
        const drawer = document.getElementById('hu-drawer');

        drawer.innerHTML = `
            <div class="hu-drawer-header">
                <div>
                    <span style="font-size: 0.65rem; font-weight: 800; color: var(--brand); letter-spacing: 0.1em; display: block; margin-bottom: 4px;">${UI.escapeHTML(us.key_id)}</span>
                    <h3 style="margin: 0; font-size: 1rem; font-weight: 800;">${UI.escapeHTML(us.title)}</h3>
                </div>
                <button class="btn-icon close-hu-drawer" style="font-size: 1.2rem;">✕</button>
            </div>
            <div class="hu-drawer-body">
                <section>
                    <div class="hu-drawer-section-title">🎯 Reglas de Negocio</div>
                    <div class="hu-drawer-content">${UI.escapeHTML(us.reglas_negocio || 'No hay reglas de negocio definidas.')}</div>
                </section>
                <section>
                    <div class="hu-drawer-section-title">⚙️ Precondiciones</div>
                    <div class="hu-drawer-content">${UI.escapeHTML(us.precondiciones || 'No hay precondiciones registradas.')}</div>
                </section>
            </div>
        `;

        overlay.classList.add('is-open');
        drawer.classList.add('is-open');

        const close = () => {
            overlay.classList.remove('is-open');
            drawer.classList.remove('is-open');
        };

        drawer.querySelector('.close-hu-drawer').onclick = close;
        overlay.onclick = close;
    },

    bindEvents(container) {
        // Global clear TC function
        window.__tsClearTC = () => {
            this.selectedTCId = null;
            this.render(container);
        };

        // Edit mode toggle
        container.querySelectorAll('.edit-tc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const mainContent = container.querySelector('.ts-main-content');
                const sidebarList = container.querySelector('.ts-sidebar-list');
                this._lastMainScroll = mainContent ? mainContent.scrollTop : 0;
                this._lastSidebarScroll = sidebarList ? sidebarList.scrollTop : 0;
                this._lastWindowScrollY = window.scrollY;

                this.editingTCId = parseInt(btn.dataset.tcId);
                this.render(container);
            });
        });

        // Cancel edit
        container.querySelectorAll('.cancel-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.editingTCId = null;
                this.render(container);
            });
        });

        // Auto-resize textareas
        container.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => {
                UI.autoResizeTextarea(tx);
                if (tx.classList.contains('highlighted-textarea')) {
                    const backdrop = tx.previousElementSibling;
                    if (backdrop && backdrop.classList.contains('highlighter-backdrop')) {
                        backdrop.innerHTML = UI.highlightSteps(tx.value) + '\n';
                    }
                }
            });
            tx.addEventListener('scroll', () => {
                const backdrop = tx.previousElementSibling;
                if (backdrop && backdrop.classList.contains('highlighter-backdrop')) {
                    backdrop.scrollTop = tx.scrollTop;
                }
            });
        });

        // Search input
        container.querySelector('#ts-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.render(container);
        });

        // Status filter
        container.querySelector('#ts-filter-status')?.addEventListener('change', (e) => {
            this.filterStatus = e.target.value;
            this.render(container);
        });

        // Detail tab switching (expanded row tabs + old panel tabs)
        container.querySelectorAll('.ts-expanded-tab, .ts-detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.detailTab = tab.dataset.tab;
                this.render(container);
            });
        });

        // TC row click -> select (toggle if same)
        container.querySelectorAll('.ts-grid-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const tcId = parseInt(row.dataset.tcId);
                this.selectedTCId = (this.selectedTCId === tcId) ? null : tcId;
                this.editingTCId = null;
                this.render(container);
            });
        });

        // Assign Suite Responsible
        container.querySelectorAll('.suite-assign-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const suiteId = sel.dataset.id;
                const userId = parseInt(e.target.value) || null;
                UI.showLoading();
                await ApiService.updateTestSuite(suiteId, { assigned_to: userId });
                const ucId = Store.state.selectedUseCaseId;
                const { testSuites } = await ApiService.getTestSuites(ucId);
                Store.setTestSuites(testSuites || []);
                this.render(container);
                UI.hideLoading();
                UI.toast('Responsable de suite actualizado');
            });
        });

        // UC Filter
        container.querySelector('#uc-filter')?.addEventListener('change', async (e) => {
            const ucId = parseInt(e.target.value) || null;
            Store.setSelectedUseCase(ucId);
            await this.loadSuitesForUC(ucId);
        });

        // New Suite
        container.querySelector('#btn-new-suite')?.addEventListener('click', () => {
            if (!Store.state.selectedUseCaseId) return UI.toast('Selecciona un Caso de Uso primero', 'error');
            Modals.render('new-suite');
        });

        // Suite search
        let suiteSearchTimeout;
        container.querySelector('#suite-search')?.addEventListener('input', (e) => {
            clearTimeout(suiteSearchTimeout);
            suiteSearchTimeout = setTimeout(() => {
                this.suiteSearchQuery = e.target.value;
                this.render(container);
            }, 150);
        });

        // Seleccionar suite desde sidebar
        container.querySelectorAll('.ts-suite-row').forEach(row => {
            row.addEventListener('click', () => {
                this.selectedSuiteId = parseInt(row.dataset.id);
                this.selectedTCId = null;
                this.render(container);
            });
        });

        // Ver detalles HU
        container.querySelectorAll('.view-hu-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showHUDrawer(btn.dataset.usId);
            });
        });

        // Edit suite title
        container.querySelectorAll('.edit-suite').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const suite = Store.state.testSuites.find(s => s.id === id);
                if (suite) {
                    Modals.render('edit-suite', { suite });
                }
            });
        });

        // Delete suite
        container.querySelectorAll('.delete-suite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                if (!await modalManager.confirm('¿Eliminar esta Suite y todos sus Test Cases?')) return;
                UI.showLoading();
                await ApiService.deleteTestSuite(id);
                this.selectedSuiteId = null;
                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Suite eliminada');
            });
        });

        // Run Suite
        container.querySelectorAll('.run-suite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const suiteId = parseInt(btn.dataset.id);
                const suite = Store.state.testSuites.find(s => s.id === suiteId);

                if (suite?.active_run_id) {
                    ExecutionTab.projectSuites = [];
                    Store.setState({ activeTab: 'execution' });
                    return;
                }

                UI.showLoading();
                try {
                    const res = await ApiService.startSuiteExecution(suiteId, true);
                    if (res.ok) {
                        ExecutionTab.projectSuites = [];
                        UI.toast('🚀 Ejecución de tests asignados iniciada');
                        Store.setState({ activeTab: 'execution' });
                    }
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });

        // Run Individual TC from grid
        container.querySelectorAll('.run-tc-grid').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.id);
                UI.showLoading();
                try {
                    const res = await ApiService.startTestCaseExecution(tcId);
                    if (res.ok) {
                        ExecutionTab.projectSuites = [];
                        UI.toast('⚡ Ejecución individual iniciada');
                        Store.setState({ activeTab: 'execution' });
                    }
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });

        // Nuevo Test Case
        container.querySelector('#btn-new-tc')?.addEventListener('click', async (e) => {
            const suiteId = parseInt(e.target.dataset.suiteId);
            UI.showLoading();
            await ApiService.createTestCase({ suite_id: suiteId, title: 'Nueva prueba' });
            await this.reloadSuites();
            UI.hideLoading();
            UI.toast('Test Case creado');
        });

        // Import XLSX
        container.querySelector('#btn-sidebar-import-xlsx')?.addEventListener('click', () => {
            Modals.render('import-dual', {
                suiteId: this.selectedSuiteId,
                useCaseId: Store.state.selectedUseCaseId,
                onSuccess: async () => {
                    await this.reloadSuites();
                    this.render(container);
                }
            });
        });

        // Export Matrix
        container.querySelector('#btn-export-matrix')?.addEventListener('click', () => {
            const ucId = Store.state.selectedUseCaseId;
            if (!ucId) return UI.toast('Selecciona un Caso de Uso primero', 'error');
            UI.toast('Generando Matriz Completa...', 'ok');
            ApiService.exportUseCaseMatrix(ucId);
        });

        // Delete TC from grid
        container.querySelectorAll('.delete-tc-grid').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                if (!await modalManager.confirm('¿Eliminar este Test Case?')) return;
                UI.showLoading();
                await ApiService.deleteTestCase(tcId);
                this.selectedTCId = null;
                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Test Case eliminado');
            });
        });

        // Save TC
        container.querySelectorAll('.save-tc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.disabled) return;

                const mainContent = container.querySelector('.ts-main-content');
                const mainScroll = mainContent ? mainContent.scrollTop : 0;
                const windowScrollY = window.scrollY;

                const tcId = parseInt(btn.dataset.tcId);
                const tc = Store.state.testSuites.flatMap(s => s.test_cases || []).find(t => t.id === tcId);
                if (!tc) return;

                const title = tc.title;
                const us_id = container.querySelector(`.tc-us-select-detail[data-tc-id="${tcId}"]`)?.value;
                const assigned_to = container.querySelector(`.tc-assign-select-detail[data-tc-id="${tcId}"]`)?.value;
                const steps = container.querySelector(`textarea[data-field="steps"]`)?.value;
                const expected_result = container.querySelector(`textarea[data-field="expected_result"]`)?.value;
                const preconditions = container.querySelector(`textarea[data-field="preconditions"]`)?.value;
                const test_data = container.querySelector(`textarea[data-field="test_data"]`)?.value;
                const acceptance_criteria = container.querySelector(`textarea[data-field="acceptance_criteria"]`)?.value;
                const assumptions = container.querySelector(`textarea[data-field="assumptions"]`)?.value;
                const priority = container.querySelector(`.tc-meta-select-detail[data-tc-id="${tcId}"][data-field="priority"]`)?.value || 'Media';
                const jira_epic_key = container.querySelector(`.tc-meta-select-detail[data-tc-id="${tcId}"][data-field="jira_epic_key"]`)?.value || '';
                const is_smoke = container.querySelector(`.tc-meta-check-detail[data-tc-id="${tcId}"][data-field="is_smoke"]`)?.checked || false;
                const is_regression = container.querySelector(`.tc-meta-check-detail[data-tc-id="${tcId}"][data-field="is_regression"]`)?.checked || false;
                const is_integration = container.querySelector(`.tc-meta-check-detail[data-tc-id="${tcId}"][data-field="is_integration"]`)?.checked || false;

                const payload = {
                    title,
                    us_id: us_id ? parseInt(us_id) : null,
                    assigned_to: assigned_to ? parseInt(assigned_to) : null,
                    steps, expected_result, preconditions, test_data, acceptance_criteria, assumptions,
                    priority, jira_epic_key, is_smoke, is_regression, is_integration
                };

                UI.showLoading();
                await ApiService.updateTestCase(tcId, payload);
                this.editingTCId = null;
                this._lastMainScroll = mainScroll;
                this._lastWindowScrollY = windowScrollY;

                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Test Case guardado exitosamente');
            });
        });

        // Execution overlay close
        container.querySelector('#ts-exec-close')?.addEventListener('click', () => {
            this.executionOverlay = null;
            this.render(container);
        });

        // Bind AI Gemini Generator
        this.bindGeminiModal(container);
    },

    _geminiImages: [],

    bindGeminiModal(container) {
        container.querySelector('#btn-ai-gen-tc')?.addEventListener('click', (e) => {
            const suiteId = parseInt(e.currentTarget.dataset.suiteId);
            this.openGeminiModal(container, suiteId);
        });
    },

    openGeminiModal(container, suiteId) {
        this._geminiImages = [];
        document.getElementById('modal-gemini-tc')?.remove();

        const savedKey = localStorage.getItem('gemini_api_key') || '';
        const modal = document.createElement('div');
        modal.id = 'modal-gemini-tc';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="max-width:760px;width:95vw;max-height:90vh;display:flex;flex-direction:column;background:rgba(10,12,28,0.98);border:1px solid rgba(99,102,241,0.35);border-radius:20px;box-shadow:0 30px 60px rgba(0,0,0,0.7);overflow:hidden;">
                <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:16px 24px;color:white;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <div>
                        <h2 style="margin:0;font-size:1.1rem;font-weight:800;">✨ Generar Tests con Gemini IA</h2>
                        <p style="margin:3px 0 0;font-size:0.75rem;opacity:0.75;">Los tests se crean directamente en la suite actual.</p>
                    </div>
                    <button id="gemini-tc-close" style="background:rgba(0,0,0,0.25);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;">&times;</button>
                </div>
                <div style="padding:10px 24px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px;flex-shrink:0;">
                    <label style="font-size:0.68rem;font-weight:800;color:#818cf8;white-space:nowrap;text-transform:uppercase;">🔑 API Key</label>
                    <input id="gemini-tc-key" type="password" placeholder="AIza..." value="${savedKey}"
                        style="flex:1;padding:6px 10px;border-radius:7px;border:1px solid rgba(99,102,241,0.4);background:rgba(255,255,255,0.05);color:white;font-family:monospace;font-size:0.78rem;outline:none;"/>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:0.68rem;color:#818cf8;white-space:nowrap;text-decoration:none;">Obtener →</a>
                </div>
                <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px;">
                    <div>
                        <div style="font-size:0.68rem;font-weight:800;color:#818cf8;text-transform:uppercase;margin-bottom:6px;">📋 Historia de Usuario / Contexto</div>
                        <textarea id="gemini-tc-hu" placeholder="Pegá aquí el texto de la HU, criterios de aceptación, reglas de negocio..."
                            style="width:100%;min-height:130px;padding:14px;border-radius:10px;border:1px solid rgba(99,102,241,0.3);background:rgba(255,255,255,0.04);color:white;font-family:inherit;font-size:0.88rem;line-height:1.6;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;font-weight:800;color:#818cf8;text-transform:uppercase;margin-bottom:6px;">🖼️ Imágenes <span style="font-weight:400;color:#64748b;">(opcional — Ctrl+V, drag & drop o click)</span></div>
                        <div id="gemini-tc-dropzone"
                            style="min-height:80px;border:2px dashed rgba(99,102,241,0.4);border-radius:10px;background:rgba(99,102,241,0.04);display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;cursor:pointer;transition:border-color 0.2s;"
                            ondragover="event.preventDefault();this.style.borderColor='#6366f1';" ondragleave="this.style.borderColor='rgba(99,102,241,0.4)';"
                            ondrop="window._geminiTcDrop(event)">
                            <div id="gemini-tc-placeholder" style="color:#64748b;font-size:0.78rem;width:100%;text-align:center;">📎 Arrastrá imágenes aquí, hacé click o Ctrl+V</div>
                            <div id="gemini-tc-previews" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
                        </div>
                        <input type="file" id="gemini-tc-file" accept="image/*" multiple style="display:none;" />
                    </div>
                    <div id="gemini-tc-status" style="display:none;font-size:0.8rem;padding:10px 14px;border-radius:8px;font-weight:600;"></div>
                </div>
                <div style="padding:14px 24px;background:rgba(0,0,0,0.25);border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                    <button id="gemini-tc-cancel" style="padding:9px 18px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#64748b;font-weight:600;cursor:pointer;font-size:0.85rem;">Cancelar</button>
                    <button id="gemini-tc-submit" style="padding:9px 24px;border-radius:9px;border:none;background:linear-gradient(to right,#6366f1,#a855f7);color:white;font-weight:800;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;gap:8px;">
                        <span id="gemini-tc-btn-icon">✨</span><span id="gemini-tc-btn-label">Generar Tests</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => { modal.remove(); this._geminiImages = []; this._removePasteListener?.(); };
        modal.querySelector('#gemini-tc-close').onclick = close;
        modal.querySelector('#gemini-tc-cancel').onclick = close;
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        const fileInput = modal.querySelector('#gemini-tc-file');
        modal.querySelector('#gemini-tc-dropzone').addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            fileInput.click();
        });
        fileInput.onchange = (e) => this._addGeminiImages(Array.from(e.target.files));

        modal.querySelector('#gemini-tc-key').addEventListener('input', (e) => {
            localStorage.setItem('gemini_api_key', e.target.value);
        });

        window._geminiTcDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('gemini-tc-dropzone').style.borderColor = 'rgba(99,102,241,0.4)';
            this._addGeminiImages(Array.from(e.dataTransfer.files));
        };

        const pasteHandler = (e) => {
            if (!document.getElementById('modal-gemini-tc')) return;
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
            let found = false;
            for (const item of items) {
                if (item.type.startsWith('image/')) { this._addGeminiImages([item.getAsFile()]); found = true; }
            }
            if (found) e.preventDefault();
        };
        document.addEventListener('paste', pasteHandler);
        this._removePasteListener = () => document.removeEventListener('paste', pasteHandler);

        modal.querySelector('#gemini-tc-submit').onclick = () => this._callGemini(suiteId, container);
    },

    _addGeminiImages(files) {
        files.filter(f => f?.type.startsWith('image/')).forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                this._geminiImages.push({ mimeType: file.type, base64: ev.target.result.split(',')[1] });
                this._renderGeminiPreviews();
            };
            reader.readAsDataURL(file);
        });
    },

    _renderGeminiPreviews() {
        const container = document.getElementById('gemini-tc-previews');
        const placeholder = document.getElementById('gemini-tc-placeholder');
        if (!container) return;
        placeholder.style.display = this._geminiImages.length ? 'none' : 'block';
        container.innerHTML = this._geminiImages.map((img, i) => `
            <div style="position:relative;width:70px;height:70px;">
                <img src="data:${img.mimeType};base64,${img.base64}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid rgba(99,102,241,0.4);" />
                <button onclick="window._geminiRmImg(${i})" style="position:absolute;top:-5px;right:-5px;background:#ef4444;border:none;color:white;border-radius:50%;width:17px;height:17px;cursor:pointer;font-size:0.6rem;padding:0;">&times;</button>
            </div>`).join('');
        window._geminiRmImg = (i) => { this._geminiImages.splice(i, 1); this._renderGeminiPreviews(); };
    },

    _setGeminiStatus(msg, type) {
        const el = document.getElementById('gemini-tc-status');
        if (!el) return;
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
        const map = { info: ['rgba(99,102,241,0.15)', '#818cf8'], error: ['rgba(239,68,68,0.15)', '#ef4444'], ok: ['rgba(34,197,94,0.15)', '#22c55e'] };
        const [bg, color] = map[type] || map.info;
        el.style.background = bg; el.style.color = color; el.style.border = `1px solid ${color}33`;
    },

    async _callGemini(suiteId, tabContainer) {
        const apiKey = (document.getElementById('gemini-tc-key')?.value || '').trim();
        if (!apiKey) return this._setGeminiStatus('⚠️ Ingresá tu API Key de Gemini.', 'error');

        const hu = (document.getElementById('gemini-tc-hu')?.value || '').trim();
        if (!hu && this._geminiImages.length === 0) return this._setGeminiStatus('⚠️ Escribí una HU o pegá al menos una imagen.', 'error');

        const btn = document.getElementById('gemini-tc-submit');
        if (btn) { btn.disabled = true; }
        document.getElementById('gemini-tc-btn-icon').textContent = '⏳';
        document.getElementById('gemini-tc-btn-label').textContent = 'Generando...';
        this._setGeminiStatus('🔄 Consultando a Gemini...', 'info');

        const SYSTEM_PROMPT = `Eres un Senior QA Analyst y Product Owner experto en metodologías Ágiles, análisis funcional y trazabilidad de requisitos.

Tu tarea es analizar la Historia de Usuario (HU) proporcionada —incluyendo imágenes de pantallas o flujos si las hay— y generar casos de prueba exhaustivos y estructurados.

### INSTRUCCIONES OBLIGATORIAS:
1. Identifica el nombre o título de la HU analizada.
2. Detecta inconsistencias, ambigüedades o información faltante en la HU (máximo 5).
3. Genera todos los escenarios de prueba necesarios para cubrir los flujos feliz, alternativos y de error.

### FORMATO DE RESPUESTA:
Devuelve ÚNICAMENTE un array JSON válido. Cada elemento representa UN test case con esta estructura exacta:
- hu_name: string (nombre o título de la HU analizada, igual para todos los tests del mismo lote)
- inconsistencies: array de objetos { title: string } (detectadas en la HU; mismo valor para todos los tests del lote)
- title: string (título claro y conciso del test case)
- gherkin: string (escenario Gherkin en español; CADA paso en una línea nueva sin indentación, empezando al inicio de la línea. Ejemplo exacto del formato: "Dado: el usuario está en la pantalla de login\nCuando: ingresa credenciales válidas\nY: presiona el botón Ingresar\nEntonces: el sistema muestra el dashboard principal")
- preconditions: array de strings
- testData: array de strings
- acceptanceCriteria: array de strings
- expectedResult: string
- assumption: string (supuesto asumido para generar este test; vacío si no aplica)

### REGLAS:
- Nunca devuelvas texto fuera del JSON.
- No uses bloques markdown ni backticks.
- El campo hu_name e inconsistencies deben ser idénticos en todos los objetos del array.
- Si no detectás inconsistencias, devuelve inconsistencies: [].`;

        const parts = [];
        if (hu) parts.push({ text: hu });
        this._geminiImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));

        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                        contents: [{ role: 'user', parts }],
                        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
                    })
                }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(clean);
            if (!Array.isArray(parsed)) throw new Error('La respuesta no es un array JSON.');

            this._setGeminiStatus(`✅ Creando ${parsed.length} tests en la suite...`, 'ok');

            const huName = parsed[0]?.hu_name || '';
            const inconsistencies = parsed[0]?.inconsistencies || [];

            UI.showLoading();

            if (inconsistencies.length > 0) {
                const currentSuite = Store.state.testSuites.find(s => s.id === suiteId);
                const rawExisting = currentSuite?.inconsistencies;
                const existingInconsistencies = Array.isArray(rawExisting) ? rawExisting : (() => { try { return JSON.parse(rawExisting || '[]'); } catch { return []; } })();
                const newInconsistencies = inconsistencies.filter(inc => !existingInconsistencies.some(e => e.title === inc.title));
                if (newInconsistencies.length > 0) {
                    await ApiService.updateSuiteInconsistencies(suiteId, [...existingInconsistencies, ...newInconsistencies]);
                }
            }

            for (const item of parsed) {
                const precStr = Array.isArray(item.preconditions) ? item.preconditions.join('\n') : '';
                const tdStr = Array.isArray(item.testData) ? item.testData.join('\n') : '';
                const acStr = Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria.join('\n') : '';
                await ApiService.createTestCase({
                    suite_id: suiteId,
                    title: item.title || 'Test generado por IA',
                    steps: item.gherkin || '',
                    expected_result: item.expectedResult || '',
                    preconditions: precStr,
                    test_data: tdStr,
                    acceptance_criteria: acStr,
                    assumptions: item.assumption || ''
                });
            }

            await this.reloadSuites();
            UI.hideLoading();
            UI.toast(`🚀 ${parsed.length} tests generados${huName ? ` — HU: "${huName}"` : ''}`, 'ok');
            document.getElementById('modal-gemini-tc')?.remove();
            this._removePasteListener?.();
            this.render(tabContainer);

        } catch (err) {
            console.error('[Gemini TC]', err);
            this._setGeminiStatus(`❌ Error: ${err.message}`, 'error');
            if (btn) btn.disabled = false;
            document.getElementById('gemini-tc-btn-icon').textContent = '✨';
            document.getElementById('gemini-tc-btn-label').textContent = 'Reintentar';
            UI.hideLoading();
        }
    },

    async reloadSuites() {
        await this.loadSuitesForUC(Store.state.selectedUseCaseId);
    },

    async loadSuitesForUC(ucId) {
        if (!ucId) {
            Store.setTestSuites([]);
            return;
        }
        UI.showLoading();
        try {
            const { testSuites } = await ApiService.getTestSuites(ucId);
            Store.setTestSuites(testSuites || []);
            this.selectedSuiteId = testSuites?.[0]?.id || null;
        } catch(err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();
    },

    setupRealtimeListener() {
        if (this._isListening) return;
        window.addEventListener('realtime-refresh', async () => {
            const container = document.getElementById('tab-content');
            if (Store.state.activeTab === 'test-suites' && container) {
                console.log('⚡ Realtime: Refreshing Test Suites...');
                await this.reloadSuites();
                this.render(container);
            }
        });
        this._isListening = true;
    }
};