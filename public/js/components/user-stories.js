import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';
import { modalManager } from '../utils/modal-manager.js';

/**
 * USER-STORIES.JS - Tab "Casos de Uso"
 * 2 niveles: Selector de CU arriba → Cards de HU abajo.
 */

const STATUS_OPTIONS = ['En Análisis', 'Finalizada', 'Deprecada', 'Rechazada'];
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja'];

const SECTIONS = [
    { key: 'hu_detallada', icon: '🔍', label: 'Análisis de Inconsistencias', type: 'textarea' },
    { key: 'recomendaciones', icon: '📋', label: 'Recomendaciones de Prueba', type: 'textarea' },
    { key: 'escenarios_prueba', icon: '🎯', label: 'Escenarios de Prueba', type: 'textarea' },
    { key: 'reglas_negocio', icon: '📜', label: 'Reglas de Negocio', type: 'textarea' },
    { key: 'precondiciones', icon: '⚙️', label: 'Precondiciones', type: 'textarea' },
    { key: 'link_documentacion', icon: '🔗', label: 'Link Documentación Base', type: 'input' }
];

const SEVERITY_COLORS = {
    Alta: '#ef4444',
    Media: '#f59e0b',
    Baja: '#22c55e'
};
const SEVERITY_ICONS = {
    Alta: '🔴',
    Media: '🟡',
    Baja: '🟢'
};

