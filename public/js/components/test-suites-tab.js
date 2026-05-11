import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { SBS } from './sbs.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';
import { ExecutionTab } from './execution-tab.js';
import { modalManager } from '../utils/modal-manager.js';

/**
 * TEST-SUITES-TAB.JS - Tab "Test Suites"
 * Panels colapsables con Test Cases + SBS evidence.
 */
export const TestSuitesTab = {
    selectedSuiteId: null,
    expandedTCId: null,
    editingTCId: null,
    _lastJiraProjectId: null,
    _lastMainScroll: 0,
    _lastSidebarScroll: 0,
    _lastWindowScrollY: 0,

    render(container) {
        // Preservar scroll actual antes de regenerar contenido
        const sidebarList = container.querySelector('.ts-sidebar-list');
        const mainContent = container.querySelector('.ts-main-content');
        const sidebarScroll = sidebarList ? sidebarList.scrollTop : 0;
        const mainScroll = mainContent ? mainContent.scrollTop : 0;
        const windowScrollY = window.scrollY;

        // Usar valores guardados si están disponibles (ej: después de reloadSuites)
        const useMainScroll = this._lastMainScroll > 0 ? this._lastMainScroll : mainScroll;
        const useSidebarScroll = this._lastSidebarScroll > 0 ? this._lastSidebarScroll : sidebarScroll;
        const useWindowScrollY = this._lastWindowScrollY > 0 ? this._lastWindowScrollY : windowScrollY;

        const { testSuites, activeProjectId, selectedUseCaseId, jiraEpics, loadedForUC } = Store.state;
        const totalTests = testSuites.reduce((acc, s) => acc + (s.test_cases || []).length, 0);

        // Fetch guard: si cambió el CU y las suites se cargaron para otro CU, recargar
        if (selectedUseCaseId && loadedForUC.testSuites !== selectedUseCaseId) {
            this.loadSuitesForUC(selectedUseCaseId);
            return;
        }

        // Si se deseleccionó el CU y había suites cargadas, limpiarlas
        if (!selectedUseCaseId && loadedForUC.testSuites) {
            Store.setTestSuites([]);
            return;
        }

        // Cargar épicas si no existen o cambió el proyecto para evitar bucles
        if (activeProjectId && this._lastJiraProjectId !== activeProjectId) {
            this._lastJiraProjectId = activeProjectId;
            ApiService.getJiraContext(activeProjectId).then(ctx => {
                if (ctx && ctx.epics) {
                    Store.setJiraEpics(ctx.epics);
                    // El store notificará y provocará un re-render automático
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

        // Si hay suites pero no hay ninguna seleccionada, seleccionar la primera por defecto
        if (testSuites.length > 0 && !this.selectedSuiteId) {
            this.selectedSuiteId = testSuites[0].id;
        }

        const selectedSuite = testSuites.find(s => s.id === this.selectedSuiteId);

        container.innerHTML = `
            <div class="ts-layout">
                <div class="ts-sidebar">
                    <div class="ts-sidebar-header">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Test Suites</span>
                            <div style="display: flex; gap: 6px;">
                                <span class="tab-badge" title="Total de Suites">${testSuites.length} S</span>
                                <span class="tab-badge" style="background: var(--brand); color: white;" title="Total de Pruebas">${totalTests} T</span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="uc-filter" class="w-full">
                                <option value="">Selecciona Caso de Uso</option>
                                ${Store.state.useCases.map(uc => `
                                    <option value="${uc.id}" ${uc.id === selectedUseCaseId ? 'selected' : ''}>${UI.escapeHTML(uc.key_id || 'CU')} - ${UI.escapeHTML(uc.title)}</option>
                                `).join('')}
                            </select>
                            <button class="btn btn-primary btn-sm w-full" id="btn-new-suite" ${!selectedUseCaseId ? 'disabled' : ''}>+ Nueva Suite</button>
                            <button class="btn btn-ghost btn-sm w-full" id="btn-sidebar-import-xlsx" ${!selectedUseCaseId ? 'disabled' : ''}>📥 Importar Matriz Dual</button>
                            <button class="btn btn-success btn-sm w-full" id="btn-export-matrix" ${!selectedUseCaseId ? 'disabled' : ''} style="background: #10b981; border: none; color: white;">📊 Exportar Matriz (Excel)</button>
                        </div>
                    </div>
                    <div class="ts-sidebar-list">
                        ${this.renderSidebarList(testSuites)}
                    </div>
                </div>
                <div class="ts-main-content">
                    ${this.renderDetailView(selectedSuite)}
                </div>
            </div>
            <!-- HU Drawer UI -->
            <div id="hu-drawer-overlay" class="hu-drawer-overlay"></div>
            <div id="hu-drawer" class="hu-drawer"></div>
        `;

        this.bindEvents(container);

        // Restaurar scroll position del sidebar y área principal
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
                </section>

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

        // Bind close events
        const close = () => {
            overlay.classList.remove('is-open');
            drawer.classList.remove('is-open');
        };

        drawer.querySelector('.close-hu-drawer').onclick = close;
        overlay.onclick = close;
    },

    renderSidebarList(suites) {
        if (suites.length === 0) {
            return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">Sin suites disponibles</div>`;
        }
        return suites.map(suite => {
            const isActive = this.selectedSuiteId === suite.id;
            const isExecuting = !!suite.active_run_id;
            const testCount = (suite.test_cases || []).length;
            
            // Indicator for inconsistencies
            let incIndicator = '';
            const rawInc = suite.inconsistencies;
            const incList = Array.isArray(rawInc) ? rawInc : (() => { try { return JSON.parse(rawInc || '[]'); } catch { return []; } })();
            if (incList.length > 0) {
                incIndicator = `<span title="Tiene inconsistencias" style="font-size: 0.7rem; color: #f59e0b; margin-left: 4px;">⚠️</span>`;
            }

            return `
                <div class="ts-master-card ${isActive ? 'active' : ''}" data-id="${suite.id}" style="padding: 8px 10px; margin-bottom: 6px;">
                    <div class="ts-master-card-header" style="margin-bottom: 4px;">
                        <span class="ts-master-card-id" style="font-size: 0.65rem;">SUITE #${suite.id}</span>
                        ${isExecuting ? '<span class="status-pill ok" style="font-size: 8px; padding: 1px 5px;">LIVE</span>' : ''}
                    </div>
                    <div class="ts-master-card-title" style="font-size: 0.8rem; line-height: 1.2;">${UI.escapeHTML(suite.title)} ${incIndicator}</div>
                    <div style="margin-top: 4px; font-size: 0.65rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                        <span>🧪 ${testCount} tests</span>
                        ${suite.assigned_to_name ? `<span>👤 ${UI.escapeHTML(suite.assigned_to_name)}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderDetailView(suite) {
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
        const canPlaySuite = !!suite.active_run_id || tcs.some(tc => tc.assigned_to === Store.state.user?.id) || isAdmin;

        return `
            <div class="ts-detail-header">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 1.2rem;">📁</div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <h2 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${UI.escapeHTML(suite.title)}</h2>
                            ${suite.jira_epic_key ? `<span class="tab-badge" style="background: rgba(59, 130, 246, 0.1); color: var(--brand); font-size: 0.65rem;">Épica: ${UI.escapeHTML(suite.jira_epic_key)}</span>` : ''}
                        </div>
                        <p style="margin: 4px 0 0; font-size: 0.75rem; color: var(--text-muted);">${UI.escapeHTML(suite.description || 'Sin descripción')}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn btn-ghost btn-sm edit-suite" data-id="${suite.id}" title="Editar Suite">✏️</button>
                    <button class="btn btn-ghost btn-sm delete-suite" data-id="${suite.id}" title="Eliminar Suite" style="color: var(--fail);">🗑️</button>
                    <div style="width: 1px; height: 24px; background: var(--border); margin: 0 4px;"></div>
                    ${canPlaySuite ? `<button class="btn btn-success btn-sm run-suite" data-id="${suite.id}">${suite.active_run_id ? '⏸ Ver Ejecución' : '▶ EJECUTAR'}</button>` : ''}
                    <button class="btn btn-ai btn-sm" id="btn-ai-gen-tc" data-suite-id="${suite.id}" style="background:linear-gradient(135deg,#a855f7,#6366f1);color:white;border:none;">✨ AI Tool</button>
                    <button class="btn btn-primary btn-sm" id="btn-new-tc" data-suite-id="${suite.id}">+ Nuevo Test Case</button>
                </div>
            </div>
            ${this._renderInconsistenciesPanel(suite)}
            <div class="ts-detail-body">
                ${tcs.length === 0
                ? `<div class="empty-state" style="padding: 60px;">
                        <div class="empty-state-icon">📄</div>
                        <h3>Sin casos de prueba</h3>
                        <p>Esta suite aún no tiene tests. ¡Crea el primero!</p>
                       </div>`
                : tcs.map(tc => this.renderTestCase(tc, suite.id)).join('')
            }
            </div>
        `;
    },

    _renderInconsistenciesPanel(suite) {
        const raw = suite.inconsistencies;
        const items = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
        const hasItems = items.length > 0;

        const borderColor = hasItems ? '#f59e0b' : '#22c55e';
        const bgColor = hasItems ? 'rgba(245,158,11,0.07)' : 'rgba(34,197,94,0.06)';
        const borderLeft = hasItems ? '#f59e0b' : '#22c55e';
        const icon = hasItems ? '⚠️' : '✅';
        const labelColor = hasItems ? '#f59e0b' : '#22c55e';
        const label = hasItems
            ? `Inconsistencias detectadas (${items.length})`
            : 'Sin inconsistencias — HU consistente';

        const itemsHtml = hasItems ? items.map((inc, i) => `
            <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 10px; background:rgba(0,0,0,0.15); border-radius:8px;">
                <span style="font-size:0.65rem; font-weight:800; color:${labelColor}; white-space:nowrap; margin-top:2px;">A${i+1}</span>
                <span style="font-size:0.82rem; color:var(--text-main); font-weight:500; flex:1;">${UI.escapeHTML(inc.title)}</span>
                <button data-suite-id="${suite.id}" data-inc-idx="${i}" class="inc-remove-btn"
                    style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.75rem;padding:0 4px;opacity:0.6;" title="Eliminar">✕</button>
            </div>`).join('') : '';

        return `
            <div id="suite-inc-panel-${suite.id}"
                style="margin:0 0 16px; padding:12px 16px; background:${bgColor}; border:1px solid ${borderColor}33; border-radius:12px; border-left:4px solid ${borderLeft};">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:${hasItems ? '10px' : '0'};">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>${icon}</span>
                        <span style="font-size:0.7rem; font-weight:800; color:${labelColor}; text-transform:uppercase; letter-spacing:0.07em;">${label}</span>
                    </div>
                    <button class="inc-add-btn" data-suite-id="${suite.id}"
                        style="font-size:0.68rem; padding:3px 10px; border-radius:6px; border:1px solid ${borderColor}55; background:transparent; color:${labelColor}; cursor:pointer; font-weight:700;">+ Agregar</button>
                </div>
                ${hasItems ? `<div id="inc-list-${suite.id}" style="display:flex; flex-direction:column; gap:5px;">${itemsHtml}</div>` : ''}
                <div id="inc-add-form-${suite.id}" style="display:none; margin-top:10px; display:none;">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input id="inc-new-input-${suite.id}" type="text" placeholder="Descripción de la inconsistencia..."
                            style="flex:1; padding:7px 10px; border-radius:7px; border:1px solid ${borderColor}55; background:rgba(255,255,255,0.05); color:white; font-size:0.82rem; outline:none;" />
                        <button class="inc-save-btn" data-suite-id="${suite.id}"
                            style="padding:6px 14px; border-radius:7px; border:none; background:${borderLeft}; color:black; font-weight:800; cursor:pointer; font-size:0.8rem;">Guardar</button>
                        <button class="inc-cancel-btn" data-suite-id="${suite.id}"
                            style="padding:6px 10px; border-radius:7px; border:1px solid rgba(255,255,255,0.1); background:transparent; color:#64748b; cursor:pointer; font-size:0.8rem;">✕</button>
                    </div>
                </div>
            </div>`;
    },

    _bindInconsistencyPanel(container, suite) {
        const suiteId = suite.id;
        const raw = suite.inconsistencies;
        let items = Array.isArray(raw) ? [...raw] : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();

        const refresh = async () => {
            await ApiService.updateSuiteInconsistencies(suiteId, items);
            // Patch store in-place to avoid full reload
            const s = Store.state.testSuites.find(x => x.id === suiteId);
            if (s) s.inconsistencies = items;
            const panel = document.getElementById(`suite-inc-panel-${suiteId}`);
            if (panel) {
                const newPanel = document.createElement('div');
                newPanel.innerHTML = this._renderInconsistenciesPanel({ ...suite, inconsistencies: items });
                panel.replaceWith(newPanel.firstElementChild);
                this._bindInconsistencyPanel(container, { ...suite, inconsistencies: items });
            }
        };

        container.querySelector(`.inc-add-btn[data-suite-id="${suiteId}"]`)?.addEventListener('click', () => {
            const form = document.getElementById(`inc-add-form-${suiteId}`);
            if (form) { form.style.display = form.style.display === 'none' ? 'block' : 'none'; }
            // No auto-focus to avoid unwanted scroll
        });

        container.querySelector(`.inc-cancel-btn[data-suite-id="${suiteId}"]`)?.addEventListener('click', () => {
            const form = document.getElementById(`inc-add-form-${suiteId}`);
            if (form) form.style.display = 'none';
        });

        container.querySelector(`.inc-save-btn[data-suite-id="${suiteId}"]`)?.addEventListener('click', async () => {
            const input = document.getElementById(`inc-new-input-${suiteId}`);
            const val = (input?.value || '').trim();
            if (!val) return;
            items.push({ title: val });
            await refresh();
        });

        container.querySelectorAll(`.inc-remove-btn[data-suite-id="${suiteId}"]`).forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.incIdx);
                items.splice(idx, 1);
                await refresh();
            });
        });
    },

    // Flag para evitar múltiples listeners
    _isListening: false,
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
    },

    renderTestCase(tc, suiteId) {
        const isExpanded = this.expandedTCId === tc.id;
        const statusClass = (tc.status || 'pending').toLowerCase();
        const isPending = tc.status === 'PENDING' && Store.state.testSuites.find(s => s.id === suiteId)?.active_run_id;
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);
        const linkedUS = (Store.state.userStories || []).find(u => Number(u.id) === Number(tc.us_id));
        const user = Store.state.user;
        const suite = Store.state.testSuites.find(s => s.id === suiteId);
        const activeRunId = suite?.active_run_id;
        const isAdmin = user?.role === 'Admin' || user?.role === 'Analista QA';
        const isAssignedToMe = tc.assigned_to === user?.id;
        const isEditing = this.editingTCId === tc.id;
        const readOnlyAttr = isEditing ? '' : 'disabled';
        const readOnlyClass = isEditing ? '' : 'is-readonly';

        return `
            <div class="tt-tc-row ${isExpanded ? 'is-open' : ''}" data-tc-id="${tc.id}" style="background: var(--bg-surface-elevated); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; overflow: hidden; transition: all 0.2s;">
                <div class="tt-tc-header test-card-header" data-tc-id="${tc.id}" style="padding: 12px 20px; min-height: 52px; display: flex; align-items: center; gap: 14px; cursor: pointer;">
                    <div class="status-pill ${statusClass}" style="font-size: 9px; width: 70px; text-align: center; justify-content: center; font-weight: 700; flex-shrink: 0;">
                        ${tc.status === 'OK' ? 'PASS' : UI.escapeHTML(tc.status || 'PENDING')}
                    </div>
                    
                    <span class="tt-key tt-tc-key" style="font-size: 10px; opacity: 0.8; width: 40px; flex-shrink: 0; font-weight: 800; color: var(--brand);">${UI.escapeHTML(tc.key_id || 'TC')}</span>
                    
                    <input type="text" value="${UI.escapeHTML(tc.title)}" 
                        class="tc-title-input tt-tc-title" data-tc-id="${tc.id}" 
                        style="font-size: 13px; font-weight: 600; color: var(--text-main); flex: 1; background: transparent; border: none; outline: none;"
                        ${activeRunId ? 'disabled' : ''}>
                    
                    <div style="display: flex; align-items: center; gap: 16px; margin-left: auto;">
                        <div style="width: 85px; display: flex; justify-content: center;">
                            ${(isAssignedToMe || isAdmin) && !activeRunId ? `
                                <button class="btn btn-success btn-sm run-tc" data-id="${tc.id}" title="Iniciar ejecución individual" 
                                    style="padding: 4px 12px; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.05em;">
                                    ▶ EJECUTAR
                                </button>
                            ` : activeRunId ? `
                                <span style="font-size: 9px; color: var(--ok); font-weight: 800; opacity: 0.6; display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 6px; height: 6px; background: var(--ok); border-radius: 50%; animation: pulse 2s infinite;"></span>
                                    EN CICLO
                                </span>
                            ` : ''}
                        </div>

                        <span class="tt-tc-assignee" style="width: 70px; font-size: 11px; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                            ${assignee ? UI.escapeHTML(assignee.name.split(' ')[0]) : '—'}
                        </span>

                        <div style="width: 32px; display: flex; justify-content: center;">
                            ${isAdmin ? `<button class="btn-icon danger delete-tc" data-tc-id="${tc.id}" data-suite-id="${suiteId}" title="${activeRunId ? 'No se puede eliminar durante la ejecución' : 'Eliminar'}" style="padding: 0; font-size: 12px; opacity: ${activeRunId ? '0.1' : '1'}; cursor: ${activeRunId ? 'not-allowed' : 'pointer'};" ${activeRunId ? 'disabled' : ''}>🗑</button>` : ''}
                        </div>

                        <span class="tt-tc-expand" style="width: 24px; text-align: center; font-size: 10px; color: var(--text-muted); transition: transform 0.2s; transform: ${isExpanded ? 'rotate(180deg)' : 'none'};">${isExpanded ? '▼' : '▶'}</span>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="tt-tc-editor">
                        <div class="tt-editor-grid">
                            <div class="field-group">
                                <label class="field-label">Historia de Usuario vinculada</label>
                                <select class="tc-us-select" data-tc-id="${tc.id}" ${readOnlyAttr}>
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
                                <select class="tc-assign-select" data-tc-id="${tc.id}" ${readOnlyAttr}>
                                    <option value="">— Sin asignar —</option>
                                    ${(Store.state.team || []).map(u => `
                                        <option value="${u.id}" ${u.id === tc.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)} (${UI.escapeHTML(u.role)})</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Escenario de Prueba</label>
                                <div style="font-size: 0.8rem; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                                    ${tc.scenario_id ? `
                                        <span style="color: var(--ok);">●</span> 
                                        <span>Sincronizado automáticamente con el título</span>
                                    ` : `
                                        <span style="color: var(--warn);">○</span> 
                                        <span>Se generará al vincular la HU y guardar</span>
                                    `}
                                </div>
                            </div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                            <span class="field-label" style="color: var(--brand); font-weight: 800; display: block; margin-bottom: 12px;">🧠 Metadata Inteligente</span>
                            <div class="tt-editor-grid" style="grid-template-columns: repeat(2, 1fr);">
                                <div class="field-group">
                                    <label class="field-label">Prioridad</label>
                                    <select class="tc-meta-select" data-tc-id="${tc.id}" data-field="priority" ${readOnlyAttr}>
                                        ${['Alta', 'Media', 'Baja'].map(p => `<option value="${p}" ${tc.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Jira Tracking / Epic</label>
                                    <select class="tc-meta-select" data-tc-id="${tc.id}" data-field="jira_epic_key" ${readOnlyAttr}>
                                        <option value="">— Sin Épica —</option>
                                        ${(Store.state.jiraEpics || []).map(e => `<option value="${e.key}" ${tc.jira_epic_key === e.key ? 'selected' : ''}>${e.key} - ${e.name}</option>`).join('')}
                                    </select>
                                </div>

                            </div>

                            <div style="margin-top: 20px; display: flex; gap: 24px; flex-wrap: wrap; background: rgba(0,0,0,0.1); padding: 12px; border-radius: 6px;">
                                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; cursor: pointer;">
                                    <div class="switch">
                                        <input type="checkbox" class="tc-meta-check" data-tc-id="${tc.id}" data-field="is_smoke" ${tc.is_smoke ? 'checked' : ''} ${readOnlyAttr}>
                                        <span class="slider"></span>
                                    </div>
                                    💨 Smoke
                                </label>
                                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; cursor: pointer;">
                                    <div class="switch">
                                        <input type="checkbox" class="tc-meta-check" data-tc-id="${tc.id}" data-field="is_regression" ${tc.is_regression ? 'checked' : ''} ${readOnlyAttr}>
                                        <span class="slider"></span>
                                    </div>
                                    🔄 Regresión
                                </label>
                                <label style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; cursor: pointer;">
                                    <div class="switch">
                                        <input type="checkbox" class="tc-meta-check" data-tc-id="${tc.id}" data-field="is_integration" ${tc.is_integration ? 'checked' : ''} ${readOnlyAttr}>
                                        <span class="slider"></span>
                                    </div>
                                    🔗 Integración
                                </label>

                                ${linkedUS ? `
                                    <button class="btn btn-ghost btn-sm view-hu-details" data-us-id="${linkedUS.id}" 
                                        style="margin-left: auto; font-size: 0.65rem; font-weight: 800; color: var(--brand); border-color: rgba(59, 130, 246, 0.2); padding: 4px 12px; height: 28px;">
                                        📖 DETALLES DE LA HU
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 20px;">
                            <div class="field-group">
                                <label class="field-label">Suposiciones realizadas</label>
                                <textarea class="tc-edit-field ${readOnlyClass}" data-tc-id="${tc.id}" data-field="assumptions" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.assumptions || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Precondiciones específicas</label>
                                <textarea class="tc-edit-field ${readOnlyClass}" data-tc-id="${tc.id}" data-field="preconditions" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.preconditions || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Pasos del test</label>
                                <div class="highlighter-container">
                                    <div class="highlighter-backdrop">${UI.highlightSteps(tc.steps)}</div>
                                    <textarea class="tc-edit-field highlighted-textarea ${readOnlyClass}" data-tc-id="${tc.id}" data-field="steps" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.steps || '')}</textarea>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Resultado esperado</label>
                                <textarea class="tc-edit-field ${readOnlyClass}" data-tc-id="${tc.id}" data-field="expected_result" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.expected_result || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Datos de prueba</label>
                                <textarea class="tc-edit-field ${readOnlyClass}" data-tc-id="${tc.id}" data-field="test_data" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.test_data || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Criterios de aceptación</label>
                                <textarea class="tc-edit-field ${readOnlyClass}" data-tc-id="${tc.id}" data-field="acceptance_criteria" placeholder="—" ${readOnlyAttr}>${UI.escapeHTML(tc.acceptance_criteria || '')}</textarea>
                            </div>
                        </div>

                        <div class="tt-editor-actions" style="border-top: 1px solid var(--border); padding-top: 16px; display: flex; justify-content: flex-end; gap: 12px;">
                             ${isEditing ? `
                                <button class="btn btn-ghost btn-sm cancel-edit-btn" data-tc-id="${tc.id}">Cancelar</button>
                                <button class="btn btn-primary btn-sm save-tc-btn" data-tc-id="${tc.id}">Guardar cambios</button>
                            ` : `
                                <button class="btn btn-primary btn-sm edit-tc-btn" data-tc-id="${tc.id}" 
                                    ${(!isAdmin && !isAssignedToMe) || activeRunId ? 'disabled' : ''} 
                                    ${activeRunId ? 'title="No se puede editar mientras la suite está en ejecución"' : ''}>
                                    ✏️ EDITAR TEST
                                </button>
                            `}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },



    bindEvents(container) {
        // Edit mode toggle
        container.querySelectorAll('.edit-tc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Guardar scroll actual en propiedades de instancia
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

        // Auto-resize and highlighter sync
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
            // Sincronizar scroll si aplica
            tx.addEventListener('scroll', () => {
                const backdrop = tx.previousElementSibling;
                if (backdrop && backdrop.classList.contains('highlighter-backdrop')) {
                    backdrop.scrollTop = tx.scrollTop;
                }
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

        // Seleccionar suite desde sidebar
        container.querySelectorAll('.ts-master-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectedSuiteId = parseInt(card.dataset.id);
                this.expandedTCId = null;
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
                this.selectedSuiteId = null; // Reset selection
                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Suite eliminada');
            });
        });

        // Run Suite Play
        container.querySelectorAll('.run-suite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const suiteId = parseInt(btn.dataset.id);
                const suite = Store.state.testSuites.find(s => s.id === suiteId);

                if (suite?.active_run_id) {
                    ExecutionTab.projectSuites = []; // Invalidar por seguridad
                    Store.setState({ activeTab: 'execution' });
                    return;
                }

                UI.showLoading();
                try {
                    // Para el botón PLAY, siempre forzamos solo tests asignados al usuario actual
                    // a menos que sea un Admin que quiera ejecutar todo (aunque el pedido dice "solo asignado")
                    const res = await ApiService.startSuiteExecution(suiteId, true);
                    if (res.ok) {
                        ExecutionTab.projectSuites = []; // Invalidar para forzar recarga
                        UI.toast('🚀 Ejecución de tests asignados iniciada');
                        Store.setState({ activeTab: 'execution' });
                    }
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });

        // Run Individual TC Play
        container.querySelectorAll('.run-tc').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.id);
                UI.showLoading();
                try {
                    const res = await ApiService.startTestCaseExecution(tcId);
                    if (res.ok) {
                        ExecutionTab.projectSuites = []; // Invalidar para forzar recarga
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

        container.querySelector('#btn-sidebar-import-xlsx')?.addEventListener('click', () => {
            const suiteId = this.selectedSuiteId;
            // Quitamos el bloqueo por suiteId, ahora permitimos importar y crear suite al vuelo
            Modals.render('import-dual', {
                suiteId,
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

        // TC us_id change: Update scenarios dropdown
        container.querySelectorAll('.tc-us-select').forEach(select => {
            select.addEventListener('click', e => e.stopPropagation());
            select.addEventListener('change', (e) => {
                const tcId = select.dataset.tcId;
                const usId = parseInt(e.target.value);
                const scenarioSelect = container.querySelector(`.tc-scenario-select[data-tc-id="${tcId}"]`);

                if (!usId) {
                    scenarioSelect.innerHTML = '<option value="">— No vinculado —</option>';
                    scenarioSelect.disabled = true;
                    return;
                }

                const us = Store.state.userStories.find(u => Number(u.id) === Number(usId));
                const scenarios = us?.scenarios || [];

                // Obtener escenarios usados globalmente para filtrar
                const usedScenarioIds = Store.state.testSuites
                    .flatMap(s => s.test_cases || [])
                    .filter(t => t.scenario_id && Number(t.id) !== Number(tcId))
                    .map(t => Number(t.scenario_id));

                scenarioSelect.innerHTML = `
                    <option value="">— No vinculado —</option>
                    ${scenarios
                        .filter(s => !usedScenarioIds.includes(Number(s.id)))
                        .map((s, i) => {
                            const cleanTitle = s.title.replace(/^E\d+:\s*/, '').trim();
                            const originalIndex = scenarios.findIndex(orig => Number(orig.id) === Number(s.id));
                            return `
                                <optgroup label="Escenario E${originalIndex + 1}">
                                    <option value="${s.id}">E${originalIndex + 1} | ${UI.escapeHTML(cleanTitle)}</option>
                                </optgroup>
                            `;
                        }).join('')}
                `;
                scenarioSelect.disabled = false;
            });
        });

        // Reserva automática manejada por el backend al guardar


        // TC title change (Wait for Save Button)
        container.querySelectorAll('.tc-title-input').forEach(input => {
            input.addEventListener('click', e => e.stopPropagation());
        });

        // TC fields change (Wait for Save Button)
        container.querySelectorAll('.tc-edit-field').forEach(input => {
            input.addEventListener('click', e => e.stopPropagation());
        });

        // Save test case manually
        container.querySelectorAll('.save-tc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.disabled) return;

                // Preservar scroll antes de operaciones
                const mainContent = container.querySelector('.ts-main-content');
                const mainScroll = mainContent ? mainContent.scrollTop : 0;
                const windowScrollY = window.scrollY;

                const tcId = parseInt(btn.dataset.tcId);
                const title = container.querySelector(`.tc-title-input[data-tc-id="${tcId}"]`).value;
                const us_id = container.querySelector(`.tc-us-select[data-tc-id="${tcId}"]`).value;
                const scenario_id = container.querySelector(`.tc-scenario-select[data-tc-id="${tcId}"]`)?.value;
                const assigned_to = container.querySelector(`.tc-assign-select[data-tc-id="${tcId}"]`).value;
                const steps = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="steps"]`).value;
                const expected = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="expected_result"]`).value;
                const preconditions = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="preconditions"]`).value;

                // Metadata
                const priority = container.querySelector(`.tc-meta-select[data-tc-id="${tcId}"][data-field="priority"]`)?.value || 'Media';
                const is_smoke = container.querySelector(`.tc-meta-check[data-tc-id="${tcId}"][data-field="is_smoke"]`)?.checked || false;
                const is_regression = container.querySelector(`.tc-meta-check[data-tc-id="${tcId}"][data-field="is_regression"]`)?.checked || false;
                const is_integration = container.querySelector(`.tc-meta-check[data-tc-id="${tcId}"][data-field="is_integration"]`)?.checked || false;
                const jira_epic_key = container.querySelector(`.tc-meta-select[data-tc-id="${tcId}"][data-field="jira_epic_key"]`)?.value || '';

                const assumptions = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="assumptions"]`).value;
                const test_data = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="test_data"]`).value;
                const acceptance_criteria = container.querySelector(`.tc-edit-field[data-tc-id="${tcId}"][data-field="acceptance_criteria"]`).value;

                const payload = {
                    title,
                    us_id: us_id ? parseInt(us_id) : null,
                    scenario_id: scenario_id ? parseInt(scenario_id) : null,
                    assigned_to: assigned_to ? parseInt(assigned_to) : null,
                    steps: steps,
                    expected_result: expected,
                    preconditions: preconditions,
                    priority, is_smoke, is_regression, is_integration, jira_epic_key,
                    assumptions, test_data, acceptance_criteria
                };
                console.log('DEBUG: Sending Update for TC', tcId, payload);
                UI.showLoading();
                const res = await ApiService.updateTestCase(tcId, payload);
                console.log('DEBUG: API Response:', res);
                this.editingTCId = null;
                // Guardar scroll antes de reload
                const mainBeforeReload = container.querySelector('.ts-main-content');
                this._lastMainScroll = mainBeforeReload ? mainBeforeReload.scrollTop : 0;
                this._lastWindowScrollY = window.scrollY;

                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Test Case guardado exitosamente');
            });
        });

        // Evidence Collapsible (Removido de TestSuitesTab)

        // Toggle TC expand (details)
        container.querySelectorAll('.test-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
                const tcId = parseInt(header.dataset.tcId);
                this.expandedTCId = this.expandedTCId === tcId ? null : tcId;
                this.render(container);
            });
        });

        // Delete TC
        container.querySelectorAll('.delete-tc').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                if (!await modalManager.confirm('¿Eliminar este Test Case?')) return;
                UI.showLoading();
                await ApiService.deleteTestCase(tcId);
                await this.reloadSuites();
                UI.hideLoading();
                UI.toast('Test Case eliminado');
            });
        });
        // Bind inconsistency panel for selected suite
        const selectedSuiteObj = Store.state.testSuites.find(s => s.id === this.selectedSuiteId);
        if (selectedSuiteObj) this._bindInconsistencyPanel(container, selectedSuiteObj);
        // Bind AI Gemini Generator
        this.bindGeminiModal(container);
    },

    // ─── Gemini Modal ─────────────────────────────────────────────────────
    _geminiImages: [],

    bindGeminiModal(container) {
        container.querySelector('#btn-ai-gen-tc')?.addEventListener('click', (e) => {
            const suiteId = parseInt(e.currentTarget.dataset.suiteId);
            this.openGeminiModal(container, suiteId);
        });
    },

    openGeminiModal(container, suiteId) {
        this._geminiImages = [];
        // Remove old modal if exists
        document.getElementById('modal-gemini-tc')?.remove();

        const savedKey = localStorage.getItem('gemini_api_key') || '';
        const modal = document.createElement('div');
        modal.id = 'modal-gemini-tc';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="max-width:760px;width:95vw;max-height:90vh;display:flex;flex-direction:column;background:rgba(10,12,28,0.98);border:1px solid rgba(99,102,241,0.35);border-radius:20px;box-shadow:0 30px 60px rgba(0,0,0,0.7);overflow:hidden;">
                <!-- Header -->
                <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:16px 24px;color:white;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <div>
                        <h2 style="margin:0;font-size:1.1rem;font-weight:800;">✨ Generar Tests con Gemini IA</h2>
                        <p style="margin:3px 0 0;font-size:0.75rem;opacity:0.75;">Los tests se crean directamente en la suite actual.</p>
                    </div>
                    <button id="gemini-tc-close" style="background:rgba(0,0,0,0.25);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;">&times;</button>
                </div>
                <!-- API Key -->
                <div style="padding:10px 24px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px;flex-shrink:0;">
                    <label style="font-size:0.68rem;font-weight:800;color:#818cf8;white-space:nowrap;text-transform:uppercase;">🔑 API Key</label>
                    <input id="gemini-tc-key" type="password" placeholder="AIza..." value="${savedKey}"
                        style="flex:1;padding:6px 10px;border-radius:7px;border:1px solid rgba(99,102,241,0.4);background:rgba(255,255,255,0.05);color:white;font-family:monospace;font-size:0.78rem;outline:none;"/>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:0.68rem;color:#818cf8;white-space:nowrap;text-decoration:none;">Obtener →</a>
                </div>
                <!-- Body -->
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
                <!-- Footer -->
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

        // File picker
        const fileInput = modal.querySelector('#gemini-tc-file');
        modal.querySelector('#gemini-tc-dropzone').addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            fileInput.click();
        });
        fileInput.onchange = (e) => this._addGeminiImages(Array.from(e.target.files));

        // API key persistence
        modal.querySelector('#gemini-tc-key').addEventListener('input', (e) => {
            localStorage.setItem('gemini_api_key', e.target.value);
        });

        // Drag & drop handler (global reference)
        window._geminiTcDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('gemini-tc-dropzone').style.borderColor = 'rgba(99,102,241,0.4)';
            this._addGeminiImages(Array.from(e.dataTransfer.files));
        };

        // Ctrl+V paste
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

        // Submit
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

            // Extraer metadatos globales del lote (iguales para todos los items)
            const huName = parsed[0]?.hu_name || '';
            const inconsistencies = parsed[0]?.inconsistencies || [];

            UI.showLoading();

            // Guardar inconsistencias en la suite (a nivel global)
            if (inconsistencies.length > 0) {
                // Obtenemos la suite actual, le sumamos las nuevas inconsistencias a las que ya tuviera
                const currentSuite = Store.state.testSuites.find(s => s.id === suiteId);
                const rawExisting = currentSuite?.inconsistencies;
                const existingInconsistencies = Array.isArray(rawExisting) ? rawExisting : (() => { try { return JSON.parse(rawExisting || '[]'); } catch { return []; } })();
                
                // Evitamos duplicados básicos comparando títulos
                const newInconsistencies = inconsistencies.filter(inc => !existingInconsistencies.some(e => e.title === inc.title));
                if (newInconsistencies.length > 0) {
                    await ApiService.updateSuiteInconsistencies(suiteId, [...existingInconsistencies, ...newInconsistencies]);
                }
            }

            // Create each test case via API
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
    }
};
