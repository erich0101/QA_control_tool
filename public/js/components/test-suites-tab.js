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
    suiteSearchQuery: '',
    _lastJiraProjectId: null,
    _lastMainScroll: 0,
    _lastSidebarScroll: 0,

    render(container) {
        const sidebarList = container.querySelector('.ts-sidebar-list');
        const mainContent = container.querySelector('.ts-main-content');
        const sidebarScroll = sidebarList ? sidebarList.scrollTop : 0;
        const mainScroll = mainContent ? mainContent.scrollTop : 0;

        const useMainScroll = this._lastMainScroll > 0 ? this._lastMainScroll : mainScroll;
        const useSidebarScroll = this._lastSidebarScroll > 0 ? this._lastSidebarScroll : sidebarScroll;

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
                    <div class="ts-sidebar-header" style="padding: 16px; background: var(--apple-bg-elevated); border-bottom: 1px solid var(--apple-separator);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">Test Suites</span>
                            <div style="display: flex; gap: 6px;">
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);" title="Total de Suites">${testSuites.length} <span style="color: var(--apple-label-tertiary);">S</span></span>
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-blue); font-size: 0.62rem; font-weight: 600; color: white;" title="Total de Pruebas">${totalTests} <span style="opacity: 0.8;">T</span></span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="uc-filter" class="w-full" style="font-size: 0.78rem; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label);">
                                <option value="">Selecciona Caso de Uso</option>
                                ${Store.state.useCases.map(uc => `
                                    <option value="${uc.id}" ${uc.id === selectedUseCaseId ? 'selected' : ''}>${UI.escapeHTML(uc.key_id || 'CU')} - ${UI.escapeHTML(uc.title)}</option>
                                `).join('')}
                            </select>
                            <div style="position: relative;">
                                <input type="text" id="suite-search" placeholder="🔍 Buscar suite..." value="${UI.escapeHTML(this.suiteSearchQuery)}"
                                    style="width: 100%; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none; box-sizing: border-box; transition: border-color 0.15s;"
                                    onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'" />
                            </div>
                            <button class="btn btn-primary btn-sm" id="btn-new-suite" ${!selectedUseCaseId ? 'disabled' : ''} style="width: 100%; padding: 8px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--apple-radius-md);">+ Nueva Suite</button>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-ghost btn-sm" id="btn-sidebar-import-xlsx" ${!selectedUseCaseId ? 'disabled' : ''} style="flex: 1; font-size: 0.72rem; padding: 6px 10px; border-radius: var(--apple-radius-sm);">📥 Importar</button>
                                <button class="btn btn-sm" id="btn-export-matrix" ${!selectedUseCaseId ? 'disabled' : ''} style="flex: 1; font-size: 0.72rem; padding: 6px 10px; border-radius: var(--apple-radius-sm); background: var(--apple-green); border: none; color: white; font-weight: 600;">📊 Exportar</button>
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
            <div style="display: flex; flex-direction: column; gap: 4px;">
                ${filtered.map((suite, idx) => {
                    const isActive = this.selectedSuiteId === suite.id;
                    const isExecuting = !!suite.active_run_id;
                    const testCount = (suite.test_cases || []).length;

                    let incIndicator = '';
                    const incList = suite.inconsistencies || [];
                    if (incList.length > 0) {
                        incIndicator = `<span title="Tiene inconsistencias" style="font-size: 0.65rem; color: var(--apple-orange);">⚠️</span>`;
                    }

                    const selectedStyle = isActive ? `
                        background: var(--apple-indigo-soft);
                        border-left: 3px solid var(--apple-blue);
                        padding-left: 12px;
                    ` : `
                        border-left: 3px solid transparent;
                        padding-left: 12px;
                    `;

                    return `
                        <div class="ts-suite-row ${isActive ? 'selected' : ''}" data-id="${suite.id}"
                            style="border-radius: var(--apple-radius-md); padding: 10px 12px; cursor: pointer; transition: all 0.15s ease; ${selectedStyle}"
                            onmouseover="if(!this.classList.contains('selected')) this.style.background='var(--apple-fill)'"
                            onmouseout="if(!this.classList.contains('selected')) this.style.background='transparent'">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); letter-spacing: 0.03em;">SUITE #${suite.id}</span>
                                ${isExecuting ? '<span style="font-size: 6px; padding: 2px 5px; border-radius: 10px; background: var(--apple-green); color: white; font-weight: 700;">LIVE</span>' : ''}
                                ${incIndicator}
                            </div>
                            <div style="font-size: 0.82rem; font-weight: 600; color: var(--apple-label); margin-bottom: 4px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(suite.title)}</div>
                            <div style="font-size: 0.7rem; color: var(--apple-label-tertiary); display: flex; align-items: center; gap: 4px;">
                                <span style="color: var(--apple-blue);">🧪</span> ${testCount} tests${suite.assigned_to_name ? ` <span style="color: var(--apple-label-tertiary);">·</span> <span style="color: var(--apple-purple);">👤</span> ${UI.escapeHTML(suite.assigned_to_name)}` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    renderInconsistenciesPanel(suite) {
        const incList = suite?.inconsistencies || [];

        const sevColor = (sev) => ({ Alta: 'var(--apple-red)', Media: 'var(--apple-orange)', Baja: 'var(--apple-green)' }[sev] || 'var(--apple-indigo)');
        const sevBg = (sev) => ({ Alta: 'var(--apple-red-soft)', Media: 'var(--apple-orange-soft)', Baja: 'var(--apple-green-soft)' }[sev] || 'var(--apple-indigo-soft)');

        const altaCount = incList.filter(i => i.severity === 'Alta').length;
        const mediaCount = incList.filter(i => i.severity === 'Media').length;
        const bajaCount = incList.filter(i => i.severity === 'Baja').length;

        const badges = [];
        if (altaCount) badges.push(`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--apple-red-soft);color:var(--apple-red);padding:3px 10px;border-radius:20px;font-size:0.62rem;font-weight:600;"><span style="width:5px;height:5px;border-radius:50%;background:var(--apple-red);"></span>${altaCount} Alta</span>`);
        if (mediaCount) badges.push(`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--apple-orange-soft);color:var(--apple-orange);padding:3px 10px;border-radius:20px;font-size:0.62rem;font-weight:600;"><span style="width:5px;height:5px;border-radius:50%;background:var(--apple-orange);"></span>${mediaCount} Media</span>`);
        if (bajaCount) badges.push(`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--apple-green-soft);color:var(--apple-green);padding:3px 10px;border-radius:20px;font-size:0.62rem;font-weight:600;"><span style="width:5px;height:5px;border-radius:50%;background:var(--apple-green);"></span>${bajaCount} Baja</span>`);

        return `
            <div class="inc-panel" style="border-bottom:1px solid var(--apple-separator); background: var(--apple-bg-elevated);">
                <div class="inc-panel-header" onclick="window._toggleIncPanel(this)"
                    style="padding:10px 24px;cursor:pointer;display:flex;align-items:center;gap:10px;user-select:none;transition:background 0.15s;"
                    onmouseover="this.style.background='var(--apple-fill)'"
                    onmouseout="this.style.background='transparent'">
                    <span class="inc-chevron" style="font-size:0.65rem;transition:transform 0.2s ease;color:var(--apple-label-tertiary);">▶</span>
                    <span style="font-size:0.72rem;">⚠️</span>
                    <span style="font-size:0.68rem;font-weight:700;color:var(--apple-label);letter-spacing:0.02em;">Inconsistencias</span>
                    <span style="font-size:0.62rem;color:var(--apple-label-tertiary);font-weight:500;">${incList.length} total</span>
                    <div style="display:flex;gap:6px;margin-left:8px;">${badges.join('')}</div>
                </div>
                <div class="inc-panel-body" style="display:none;padding:12px 24px;background:var(--apple-bg-elevated); border-top: 1px solid var(--apple-separator);">
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${incList.map(inc => `
                            <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:var(--apple-radius-md);background:${sevBg(inc.severity)};border: 1px solid ${sevColor(inc.severity)}22;">
                                <span style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;color:${sevColor(inc.severity)};font-weight:700;min-width:50px;padding:3px 8px;border-radius:var(--apple-radius-sm);background:${sevColor(inc.severity)}15;">
                                    <span style="width:5px;height:5px;border-radius:50%;background:${sevColor(inc.severity)};"></span>
                                    ${inc.severity}
                                </span>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:0.8rem;font-weight:600;color:var(--apple-label);">${UI.escapeHTML(inc.title || '')}</div>
                                    ${inc.description ? `<div style="font-size:0.72rem;color:var(--apple-label-tertiary);margin-top:3px;line-height:1.4;">${UI.escapeHTML(inc.description)}</div>` : ''}
                                </div>
                                <button class="resolve-inc-btn" data-id="${inc.id}" data-suite-id="${suite.id}" title="Resolver" style="background:var(--apple-green-soft);border:none;color:var(--apple-green);cursor:pointer;font-size:0.65rem;padding:4px 10px;border-radius:var(--apple-radius-sm);font-weight:600;transition:all 0.15s;"
                                    onmouseover="this.style.background='var(--apple-green)';this.style.color='white'"
                                    onmouseout="this.style.background='var(--apple-green-soft)';this.style.color='var(--apple-green)'">✓ Resolver</button>
                            </div>
                        `).join('')}
                        <button id="btn-add-inc-${suite.id}" data-suite-id="${suite.id}" style="margin-top:4px;padding:8px 12px;border:1px dashed var(--apple-separator);border-radius:var(--apple-radius-md);background:transparent;color:var(--apple-label-tertiary);font-size:0.72rem;cursor:pointer;transition:all 0.15s;font-weight:500;"
                            onmouseover="this.style.borderColor='var(--apple-blue)';this.style.color='var(--apple-blue)';this.style.background='var(--apple-blue-soft)'"
                            onmouseout="this.style.borderColor='var(--apple-separator)';this.style.color='var(--apple-label-tertiary)';this.style.background='transparent'">+ Agregar inconsistencia</button>
                    </div>
                </div>
            </div>
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
            <div class="ts-detail-header" style="padding: 12px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); flex-shrink: 0;">
                <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap;">TEST SUITES <span style="color: var(--apple-label-tertiary);">›</span> <span style="color: var(--apple-blue);">#${suite.id}</span></span>
                    <h2 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--apple-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; flex: 1; min-width: 0;">${UI.escapeHTML(suite.title)}</h2>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${suite.jira_epic_key ? `
                        <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--apple-blue-soft); color: var(--apple-blue); font-size: 0.65rem; font-weight: 600; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--apple-blue-soft);">
                            <span style="font-size: 0.55rem;">◆</span> ${UI.escapeHTML(suite.jira_epic_key)}
                        </span>
                    ` : ''}
                    <button class="btn btn-ghost btn-sm edit-suite" data-id="${suite.id}" title="Editar Suite" style="padding: 5px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 500;">✏️ Editar</button>
                    <button class="btn btn-sm delete-suite" data-id="${suite.id}" title="Eliminar Suite" style="padding: 5px 10px; border-radius: var(--apple-radius-sm); background: var(--apple-red-soft); color: var(--apple-red); border: 1px solid transparent; font-size: 0.72rem; font-weight: 500;">🗑️ Eliminar</button>
                    <div style="width: 1px; height: 18px; background: var(--apple-separator);"></div>
                    <button class="btn btn-success btn-sm run-suite" data-id="${suite.id}" style="padding: 5px 12px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">▶ Ejecutar</button>
                    <button class="btn btn-sm" id="btn-ai-gen-tc" data-suite-id="${suite.id}" style="background: linear-gradient(135deg, var(--apple-purple), var(--apple-indigo)); color: white; border: none; padding: 5px 12px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">✨ AI Tool</button>
                    <button class="btn btn-primary btn-sm" id="btn-new-tc" data-suite-id="${suite.id}" style="padding: 5px 12px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">+ Nuevo TC</button>
                    <div style="width: 1px; height: 18px; background: var(--apple-separator);"></div>
                    <select class="suite-assign-all-select st-select" data-suite-id="${suite.id}" style="max-width: 150px; font-size: 0.72rem; padding: 5px 8px;">
                        <option value="">👤 Asignar todos...</option>
                        <option value="0">— Sin asignar —</option>
                        ${(Store.state.team || []).map(u => `<option value="${u.id}">${UI.escapeHTML(u.name)}</option>`).join('')}
                    </select>
                </div>
            </div>

            ${this.renderInconsistenciesPanel(suite)}

            <!-- Grid Panel -->
            <div class="ts-grid-panel" style="flex: 1; overflow-y: auto; padding: 20px 24px;">
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

        if (tcs.length === 0) {
            return `<div style="text-align: center; padding: 40px; opacity: 0.5; color: var(--apple-label-tertiary); font-size: 0.85rem;">No hay tests en esta suite</div>`;
        }

        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <table class="ts-grid-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: var(--apple-fill); border-bottom: 1px solid var(--apple-separator);">
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 90px;">Key</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary);">Título</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 120px;">Asignado</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 100px;">Última Ejecución</th>
                            <th style="padding: 10px 16px; text-align: center; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 100px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.renderTCGridWithDetail(tcs, suite, isAdmin, user, activeRunId)}
                    </tbody>
                </table>
            </div>
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
        const isSelected = this.selectedTCId === tc.id;
        const isAssignedToMe = tc.assigned_to === user?.id;
        const lastExec = tc.last_execution_at ? this._formatDate(tc.last_execution_at) : '—';
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);

        const typeColors = { Epic: 'var(--apple-purple)', Bug: 'var(--apple-red)', Task: 'var(--apple-blue)', Story: 'var(--apple-green)' };
        const typeColor = typeColors['Task'] || 'var(--apple-blue)';

        const rowStyle = isSelected ? `
            background: var(--apple-indigo-soft);
            border-left: 3px solid var(--apple-blue);
        ` : `
            border-left: 3px solid transparent;
        `;

        return `
            <tr class="ts-grid-row ${isSelected ? 'selected' : ''}" data-tc-id="${tc.id}"
                style="border-bottom: 1px solid var(--apple-separator); cursor: pointer; transition: all 0.15s ease; ${rowStyle}"
                onmouseover="if(!this.classList.contains('selected')) this.style.background='var(--apple-fill)'"
                onmouseout="if(!this.classList.contains('selected')) this.style.background='transparent'">
                <td style="padding: 12px 16px; font-weight: 700; color: var(--apple-blue); font-size: 0.75rem; width: 90px; white-space: nowrap; font-family: var(--apple-font-mono);">${UI.escapeHTML(tc.key_id || 'TC')}</td>
                <td style="padding: 12px 16px; color: var(--apple-label); font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor}; flex-shrink: 0; box-shadow: 0 0 0 2px ${typeColor}22;"></span>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem;">${UI.escapeHTML(tc.title)}</span>
                    </div>
                </td>
                <td style="padding: 12px 16px; width: 120px;">
                    ${assignee ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, var(--apple-blue), var(--apple-indigo)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${assignee.name.charAt(0)}</span>
                            <span style="font-size: 0.78rem; color: var(--apple-label-secondary); font-weight: 500;">${UI.escapeHTML(assignee.name.split(' ')[0])}</span>
                        </div>
                    ` : '<span style="color: var(--apple-label-tertiary); opacity: 0.5;">—</span>'}
                </td>
                <td style="padding: 12px 16px; font-size: 0.75rem; color: var(--apple-label-tertiary); width: 100px; white-space: nowrap;">${lastExec}</td>
                <td style="padding: 12px 16px; text-align: center; width: 100px;">
                    <div style="display: flex; gap: 6px; justify-content: center;">
                        ${(isAssignedToMe || isAdmin) && !activeRunId ? `
                            <button class="btn btn-success btn-sm run-tc-grid" data-id="${tc.id}" title="Ejecutar" style="padding: 5px 12px; font-size: 0.68rem; font-weight: 600; border-radius: var(--apple-radius-sm);">▶ Ejecutar</button>
                        ` : ''}
                        ${isAdmin ? `
                            <button class="btn btn-sm delete-tc-grid" data-tc-id="${tc.id}" title="Eliminar" style="padding: 5px 10px; font-size: 0.68rem; font-weight: 600; border-radius: var(--apple-radius-sm); opacity: ${activeRunId ? '0.3' : '1'}; cursor: ${activeRunId ? 'not-allowed' : 'pointer'}; background: var(--apple-red-soft); color: var(--apple-red); border: 1px solid transparent;">🗑️</button>
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
        const tabs = ['steps', 'expected', 'metadata'];
        const tabLabels = { steps: 'Pasos', expected: 'Esperado', metadata: 'Metadata' };

        return `
            <tr class="ts-expanded-row" style="border-bottom: 1px solid var(--border); background: var(--bg-surface-elevated);">
                <td colspan="5" style="padding: 0;">
                    <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
                        <!-- Title row -->
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand); white-space: nowrap;">${UI.escapeHTML(tc.key_id || 'TC')}</span>
                            ${isEditing ? `
                                <input type="text" class="tc-title-input" data-tc-id="${tc.id}" value="${UI.escapeHTML(tc.title)}" placeholder="Título del Test Case" style="flex: 1;" />
                            ` : `
                                <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${UI.escapeHTML(tc.title)}</span>
                            `}
                        </div>

                        <!-- Tabs row with Edit button -->
                        <div class="ts-expanded-tabs" style="display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--border); padding-bottom: 0;">
                            <div style="display: flex; gap: 4px;">
                                ${tabs.map(t => `
                                    <button class="ts-expanded-tab ${this.detailTab === t ? 'active' : ''}" data-tab="${t}" data-tc-id="${tc.id}"
                                        style="padding: 8px 16px; background: none; border: none; color: ${this.detailTab === t ? 'var(--brand)' : 'var(--text-muted)'}; font-size: 0.78rem; font-weight: ${this.detailTab === t ? '800' : '500'}; cursor: pointer; border-bottom: 2px solid ${this.detailTab === t ? 'var(--brand)' : 'transparent'}; margin-bottom: -1px; transition: all 0.15s;">
                                        ${tabLabels[t]}
                                    </button>
                                `).join('')}
                            </div>
                            <div style="margin-left: auto;">
                                ${isEditing ? `
                                    <button class="btn btn-ghost btn-sm cancel-edit-btn" data-tc-id="${tc.id}">Cancelar</button>
                                    <button class="btn btn-primary btn-sm save-tc-btn" data-tc-id="${tc.id}">Guardar</button>
                                ` : `
                                    <button class="btn btn-primary btn-sm edit-tc-btn" data-tc-id="${tc.id}">✏️ EDITAR</button>
                                `}
                            </div>
                        </div>

                        <!-- Tab Content -->
                        <div class="ts-expanded-body" style="display: flex; flex-direction: column; gap: 14px;">
                            ${['steps', 'expected', 'metadata'].map(tabName => {
                                const savedTab = this.detailTab;
                                this.detailTab = tabName;
                                const content = this.renderDetailTabContent(tc, suite, isEditing, readOnlyAttr, readOnlyClass, linkedUS, assignee, isAdmin);
                                this.detailTab = savedTab;
                                return `<div data-tab-content="${tabName}" style="display: ${tabName === savedTab ? 'block' : 'none'};">${content}</div>`;
                            }).join('')}
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

        const tabs = ['steps', 'expected', 'metadata'];
        const tabLabels = { steps: 'Pasos', expected: 'Esperado', metadata: 'Metadata' };

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
                    ${['steps', 'expected', 'metadata'].map(tabName => {
                        const savedTab = this.detailTab;
                        this.detailTab = tabName;
                        const content = this.renderDetailTabContent(tc, suite, isEditing, readOnlyAttr, readOnlyClass, linkedUS, assignee, isAdmin);
                        this.detailTab = savedTab;
                        return `<div data-tab-content="${tabName}" style="display: ${tabName === savedTab ? 'block' : 'none'};">${content}</div>`;
                    }).join('')}
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
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div class="field-group">
                            <label class="field-label">Precondiciones</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="preconditions" ${readOnlyAttr} style="min-height: 70px;">${UI.escapeHTML(tc.preconditions || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Pasos del Test</label>
                            <div class="highlighter-container">
                                <div class="highlighter-backdrop">${UI.highlightSteps(tc.steps)}</div>
                                <textarea class="tc-edit-field highlighted-textarea ${readOnlyClass}" data-field="steps" ${readOnlyAttr}>${UI.escapeHTML(tc.steps || '')}</textarea>
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
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div class="field-group">
                            <label class="field-label">Resultado Esperado</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="expected_result" ${readOnlyAttr} style="min-height: 80px;">${UI.escapeHTML(tc.expected_result || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Criterios de Aceptación</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="acceptance_criteria" ${readOnlyAttr} style="min-height: 80px;">${UI.escapeHTML(tc.acceptance_criteria || '')}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Suposiciones</label>
                            <textarea class="tc-edit-field ${readOnlyClass}" data-field="assumptions" ${readOnlyAttr} style="min-height: 60px;">${UI.escapeHTML(tc.assumptions || '')}</textarea>
                        </div>
                    </div>
                `;

            case 'metadata':
                const selectStyle = "width:100%; padding:8px 12px; background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator-opaque); border-radius:var(--apple-radius-md); color:var(--apple-label); font-size:0.85rem; outline:none; transition: border-color 0.15s;";
                const selectReadonlyStyle = "width:100%; padding:8px 12px; background:var(--apple-fill-tertiary); border:1px solid transparent; border-radius:var(--apple-radius-md); color:var(--apple-label); font-size:0.85rem; cursor:default;";
                return `
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="field-group">
                                <label class="field-label">Historia de Usuario</label>
                                <select class="tc-us-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" ${readOnlyAttr} style="${readOnlyAttr ? selectReadonlyStyle : selectStyle}">
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
                                <select class="tc-assign-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" ${readOnlyAttr} style="${readOnlyAttr ? selectReadonlyStyle : selectStyle}">
                                    <option value="">— Sin asignar —</option>
                                    ${(Store.state.team || []).map(u => `
                                        <option value="${u.id}" ${u.id === tc.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)} (${UI.escapeHTML(u.role)})</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="field-group">
                                <label class="field-label">Prioridad</label>
                                <select class="tc-meta-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" data-field="priority" ${readOnlyAttr} style="${readOnlyAttr ? selectReadonlyStyle : selectStyle}">
                                    ${['Alta', 'Media', 'Baja'].map(p => `<option value="${p}" ${tc.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Epic Jira</label>
                                <select class="tc-meta-select-detail ${readOnlyClass}" data-tc-id="${tc.id}" data-field="jira_epic_key" ${readOnlyAttr} style="${readOnlyAttr ? selectReadonlyStyle : selectStyle}">
                                    <option value="">— Sin Épica —</option>
                                    ${(Store.state.jiraEpics || []).map(e => `<option value="${e.key}" ${tc.jira_epic_key === e.key ? 'selected' : ''}>${e.key} - ${e.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="field-group" style="border-top: 1px solid var(--apple-separator); padding-top: 16px; margin-top: 4px;">
                            <label class="field-label">Mover a Suite</label>
                            <select class="tc-move-select" data-tc-id="${tc.id}" ${tc.us_id ? 'disabled title="TC tiene HU vinculada"' : ''} style="${selectStyle}">
                                <option value="">— Suite actual: ${UI.escapeHTML(suite.title)} —</option>
                                ${(Store.state.testSuites || []).filter(s => s.id !== suite.id).map(s => `
                                    <option value="${s.id}">${UI.escapeHTML(s.title)}</option>
                                `).join('')}
                            </select>
                            ${tc.us_id ? `<p style="font-size: 0.68rem; color: var(--apple-orange); margin-top: 6px;">⚠️ Desvinculá la HU antes de mover</p>` : ''}
                        </div>
                        <div style="padding: 14px; background: var(--apple-fill-tertiary); border-radius: var(--apple-radius-md); display: flex; flex-direction: column; gap: 12px;">
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem; cursor: pointer; color: var(--apple-label);">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_smoke" ${tc.is_smoke ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                💨 Smoke
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem; cursor: pointer; color: var(--apple-label);">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_regression" ${tc.is_regression ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                🔄 Regresión
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem; cursor: pointer; color: var(--apple-label);">
                                <div class="switch">
                                    <input type="checkbox" class="tc-meta-check-detail" data-tc-id="${tc.id}" data-field="is_integration" ${tc.is_integration ? 'checked' : ''} ${readOnlyAttr}>
                                    <span class="slider"></span>
                                </div>
                                🔗 Integración
                            </label>
                        </div>
                        ${linkedUS ? `
                            <button class="btn btn-ghost btn-sm view-hu-details" data-us-id="${linkedUS.id}" style="font-size: 0.72rem; font-weight: 600; color: var(--apple-blue); background: var(--apple-blue-soft); border: 1px solid transparent; padding: 6px 12px; border-radius: var(--apple-radius-sm); align-self: flex-start;">
                                📖 Ver Detalles de HU
                            </button>
                        ` : ''}
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
            <div id="ts-exec-overlay" style="position: fixed; bottom: 20px; right: 20px; width: 480px; background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-xl); box-shadow: var(--apple-shadow-xl); z-index: 9998; overflow: hidden;">
                <div style="padding: 14px 16px; background: linear-gradient(135deg,#1d4ed8,#2563eb); display: flex; align-items: center; gap: 10px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--apple-green); animation: pulse 2s infinite;"></div>
                    <span style="font-size: 0.85rem; font-weight: 800; color: white;">Ejecución en curso</span>
                    <button id="ts-exec-close" style="margin-left: auto; background: var(--apple-fill); border: none; color: var(--apple-label); width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 0.9rem;">✕</button>
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

                this.editingTCId = parseInt(btn.dataset.tcId);
                this.render(container);
                setTimeout(() => container.querySelector('.tc-title-input')?.focus(), 50);
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

        // Detail tab switching (expanded row tabs + old panel tabs)
        container.querySelectorAll('.ts-expanded-tab, .ts-detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const newTab = tab.dataset.tab;
                this.detailTab = newTab;
                container.querySelectorAll('[data-tab-content]').forEach(el => {
                    el.style.display = el.dataset.tabContent === newTab ? 'block' : 'none';
                });
                container.querySelectorAll('.ts-expanded-tab, .ts-detail-tab').forEach(btn => {
                    const isActive = btn.dataset.tab === newTab;
                    btn.classList.toggle('active', isActive);
                    btn.style.color = isActive ? 'var(--brand)' : 'var(--text-muted)';
                    btn.style.fontWeight = isActive ? '800' : '500';
                    btn.style.borderBottom = `2px solid ${isActive ? 'var(--brand)' : 'transparent'}`;
                });
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

        // Assign all tests in suite to a user
        container.querySelectorAll('.suite-assign-all-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                if (!e.target.value) return;
                const suiteId = parseInt(sel.dataset.suiteId);
                const userId = parseInt(e.target.value) || null;
                UI.showLoading();
                await ApiService.assignTestSuiteTests(suiteId, userId);
                await this.reloadSuites();
                UI.hideLoading();
                UI.toast(userId ? 'Todos los tests asignados' : 'Todos los tests desasignados');
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

        // Resolve Inconsistency
        container.querySelectorAll('.resolve-inc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const incId = parseInt(btn.dataset.id);
                const suiteId = parseInt(btn.dataset.suiteId);
                UI.showLoading();
                try {
                    await ApiService.deleteInconsistency(incId);
                    await this.reloadSuites();
                    this.selectedSuiteId = suiteId;
                    this.render(container);
                    UI.toast('Inconsistencia resuelta');
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });

        // Add Inconsistency
        container.querySelectorAll('[id^="btn-add-inc-"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const suiteId = parseInt(btn.dataset.suiteId);
                const title = prompt('Título de la inconsistencia:');
                if (!title) return;
                const severity = prompt('Severidad (Alta/Media/Baja):', 'Alta') || 'Alta';
                const description = prompt('Descripción (opcional):') || '';
                
                UI.showLoading();
                try {
                    await ApiService.createInconsistency({
                        suite_id: suiteId,
                        title,
                        severity,
                        description
                    });
                    await this.reloadSuites();
                    this.selectedSuiteId = suiteId;
                    this.render(container);
                    UI.toast('Inconsistencia agregada');
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

                const tcId = parseInt(btn.dataset.tcId);
                const tc = Store.state.testSuites.flatMap(s => s.test_cases || []).find(t => t.id === tcId);
                if (!tc) return;

                const title = container.querySelector(`.tc-title-input[data-tc-id="${tcId}"]`)?.value || tc.title;
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

                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Test Case guardado exitosamente');
            });
        });

        // Move TC to another suite
        container.querySelectorAll('.tc-move-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const newSuiteId = parseInt(e.target.value);
                if (!newSuiteId) {
                    e.target.value = '';
                    return;
                }

                const tcId = parseInt(sel.dataset.tcId);
                const tc = Store.state.testSuites.flatMap(s => s.test_cases || []).find(t => t.id === tcId);
                if (!tc) return;

                const currentSuite = Store.state.testSuites.find(s => s.id === tc.suite_id);
                const destSuite = Store.state.testSuites.find(s => s.id === newSuiteId);

                const confirmed = await modalManager.confirm(
                    `Mover "${tc.key_id} - ${tc.title}" de "${currentSuite?.title}" a "${destSuite?.title}"?`,
                    'Confirmar movimiento de Test Case'
                );

                if (!confirmed) {
                    e.target.value = '';
                    return;
                }

                UI.showLoading();
                try {
                    await ApiService.moveTestCase(tcId, newSuiteId);
                    await this.reloadSuites();
                    this.selectedTCId = null;
                    this.render(container);
                    UI.toast('TC movido correctamente', 'success');
                } catch (err) {
                    UI.toast(err.message, 'error');
                    e.target.value = '';
                }
                UI.hideLoading();
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
        const suite = Store.state.testSuites.find(s => s.id === suiteId);
        const existingTitles = (suite?.test_cases || []).map(tc => tc.title);
        const modal = document.createElement('div');
        modal.id = 'modal-gemini-tc';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:var(--apple-z-modal);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(20px) saturate(180%);';
        modal.innerHTML = `
            <div style="max-width:760px;width:95vw;max-height:90vh;display:flex;flex-direction:column;background:var(--apple-bg-elevated);border:1px solid var(--apple-separator);border-radius:var(--apple-radius-xl);box-shadow:var(--apple-shadow-xl);overflow:hidden;">
                <div style="background:linear-gradient(135deg,var(--apple-indigo),var(--apple-purple));padding:16px 24px;color:white;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <div>
                        <h2 style="margin:0;font-size:1.1rem;font-weight:800;">✨ Generar Tests con Gemini IA</h2>
                        <p style="margin:3px 0 0;font-size:0.75rem;opacity:0.75;">Los tests se crean directamente en la suite actual.${existingTitles.length > 0 ? ` <span style="opacity:1;color:var(--apple-green);">(${existingTitles.length} existentes — la IA no los repetirá)</span>` : ''}</p>
                    </div>
                    <button id="gemini-tc-close" style="background:var(--apple-fill);border:none;color:var(--apple-label);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;">&times;</button>
                </div>
                <div style="padding:10px 24px;background:var(--apple-fill);border-bottom:1px solid var(--apple-separator);display:flex;align-items:center;gap:12px;flex-shrink:0;">
                    <label style="font-size:0.68rem;font-weight:800;color:var(--apple-purple);white-space:nowrap;text-transform:uppercase;">🔑 API Key</label>
                    <input id="gemini-tc-key" type="password" placeholder="AIza..." value="${savedKey}"
                        style="flex:1;padding:6px 10px;border-radius:var(--apple-radius-sm);border:1px solid var(--apple-separator-opaque);background:var(--apple-bg-tertiary);color:var(--apple-label);font-family:var(--apple-font-mono);font-size:0.78rem;outline:none;"/>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:0.68rem;color:var(--apple-purple);white-space:nowrap;text-decoration:none;">Obtener →</a>
                </div>
                <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px;">
                    <div>
                        <div style="font-size:0.68rem;font-weight:800;color:var(--apple-purple);text-transform:uppercase;margin-bottom:6px;">📋 Historia de Usuario / Contexto</div>
                        <textarea id="gemini-tc-hu" placeholder="Pegá aquí el texto de la HU, criterios de aceptación, reglas de negocio..."
                            style="width:100%;min-height:130px;padding:14px;border-radius:var(--apple-radius-md);border:1px solid var(--apple-separator-opaque);background:var(--apple-bg-tertiary);color:var(--apple-label);font-family:inherit;font-size:0.88rem;line-height:1.6;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;font-weight:800;color:var(--apple-purple);text-transform:uppercase;margin-bottom:6px;">🖼️ Imágenes <span style="font-weight:400;color:var(--apple-label-tertiary);">(opcional — Ctrl+V, drag & drop o click)</span></div>
                        <div id="gemini-tc-dropzone"
                            style="min-height:80px;border:2px dashed var(--apple-separator-opaque);border-radius:var(--apple-radius-md);background:var(--apple-fill-tertiary);display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;cursor:pointer;transition:border-color 0.2s;"
                            ondragover="event.preventDefault();this.style.borderColor='var(--apple-blue)';" ondragleave="this.style.borderColor='var(--apple-separator-opaque)';"
                            ondrop="window._geminiTcDrop(event)">
                            <div id="gemini-tc-placeholder" style="color:var(--apple-label-tertiary);font-size:0.78rem;width:100%;text-align:center;">📎 Arrastrá imágenes aquí, hacé click o Ctrl+V</div>
                            <div id="gemini-tc-previews" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
                        </div>
                        <input type="file" id="gemini-tc-file" accept="image/*" multiple style="display:none;" />
                    </div>
                    <div id="gemini-tc-status" style="display:none;font-size:0.8rem;padding:10px 14px;border-radius:var(--apple-radius-md);font-weight:600;"></div>
                    <div id="gemini-tc-analysis" style="display:none;"></div>
                </div>
                <div style="padding:14px 24px;background:var(--apple-fill);border-top:1px solid var(--apple-separator);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                    <button id="gemini-tc-cancel" style="padding:9px 18px;border-radius:var(--apple-radius-md);border:1px solid var(--apple-separator);background:transparent;color:var(--apple-label-secondary);font-weight:600;cursor:pointer;font-size:var(--apple-text-body);">Cancelar</button>
                    <button id="gemini-tc-submit" style="padding:9px 24px;border-radius:var(--apple-radius-md);border:none;background:linear-gradient(to right,var(--apple-blue),var(--apple-blue-hover));color:white;font-weight:800;cursor:pointer;font-size:var(--apple-text-body);display:flex;align-items:center;gap:8px;">
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
            document.getElementById('gemini-tc-dropzone').style.borderColor = 'var(--apple-separator-opaque)';
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

        modal.querySelector('#gemini-tc-submit').onclick = () => this._callGemini(suiteId);
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
                <img src="data:${img.mimeType};base64,${img.base64}" style="width:70px;height:70px;object-fit:cover;border-radius:var(--apple-radius-sm);border:1px solid var(--apple-separator-opaque);" />
                <button onclick="window._geminiRmImg(${i})" style="position:absolute;top:-5px;right:-5px;background:var(--apple-red);border:none;color:white;border-radius:50%;width:17px;height:17px;cursor:pointer;font-size:0.6rem;padding:0;">&times;</button>
            </div>`).join('');
        window._geminiRmImg = (i) => { this._geminiImages.splice(i, 1); this._renderGeminiPreviews(); };
    },

    _setGeminiStatus(msg, type) {
        const el = document.getElementById('gemini-tc-status');
        if (!el) return;
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
        const map = { info: ['var(--apple-purple-soft)', 'var(--apple-purple)'], error: ['var(--apple-red-soft)', 'var(--apple-red)'], ok: ['var(--apple-green-soft)', 'var(--apple-green)'] };
        const [bg, color] = map[type] || map.info;
        el.style.background = bg; el.style.color = color; el.style.border = `1px solid ${color}33`;
    },

    _parseGeminiResponse(rawText) {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        try { return JSON.parse(cleaned); }
        catch {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) return JSON.parse(cleaned.substring(start, end + 1));
            const aStart = cleaned.indexOf('[');
            const aEnd = cleaned.lastIndexOf(']');
            if (aStart !== -1 && aEnd !== -1) return JSON.parse(cleaned.substring(aStart, aEnd + 1));
            throw new Error('No se encontró JSON en la respuesta: ' + cleaned.substring(0, 200));
        }
    },

    _isRetryableGemini(err) {
        const msg = err.message || '';
        return msg.includes('high demand') || msg.includes('timed out') || msg.includes('JSON parse error') || msg.includes('No se encontró JSON');
    },

    async _callGeminiEndpoint(apiKey, parts, systemPrompt, retries = 3) {
        const body = JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
        });

        for (let i = 0; i < retries; i++) {
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
                );

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.error?.message || `HTTP ${res.status}`);
                }

                const data = await res.json();
                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return this._parseGeminiResponse(rawText);
            } catch (err) {
                if (i < retries - 1 && this._isRetryableGemini(err)) {
                    this._setGeminiStatus(`⏳ Reintento ${i + 2}/${retries}...`, 'info');
                    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
                } else {
                    throw err;
                }
            }
        }
    },

    async _analyzeHU(apiKey, parts) {
        const PROMPT_ANALYSIS = `Eres un Senior QA Analyst. Analiza la Historia de Usuario y detecta inconsistencias y recomendaciones.

Devuelve ÚNICAMENTE un JSON válido con esta estructura:
{
  "inconsistencies": [
    { "title": "descripción corta y clara", "severity": "Alta" | "Media" | "Baja", "description": "explicación detallada" }
  ],
  "recommendations": [
    { "title": "recomendación de prueba", "description": "por qué es importante" }
  ]
}

REGLAS:
- Máximo 5 inconsistencias (distribuye entre Alta/Media/Baja según criticidad real)
- Máximo 3 recommendations (aspectos que requieren especial atención durante pruebas)
- Nunca devuelvas texto fuera del JSON
- Si no hay issues, devuelve arrays vacíos con severity "Baja"
- severity "Alta" = bloquea flujo, "Media" = puede afectar, "Baja" = mejora sugerida`;

        const result = await this._callGeminiEndpoint(apiKey, parts, PROMPT_ANALYSIS);
        if (result && typeof result === 'object' && Array.isArray(result.inconsistencies)) {
            return result;
        }
        throw new Error('Estructura inválida en análisis de HU');
    },

    async _generateTC(apiKey, parts, existingTitles = []) {
        let PROMPT_TC = `Eres un Senior QA Analyst. Genera test cases para la siguiente HU.`;

        if (existingTitles.length > 0) {
            PROMPT_TC += `\n\nIMPORTANTE: Ya existen los siguientes tests en la suite. NO los repitas ni generes tests con títulos similares:\n${existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nGenera ÚNICAMENTE tests NUEVOS que no estén en la lista anterior.`;
        }

        PROMPT_TC += `\n\nDevuelve ÚNICAMENTE un array JSON válido. Cada elemento:
{
  "title": "título claro y conciso del test case",
  "gherkin": "escenario en español, CADA paso en línea nueva sin indentación, empezando al inicio. Ejemplo: Dado: el usuario está en la pantalla\\nCuando: ingresa credenciales válidas\\nY: presiona el botón Ingresar\\nEntonces: el sistema muestra el dashboard principal",
  "preconditions": ["precondición 1", "precondición 2"],
  "testData": ["dato de prueba 1", "dato de prueba 2"],
  "acceptanceCriteria": ["criterio de aceptación 1", "criterio 2"],
  "expectedResult": "resultado esperado",
  "assumption": "supuesto asumido para generar este test; vacío si no aplica"
}

REGLAS:
- Genera TODOS los escenarios: flujo feliz, alternativos y de error
- Nunca devuelvas texto fuera del JSON
- No uses bloques markdown ni backticks`;

        const result = await this._callGeminiEndpoint(apiKey, parts, PROMPT_TC);
        if (Array.isArray(result)) return result;
        if (result && Array.isArray(result.testCases)) return result.testCases;
        if (result && Array.isArray(result.cases)) return result.cases;
        throw new Error('La respuesta no es un array de test cases');
    },

    async _callGemini(suiteId) {
        const apiKey = (document.getElementById('gemini-tc-key')?.value || '').trim();
        if (!apiKey) return this._setGeminiStatus('⚠️ Ingresá tu API Key de Gemini.', 'error');

        const hu = (document.getElementById('gemini-tc-hu')?.value || '').trim();
        if (!hu && this._geminiImages.length === 0) return this._setGeminiStatus('⚠️ Escribí una HU o pegá al menos una imagen.', 'error');

        const btn = document.getElementById('gemini-tc-submit');
        if (btn) { btn.disabled = true; }
        document.getElementById('gemini-tc-btn-icon').textContent = '⏳';
        document.getElementById('gemini-tc-btn-label').textContent = 'Generando...';

        const parts = [];
        if (hu) parts.push({ text: hu });
        this._geminiImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));

        try {
            const suite = Store.state.testSuites.find(s => s.id === suiteId);
            const existingTitles = (suite?.test_cases || []).map(tc => tc.title);

            this._setGeminiStatus('🔄 Generando casos de prueba...', 'info');

            const tcData = await this._generateTC(apiKey, parts, existingTitles);
            if (!tcData?.length) throw new Error('No se generaron test cases');

            this._setGeminiStatus(`✅ Creando ${tcData.length} tests en la suite...`, 'ok');

            UI.showLoading();

            for (const item of tcData) {
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

            UI.hideLoading();

            await this.reloadSuites();

            if (this.selectedSuiteId !== suiteId) {
                this.selectedSuiteId = suiteId;
            }

const container = document.getElementById('tab-content');
            if (container) this.render(container);

            UI.toast(`🚀 ${tcData.length} tests generados`, 'ok');
            document.getElementById('modal-gemini-tc')?.remove();
            this._removePasteListener?.();

        } catch (err) {
            console.error('[Gemini TC]', err);
            this._setGeminiStatus(`❌ Error: ${err.message}`, 'error');
            if (btn) btn.disabled = false;
            document.getElementById('gemini-tc-btn-icon').textContent = '✨';
            document.getElementById('gemini-tc-btn-label').textContent = 'Reintentar';
            UI.hideLoading();
        }
    },

    _showGeminiAnalysisResults(inconsistencies) {
        const analysisEl = document.getElementById('gemini-tc-analysis');
        if (!analysisEl) return;

        const sevColor = (sev) => ({ Alta: '#ef4444', Media: '#f59e0b', Baja: '#22c55e' }[sev] || '#818cf8');
        const sevBg = (sev) => ({ Alta: 'var(--apple-red-soft)', Media: 'var(--apple-orange-soft)', Baja: 'var(--apple-green-soft)' }[sev] || 'var(--apple-purple-soft)');

        let html = '';

        if (inconsistencies.length > 0) {
            html += `<div style="margin-top:12px;">
                <div style="font-size:0.65rem;font-weight:800;color:var(--apple-red);text-transform:uppercase;margin-bottom:8px;">⚠️ Inconsistencias detectadas (${inconsistencies.length})</div>`;
            inconsistencies.forEach(inc => {
                html += `<div style="margin-bottom:8px;padding:10px 12px;border-radius:8px;background:${sevBg(inc.severity)};border-left:4px solid ${sevColor(inc.severity)};">
                    <div style="font-size:0.82rem;font-weight:700;color:white;">${inc.title}</div>
                    <div style="font-size:0.72rem;color:var(--apple-label-secondary);margin-top:4px;line-height:1.5;">${inc.description || ''}</div>
                    <div style="display:inline-block;font-size:0.62rem;color:${sevColor(inc.severity)};margin-top:5px;font-weight:800;padding:2px 8px;border-radius:4px;background:${sevColor(inc.severity)}22;">${inc.severity}</div>
                </div>`;
            });
            html += `</div>`;
        }

        analysisEl.innerHTML = html;
        analysisEl.style.display = analysisEl.innerHTML ? 'block' : 'none';

        window._toggleIncPanel = function(headerEl) {
            const body = headerEl.nextElementSibling;
            const chevron = headerEl.querySelector('.inc-chevron');
            if (body.style.display === 'none') {
                body.style.display = 'block';
                chevron.textContent = '▼';
            } else {
                body.style.display = 'none';
                chevron.textContent = '▶';
            }
        };
    },

    async reloadSuites() {
        const prevSelectedId = this.selectedSuiteId;
        await this.loadSuitesForUC(Store.state.selectedUseCaseId);
        if (prevSelectedId) {
            this.selectedSuiteId = prevSelectedId;
        }
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

window._toggleIncPanel = function(headerEl) {
    const body = headerEl.nextElementSibling;
    const chevron = headerEl.querySelector('.inc-chevron');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        body.style.opacity = '0';
        body.style.transform = 'translateY(-5px)';
        requestAnimationFrame(() => {
            body.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            body.style.opacity = '1';
            body.style.transform = 'translateY(0)';
        });
        chevron.style.transform = 'rotate(90deg)';
    } else {
        body.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        body.style.opacity = '0';
        body.style.transform = 'translateY(-5px)';
        setTimeout(() => {
            body.style.display = 'none';
            body.style.transition = '';
            body.style.transform = '';
        }, 150);
        chevron.style.transform = 'rotate(0deg)';
    }
};