export const UserStories = {
    expandedId: null,
    activeTab: 'analisis',
    searchQuery: '',
    _isListening: false,

    render(container) {
        const { useCases, selectedUseCaseId, userStories, activeProjectId, loadedForUC } = Store.state;

        // Fetch guard: si cambió el CU y las stories se cargaron para otro CU, recargar
        if (selectedUseCaseId && loadedForUC.userStories !== selectedUseCaseId) {
            this.loadStoriesForUC(selectedUseCaseId);
            return;
        }

        // Si se deseleccionó el CU y había stories cargadas, limpiarlas
        if (!selectedUseCaseId && loadedForUC.userStories) {
            Store.setUserStories([]);
            return;
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

        // Guardar scroll del detalle
        const detailView = container.querySelector('#us-detail-view');
        const scrollPos = detailView ? detailView.scrollTop : 0;

        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const canCreateHU = isAdmin || Store.state.user?.permissions?.can_create_hu;
        const totalScenarios = userStories.reduce((acc, us) => acc + (us.scenarios || []).length, 0);

        container.innerHTML = `
            <div class="us-layout">
                <!-- Barra Lateral (Maestro) -->
                <div class="us-sidebar">
                    <div class="us-sidebar-header">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Historias de Usuario</span>
                            <div style="display: flex; gap: 6px;">
                                <span class="tab-badge" title="Total de HUs">${userStories.length} HU</span>
                                <span class="tab-badge" style="background: var(--brand); color: white;" title="Total de Escenarios">${totalScenarios} E</span>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; gap: 6px;">
                                <select id="cu-select" class="w-full" style="height: 36px; font-size: 0.8rem; flex: 1;">
                                    <option value="">— Filtrar por Caso de Uso —</option>
                                    ${useCases.map(cu => `
                                        <option value="${cu.id}" ${cu.id === selectedUseCaseId ? 'selected' : ''}>${UI.escapeHTML(cu.key_id || 'CU')} - ${UI.escapeHTML(cu.title)}</option>
                                    `).join('')}
                                </select>
                                ${selectedUseCaseId ? `
                                    <button class="btn btn-ghost btn-sm" id="btn-rename-cu" title="Renombrar CU" style="height: 36px; padding: 0 10px;">✏️</button>
                                    ${isAdmin ? `<button class="btn btn-ghost btn-sm" id="btn-delete-cu" title="Eliminar CU" style="height: 36px; padding: 0 10px; color: var(--apple-red);">🗑️</button>` : ''}
                                ` : ''}
                            </div>

                            <div style="position: relative;">
                                <input type="text" id="us-search" placeholder="Buscar historia..." value="${UI.escapeHTML(this.searchQuery)}"
                                    style="width: 100%; padding: 6px 10px 6px 30px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.78rem; outline: none; box-sizing: border-box;" />
                                <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 0.8rem; opacity: 0.4;">🔍</span>
                            </div>

                            <div style="display: flex; gap: 6px;">
                                ${isAdmin ? `
                                    <button class="btn btn-ghost btn-sm" id="btn-new-cu" style="height: 32px; font-weight: 700; flex: 1;">+ Nuevo CU</button>
                                ` : ''}
                                ${canCreateHU && selectedUseCaseId ? `
                                    <button class="btn btn-primary btn-sm" id="btn-new-us" style="height: 32px; font-weight: 700; flex: 1;">+ Nueva HU</button>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="us-sidebar-list" id="us-master-list">
                        ${this.renderSidebarList(userStories)}
                    </div>
                </div>

                <!-- Área de Contenido (Detalle) -->
                <div class="us-main-content" id="us-detail-view">
                    ${this.expandedId ? this.renderDetailView(userStories.find(u => u.id === this.expandedId)) : this.renderPlaceholder()}
                </div>
            </div>
        `;

        // Restaurar scroll
        const newDetailView = container.querySelector('#us-detail-view');
        if (newDetailView && scrollPos) {
            newDetailView.scrollTop = scrollPos;
        }

        this.bindEvents(container);
    },

    renderPlaceholder() {
        return `
            <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center; opacity: 0.5;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">⬅️</div>
                    <h3 style="font-weight: 700;">Selecciona una historia</h3>
                    <p>Haz clic en una historia de la izquierda para ver y editar sus detalles.</p>
                </div>
            </div>
        `;
    },

    renderSidebarList(userStories) {
        let filtered = userStories;
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(us =>
                (us.title || '').toLowerCase().includes(q) ||
                (us.key_id || '').toLowerCase().includes(q)
            );
        }
        if (filtered.length === 0) {
            return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">Sin historias encontradas</div>`;
        }
        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                <tbody>
                    ${filtered.map(us => this.renderSidebarRow(us)).join('')}
                </tbody>
            </table>
        `;
    },

    renderSidebarRow(us) {
        const isActive = this.expandedId === us.id;
        const statusClass = (us.status || 'En Análisis').toLowerCase().replace(/\s+/g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const priorityColors = { Alta: '#ef4444', Media: '#f59e0b', Baja: '#22c55e' };
        const priorityColor = priorityColors[us.priority] || '#f59e0b';

        return `
            <tr class="us-suite-row ${isActive ? 'selected' : ''}" data-id="${us.id}"
                style="border-bottom: 1px solid var(--apple-separator); cursor: pointer;">
                <td>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                        <span class="us-id">${UI.escapeHTML(us.key_id)}</span>
                        <span class="status-pill ${statusClass}" style="font-size: 7px; padding: 1px 4px;">${UI.escapeHTML(us.status || 'En Análisis')}</span>
                    </div>
                    <div class="us-title">${UI.escapeHTML(us.title)}</div>
                    <div class="us-priority" style="color: ${priorityColor};">${UI.escapeHTML(us.priority || 'Media')}</div>
                </td>
            </tr>
        `;
    },

    renderDetailView(us) {
        if (!us) return this.renderPlaceholder();

        const tabs = [
            { key: 'analisis', label: 'Análisis' },
            { key: 'recomendaciones', label: 'Recomendaciones' },
            { key: 'escenarios', label: 'Escenarios' },
            { key: 'reglas', label: 'Reglas' },
            { key: 'precondiciones', label: 'Precondiciones' },
            { key: 'documentacion', label: 'Documentación' }
        ];

        return `
            <div class="us-detail-header" style="padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface); display: flex; align-items: center; gap: 16px; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <h2 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHTML(us.key_id)} · ${UI.escapeHTML(us.title)}</h2>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <button class="btn btn-ghost btn-sm goto-suites" data-us-id="${us.id}" style="padding: 4px 8px; font-size: 0.72rem;">🧪 Ver Suites</button>
                    <button class="btn btn-sm delete-us" data-id="${us.id}" style="padding: 4px 8px; background: var(--apple-red-soft); color: var(--apple-red); border: 1px solid var(--apple-red-soft);">🗑️</button>
                    <div style="width: 1px; height: 18px; background: var(--border);"></div>
                    <button class="btn btn-ghost btn-sm cancel-edit" style="padding: 4px 8px; font-size: 0.72rem;">Cancelar</button>
                    <button class="btn btn-primary btn-sm save-us" data-id="${us.id}" style="padding: 4px 10px; font-size: 0.72rem;">💾 Guardar</button>
                </div>
            </div>

            <!-- Metadata: Title, Status, Priority (always visible) -->
            <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface);">
                <div style="display: grid; grid-template-columns: 1fr 120px 120px; gap: 12px; align-items: end;">
                    <div class="field-group" style="margin: 0;">
                        <label class="field-label">Título de la HU</label>
                        <input type="text" value="${UI.escapeHTML(us.title)}" class="us-edit-field main-title-input" data-id="${us.id}" data-field="title" placeholder="Título de la historia..." style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.85rem; outline: none; box-sizing: border-box;">
                    </div>
                    <div class="field-group" style="margin: 0;">
                        <label class="field-label">Estado</label>
                        <select class="us-edit-field" data-id="${us.id}" data-field="status" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.85rem; outline: none; box-sizing: border-box;">
                            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${us.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" style="margin: 0;">
                        <label class="field-label">Prioridad</label>
                        <select class="us-edit-field" data-id="${us.id}" data-field="priority" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.85rem; outline: none; box-sizing: border-box;">
                            ${PRIORITY_OPTIONS.map(p => `<option value="${p}" ${us.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="us-detail-tabs" style="display: flex; gap: 0; border-bottom: 1px solid var(--border); background: var(--bg-surface-elevated); flex-shrink: 0;">
                ${tabs.map(t => `
                    <button class="us-detail-tab ${this.activeTab === t.key ? 'active' : ''}" data-tab="${t.key}"
                        style="flex: 1; padding: 10px 8px; background: none; border: none; color: ${this.activeTab === t.key ? 'var(--brand)' : 'var(--text-muted)'}; font-size: 0.78rem; font-weight: ${this.activeTab === t.key ? '800' : '500'}; cursor: pointer; border-bottom: 2px solid ${this.activeTab === t.key ? 'var(--brand)' : 'transparent'}; transition: all 0.15s;">
                        ${t.label}
                    </button>
                `).join('')}
            </div>

            <!-- Tab Content -->
            <div class="us-detail-body" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
                ${this.renderTabContent(us)}
            </div>
        `;
    },

    renderTabContent(us) {
        switch (this.activeTab) {
            case 'analisis':
                return this.renderInconsistenciesTab(us);
            case 'recomendaciones':
                return this.renderRecommendationsTab(us);
            case 'escenarios':
                return this.renderScenariosTab(us);
            case 'reglas':
                return this.renderFieldTab(us, 'reglas_negocio', 'Reglas de Negocio');
            case 'precondiciones':
                return this.renderFieldTab(us, 'precondiciones', 'Precondiciones');
            case 'documentacion':
                return this.renderFieldTab(us, 'link_documentacion', 'Link Documentación', 'input');
            default:
                return '';
        }
    },

    renderFieldTab(us, fieldKey, label, type = 'textarea') {
        const val = us[fieldKey] || '';
        if (type === 'textarea') {
            return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label class="field-label">${label}</label>
                    <textarea class="us-edit-field" data-id="${us.id}" data-field="${fieldKey}"
                        placeholder="Escribe aquí los detalles..."
                        style="width: 100%; min-height: 200px; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.85rem; outline: none; resize: vertical; box-sizing: border-box;">${UI.escapeHTML(val)}</textarea>
                </div>
            `;
        } else {
            return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label class="field-label">${label}</label>
                    <input type="text" value="${UI.escapeHTML(val)}" class="us-edit-field" data-id="${us.id}" data-field="${fieldKey}"
                        placeholder="https://..."
                        style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.85rem; outline: none; box-sizing: border-box;">
                </div>
            `;
}
    },

    renderInconsistenciesTab(us) {
        const items = us.inconsistencies || [];
        return `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="padding: 12px 16px; background: ${items.length > 0 ? 'var(--apple-orange-soft)' : 'var(--apple-green-soft)'}; border: 1px solid ${items.length > 0 ? 'var(--apple-orange-soft)' : 'var(--apple-green-soft)'}; border-radius: var(--apple-radius-md); border-left: 4px solid ${items.length > 0 ? 'var(--apple-orange)' : 'var(--apple-green)'};">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${items.length > 0 ? '⚠️' : '✅'}</span>
                        <span style="font-size: 0.72rem; font-weight: 800; color: ${items.length > 0 ? 'var(--apple-orange)' : 'var(--apple-green)'}; text-transform: uppercase; letter-spacing: 0.05em;">
                            ${items.length > 0 ? `Inconsistencias detectadas (${items.length})` : 'Sin inconsistencias — HU consistente'}
                        </span>
                    </div>
                </div>
                ${items.length > 0 ? `<div style="display: flex; flex-direction: column; gap: 6px;">${items.map((item, i) => {
                    const severity = item.severity || 'Alta';
                    const color = SEVERITY_COLORS[severity] || '#ef4444';
                    const icon = SEVERITY_ICONS[severity] || '🔴';
                    return `
                    <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; background: var(--inc-bg); border-radius: 8px;">
                        <span style="font-size: 0.65rem; font-weight: 800; color: ${color}; white-space: nowrap; margin-top: 1px;">${icon}</span>
                        <span style="font-size: 0.78rem; color: var(--inc-text); font-weight: 500; flex: 1; word-break: break-word; line-height: 1.4;">${UI.escapeHTML(item.title)}</span>
                        <button class="resolve-inc-btn-hu" data-id="${item.id}" title="Resolver inconsistencia" style="background:none;border:none;color:var(--apple-green);cursor:pointer;font-size:0.75rem;padding:2px 6px;">✅</button>
                    </div>`;
                }).join('')}</div>` : ''}
            </div>
        `;
    },

    renderRecommendationsTab(us) {
        let recommendations = us.recommendations || [];
        if (typeof recommendations === 'string') {
            try { recommendations = JSON.parse(recommendations); } catch { recommendations = []; }
        }
        const items = Array.isArray(recommendations) ? recommendations : [];
        return `
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${items.map((item, i) => `
                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--apple-separator);">
                        <span style="font-size: 0.75rem; font-weight: 800; color: var(--brand); white-space: nowrap; margin-top: 1px;">💡</span>
                        <span style="font-size: 0.82rem; color: var(--text-main); flex: 1; line-height: 1.5;">${UI.escapeHTML(item.title || item.description || item)}</span>
                    </div>
                `).join('')}
                ${items.length === 0 ? '<div style="text-align: center; opacity: 0.5; padding: 30px; font-size: 0.82rem;">Sin recomendaciones generadas</div>' : ''}
            </div>
        `;
    },

    renderScenariosTab(us) {
        const scenarios = us.scenarios || [];
        return `
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${scenarios.map((s, i) => `
                    <div data-id="${s.id}" style="display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--apple-separator);">
                        <span style="min-width: 28px; text-align: center; font-size: 0.72rem; font-weight: 800; color: var(--brand);">E${i+1}</span>
                        <input type="text" class="scenario-edit-field us-edit-field" data-id="${us.id}" data-scenario-id="${s.id}" data-field="title" value="${UI.escapeHTML(s.title)}" placeholder="Título del escenario..." style="flex: 1; border: none; background: transparent; outline: none; font-size: 0.85rem; color: var(--text-main); padding: 4px 0;">
                        <button class="btn-icon delete-scenario" data-id="${s.id}" title="Eliminar Escenario" style="background: none; border: none; color: var(--apple-red); cursor: pointer; font-size: 12px; padding: 4px;">🗑️</button>
                    </div>
                `).join('')}
                ${scenarios.length === 0 ? '<div style="text-align: center; opacity: 0.5; padding: 30px; font-size: 0.82rem;">No hay escenarios vinculados</div>' : ''}
                <button id="btn-add-scenario" data-us-id="${us.id}" style="margin-top: 8px; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; background: none; color: var(--text-muted); font-size: 0.82rem; cursor: pointer;">+ Añadir Escenario</button>
            </div>
        `;
    },

    bindEvents(container) {
        // Auto-resize textareas
        container.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });

        // CU select
        container.querySelector('#cu-select')?.addEventListener('change', async (e) => {
            const id = parseInt(e.target.value) || null;
            Store.setSelectedUseCase(id);
            await this.loadStoriesForUC(id);
        });

        // Rename CU
        container.querySelector('#btn-rename-cu')?.addEventListener('click', async () => {
            const cuId = Store.state.selectedUseCaseId;
            if (!cuId) return;
            const cu = Store.state.useCases.find(c => c.id === cuId);
            if (!cu) return;

            const newTitle = await modalManager.prompt(
                `Nuevo título para ${cu.key_id}:`,
                cu.title,
                `Renombrar ${cu.key_id}`
            );

            if (newTitle && newTitle.trim()) {
                UI.showLoading();
                try {
                    await ApiService.updateUseCase(cuId, { title: newTitle.trim() });
                    const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
                    Store.setUseCases(useCases || []);
                    UI.toast('CU renombrado correctamente', 'success');
                    this.render(container);
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            }
        });

        // Delete CU
        container.querySelector('#btn-delete-cu')?.addEventListener('click', async () => {
            const cuId = Store.state.selectedUseCaseId;
            if (!cuId) return;
            const cu = Store.state.useCases.find(c => c.id === cuId);
            if (!cu) return;

            const suiteCount = (Store.state.testSuites || []).length;
            const usCount = (Store.state.userStories || []).length;
            const cuTitle = cu.title || cu.key_id;

            const confirmed = await modalManager.confirm(
                `¿Eliminar el Caso de Uso "${cuTitle}"?\n\n` +
                `Esta acción eliminará permanentemente:\n` +
                `• Todas las Suites asociadas (${suiteCount})\n` +
                `• Todos los Tests de esas Suites\n` +
                `• Todas las Historias de Usuario vinculadas (${usCount})\n` +
                `• Todos los escenarios y ejecuciones\n\n` +
                `Esta acción NO se puede deshacer.`
            );

            if (!confirmed) return;

            UI.showLoading();
            try {
                await ApiService.deleteUseCase(cuId);
                if (Store.state.selectedUseCaseId === cuId) {
                    Store.setSelectedUseCase(null);
                }
                const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
                Store.setUseCases(useCases || []);
                UI.hideLoading();
                UI.toast(`Caso de Uso "${cuTitle}" eliminado`, 'ok');
                this.render(container);
            } catch (err) {
                UI.hideLoading();
                UI.toast(`Error al eliminar: ${err.message}`, 'error');
            }
        });

        // New CU
        container.querySelector('#btn-new-cu')?.addEventListener('click', () => {
            Modals.render('new-use-case');
        });

        // New HU
        container.querySelector('#btn-new-us')?.addEventListener('click', () => {
            Modals.render('new-us');
        });

        // Sidebar selection
        container.querySelectorAll('.us-suite-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = parseInt(row.dataset.id);
                if (this.expandedId === id) return;
                this.expandedId = id;
                this.activeTab = 'analisis';
                this.render(container);
            });
        });

        // Sidebar Search with debounce
        let searchTimeout;
        container.querySelector('#us-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.render(container);
            }, 150);
        });

        // Tab switching
        container.querySelectorAll('.us-detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeTab = tab.dataset.tab;
                this.render(container);
            });
        });

        // Cancel Edit
        container.querySelector('.cancel-edit')?.addEventListener('click', () => {
            this.expandedId = null;
            this.render(container);
        });

        // Save US
        container.querySelector('.save-us')?.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            const fields = container.querySelectorAll('.us-edit-field');
            
const huData = {};
            const scenarioUpdates = {};

            fields.forEach(f => {
                if (f.dataset.id == id) {
                    if (f.dataset.scenarioId) {
                        const sId = f.dataset.scenarioId;
                        if (!scenarioUpdates[sId]) scenarioUpdates[sId] = {};
                        scenarioUpdates[sId][f.dataset.field] = f.value;
                    } else {
                        huData[f.dataset.field] = f.value;
                    }
                }
            });

            UI.showLoading();
            try {
                await ApiService.updateUserStory(id, huData);
                
                const promises = Object.entries(scenarioUpdates).map(([sId, data]) => 
                    ApiService.updateScenario(sId, data)
                );
                await Promise.all(promises);

                await this.reloadUS();
                UI.toast('Cambios guardados correctamente', 'success');
                this.render(container); 
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });

        // Add Scenario
        container.querySelector('#btn-add-scenario')?.addEventListener('click', async (e) => {
            const usId = parseInt(e.target.dataset.usId);
            const us = Store.state.userStories.find(u => u.id === usId);
            const nextOrder = (us?.scenarios?.length || 0);
            
            UI.showLoading();
            try {
                await ApiService.createScenario({ 
                    us_id: usId, 
                    title: `Nuevo Escenario ${nextOrder + 1}`,
                    order_index: nextOrder 
                });
                await this.reloadUS();
                this.render(container);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });

        // Delete Scenario
        container.querySelectorAll('.delete-scenario').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(btn.dataset.id);
                if (!await modalManager.confirm('¿Eliminar este escenario?')) return;
                UI.showLoading();
                try {
                    await ApiService.deleteScenario(id);
                    await this.reloadUS();
                    this.render(container);
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });
        // Resolve Inconsistency
        container.querySelectorAll('.resolve-inc-btn-hu').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                if (!await modalManager.confirm('¿Resolver esta inconsistencia? Se eliminará definitivamente.')) return;
                UI.showLoading();
                try {
                    await ApiService.deleteInconsistency(id);
                    await this.reloadUS();
                    this.render(container);
                    UI.toast('Inconsistencia resuelta');
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });
        // Go to Test Suites
        container.querySelector('.goto-suites')?.addEventListener('click', async (e) => {
            const usId = parseInt(e.target.dataset.usId);
            Store.setSelectedUS(usId);
            UI.showLoading();
            const { testSuites } = await ApiService.getTestSuites(usId);
            Store.setTestSuites(testSuites || []);
            UI.hideLoading();
            Store.setActiveTab('test-suites');
        });
        // Delete User Story
        container.querySelector('.delete-us')?.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            if (!await modalManager.confirm('¿Eliminar esta Historia de Usuario y todos sus elementos relacionados?')) return;
            UI.showLoading();
            try {
                await ApiService.deleteUserStory(id);
                this.expandedId = null;
                await this.reloadUS();
                this.render(container);
                UI.toast('Historia de Usuario eliminada');
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },

    async reloadUS() {
        const cuId = Store.state.selectedUseCaseId;
        if (cuId) {
            const { userStories } = await ApiService.getUserStories(cuId);
            Store.setUserStories(userStories || []);
        }
        // Also reload CU counts
        const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
        Store.state.useCases = useCases || [];
    },

    async loadStoriesForUC(cuId) {
        if (!cuId) {
            Store.setUserStories([]);
            return;
        }
        UI.showLoading();
        try {
            const { userStories } = await ApiService.getUserStories(cuId);
            Store.setUserStories(userStories || []);
        } catch(err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();
    }
};
