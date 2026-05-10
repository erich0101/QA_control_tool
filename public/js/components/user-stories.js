import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';

/**
 * USER-STORIES.JS - Tab "Casos de Uso"
 * 2 niveles: Selector de CU arriba → Cards de HU abajo.
 */

const STATUS_OPTIONS = ['En Análisis', 'Finalizada', 'Deprecada', 'Rechazada'];
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja'];

const SECTIONS = [
    { key: 'hu_detallada', icon: '🔍', label: 'Análisis de Inconsistencias', type: 'textarea' },
    { key: 'escenarios_prueba', icon: '🎯', label: 'Escenarios de Prueba', type: 'textarea' },
    { key: 'reglas_negocio', icon: '📜', label: 'Reglas de Negocio', type: 'textarea' },
    { key: 'precondiciones', icon: '⚙️', label: 'Precondiciones', type: 'textarea' },
    { key: 'link_documentacion', icon: '🔗', label: 'Link Documentación Base', type: 'input' }
];

export const UserStories = {
    expandedId: null,
    openSections: new Set(['hu_detallada', 'escenarios_prueba']),

    render(container) {
        const { useCases, selectedUseCaseId, userStories, activeProjectId } = Store.state;

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
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <span style="font-size: 0.85rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em;">Historias de Usuario</span>
                            <div style="display: flex; gap: 6px;">
                                <span class="tab-badge" title="Total de HUs">${userStories.length} HU</span>
                                <span class="tab-badge" style="background: var(--brand); color: white;" title="Total de Escenarios">${totalScenarios} E</span>
                            </div>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="cu-select" style="width: 100%; height: 36px; font-size: 0.8rem;">
                                <option value="">— Filtrar por Caso de Uso —</option>
                                ${useCases.map(cu => `
                                    <option value="${cu.id}" ${cu.id === selectedUseCaseId ? 'selected' : ''}>${UI.escapeHTML(cu.key_id || 'CU')} - ${UI.escapeHTML(cu.title)}</option>
                                `).join('')}
                            </select>
                            
                            <div class="search-input-wrapper">
                                <input type="text" id="us-search" placeholder="🔍 Buscar ID o título..." style="width: 100%; height: 36px; font-size: 0.8rem; background: var(--bg-main);">
                            </div>
                        </div>

                        <div style="display: flex; gap: 8px; margin-top: 12px;">
                            ${isAdmin ? `
                                <button class="btn btn-ghost btn-sm" id="btn-new-cu" style="flex: 1; height: 34px; font-weight: 700; border: 1px dashed var(--border);">+ Nuevo CU</button>
                            ` : ''}
                            ${canCreateHU && selectedUseCaseId ? `
                                <button class="btn btn-primary btn-sm" id="btn-new-us" style="flex: 2; height: 34px; font-weight: 700;">+ Nueva Historia</button>
                            ` : ''}
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
        if (userStories.length === 0) {
            return `
                <div style="padding: 20px; text-align: center; opacity: 0.5;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📋</div>
                    <p style="font-size: 0.8rem;">Sin historias disponibles</p>
                </div>
            `;
        }
        return userStories.map(us => this.renderSidebarCard(us)).join('');
    },

    renderSidebarCard(us) {
        const isActive = this.expandedId === us.id;
        const statusClass = (us.status || 'En Análisis').toLowerCase().replace(/\s+/g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const priorityClass = (us.priority || 'media').toLowerCase();

        return `
            <div class="us-master-card ${isActive ? 'active' : ''}" data-id="${us.id}">
                <div class="us-master-card-header">
                    <span class="us-master-card-id">${UI.escapeHTML(us.key_id)}</span>
                    <div class="us-master-card-badges">
                        <span class="status-pill ${statusClass}" style="font-size: 0.6rem; padding: 2px 6px;">${UI.escapeHTML(us.status || 'En Análisis')}</span>
                        <span class="priority-badge ${priorityClass}" style="font-size: 0.6rem; padding: 2px 6px;">${UI.escapeHTML(us.priority || 'Media')}</span>
                    </div>
                </div>
                <div class="us-master-card-title">${UI.escapeHTML(us.title)}</div>
            </div>
        `;
    },

    renderDetailView(us) {
        if (!us) return this.renderPlaceholder();
        
        return `
            <div class="us-detail-header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="font-size: 1.5rem;">📄</div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <h2 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${UI.escapeHTML(us.key_id)}</h2>
                            <span style="font-size: 0.7rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">Editando detalles</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-ghost btn-sm goto-suites" data-us-id="${us.id}">🧪 Ver Test Suites</button>
                    <button class="btn btn-ghost btn-sm cancel-edit">✕ Cancelar</button>
                    <button class="btn btn-primary btn-sm save-us" data-id="${us.id}">💾 Guardar Cambios</button>
                </div>
            </div>

            <div class="us-detail-body">
                <div style="display: grid; grid-template-columns: 1fr; gap: 20px;">
                    <div class="field-group">
                        <label class="field-label">Título de la Historia de Usuario</label>
                        <input type="text" value="${UI.escapeHTML(us.title)}" class="us-edit-field main-title-input" data-id="${us.id}" data-field="title" placeholder="Ej: Login de usuarios...">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="field-group">
                        <label class="field-label">Estado</label>
                        <select class="us-edit-field" data-id="${us.id}" data-field="status">
                            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${us.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Prioridad</label>
                        <select class="us-edit-field" data-id="${us.id}" data-field="priority">
                            ${PRIORITY_OPTIONS.map(p => `<option value="${p}" ${us.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Secciones de Contenido -->
                ${SECTIONS.map(sec => this.renderSection(us, sec)).join('')}
            </div>
        `;
    },

    renderSection(us, sec) {
        if (sec.key === 'escenarios_prueba') return this.renderScenariosSection(us);
        if (sec.key === 'hu_detallada') return this.renderInconsistenciesSection(us);

        const isOpen = this.openSections.has(sec.key);
        const val = us[sec.key] || '';
        
        let content = '';
        if (sec.type === 'textarea') {
            content = `<textarea class="us-edit-field section-textarea" data-id="${us.id}" data-field="${sec.key}" placeholder="Escribe aquí los detalles de ${sec.label.toLowerCase()}...">${UI.escapeHTML(val)}</textarea>`;
        } else {
            content = `<input type="text" value="${UI.escapeHTML(val)}" class="us-edit-field" data-id="${us.id}" data-field="${sec.key}" placeholder="https://...">`;
        }

        return `
            <div class="us-detail-section ${isOpen ? 'open' : ''}" data-section="${sec.key}">
                <div class="us-detail-section-header" data-section="${sec.key}">
                    <div class="us-detail-section-title">
                        <span>${sec.icon}</span>
                        <span>${sec.label}</span>
                    </div>
                    <span style="transition: transform 0.3s; transform: rotate(${isOpen ? '90deg' : '0deg'})">▶</span>
                </div>
                <div class="us-detail-section-content">
                    ${content}
                </div>
            </div>
        `;
    },

    renderInconsistenciesSection(us) {
        const isOpen = this.openSections.has('hu_detallada');
        const items = us.inconsistencies || [];
        
        return `
            <div class="us-detail-section ${isOpen ? 'open' : ''}" data-section="hu_detallada">
                <div class="us-detail-section-header" data-section="hu_detallada">
                    <div class="us-detail-section-title">
                        <span>🔍</span>
                        <span>Análisis de Inconsistencias</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="tab-badge">${items.length}</span>
                        <span style="transition: transform 0.3s; transform: rotate(${isOpen ? '90deg' : '0deg'})">▶</span>
                    </div>
                </div>
                <div class="us-detail-section-content" style="padding: 20px;">
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px;">
                        ${items.map((item, i) => `
                            <div class="scenario-item" data-id="${item.id}" style="display: flex; align-items: center; gap: 12px; padding: 8px 16px;">
                                <span class="scenario-badge" style="margin-bottom: 0; min-width: 32px; text-align: center; background: var(--bg-muted); color: var(--text-muted);">A${i+1}</span>
                                <input type="text" class="inconsistency-edit-field us-edit-field" data-id="${us.id}" data-inconsistency-id="${item.id}" data-field="title" value="${UI.escapeHTML(item.title)}" placeholder="Describir inconsistencia o hallazgo..." style="font-weight: 700; color: var(--text-main); flex: 1; border: none; background: transparent; outline: none; padding: 4px 0;">
                                <button class="btn-icon danger delete-inconsistency" data-id="${item.id}" title="Eliminar Inconsistencia">🗑</button>
                            </div>
                        `).join('')}
                        ${items.length === 0 ? '<div style="text-align: center; opacity: 0.5; padding: 20px; font-size: 0.8rem;">No hay inconsistencias detectadas</div>' : ''}
                    </div>
                    <button class="btn btn-ghost btn-sm" id="btn-add-inconsistency" data-us-id="${us.id}" style="width: 100%; border: 1px dashed var(--border);">+ Añadir Inconsistencia</button>
                </div>
            </div>
        `;
    },

    renderScenariosSection(us) {
        const isOpen = this.openSections.has('escenarios_prueba');
        const scenarios = us.scenarios || [];
        
        return `
            <div class="us-detail-section ${isOpen ? 'open' : ''}" data-section="escenarios_prueba">
                <div class="us-detail-section-header" data-section="escenarios_prueba">
                    <div class="us-detail-section-title">
                        <span>🎯</span>
                        <span>Escenarios de Prueba</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="tab-badge">${scenarios.length}</span>
                        <span style="transition: transform 0.3s; transform: rotate(${isOpen ? '90deg' : '0deg'})">▶</span>
                    </div>
                </div>
                <div class="us-detail-section-content" style="padding: 20px;">
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px;">
                        ${scenarios.map((s, i) => `
                            <div class="scenario-item" data-id="${s.id}" style="display: flex; align-items: center; gap: 12px; padding: 8px 16px;">
                                <span class="scenario-badge" style="margin-bottom: 0; min-width: 32px; text-align: center;">E${i+1}</span>
                                <input type="text" class="scenario-edit-field us-edit-field" data-id="${us.id}" data-scenario-id="${s.id}" data-field="title" value="${UI.escapeHTML(s.title)}" placeholder="Título del escenario..." style="font-weight: 700; color: var(--text-main); flex: 1; border: none; background: transparent; outline: none; padding: 4px 0;">
                                <button class="btn-icon danger delete-scenario" data-id="${s.id}" title="Eliminar Escenario">🗑</button>
                            </div>
                        `).join('')}
                        ${scenarios.length === 0 ? '<div style="text-align: center; opacity: 0.5; padding: 20px; font-size: 0.8rem;">No hay escenarios vinculados</div>' : ''}
                    </div>
                    <button class="btn btn-ghost btn-sm" id="btn-add-scenario" data-us-id="${us.id}" style="width: 100%; border: 1px dashed var(--border);">+ Añadir Escenario</button>
                </div>
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
            if (id) {
                UI.showLoading();
                const { userStories } = await ApiService.getUserStories(id);
                Store.setUserStories(userStories || []);
                UI.hideLoading();
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
        container.querySelectorAll('.us-master-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                if (this.expandedId === id) return;
                this.expandedId = id;
                this.render(container);
            });
        });

        // Sidebar Search
        container.querySelector('#us-search')?.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            container.querySelectorAll('.us-master-card').forEach(card => {
                const title = card.querySelector('.us-master-card-title').textContent.toLowerCase();
                const key = card.querySelector('.us-master-card-id').textContent.toLowerCase();
                card.style.display = (title.includes(query) || key.includes(query)) ? 'block' : 'none';
            });
        });

        // Section toggle
        container.querySelectorAll('.us-detail-section-header').forEach(header => {
            header.addEventListener('click', () => {
                const section = header.closest('.us-detail-section');
                const key = header.dataset.section;
                if (this.openSections.has(key)) {
                    this.openSections.delete(key);
                    section.classList.remove('open');
                } else {
                    this.openSections.add(key);
                    section.classList.add('open');
                }
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
            const inconsistencyUpdates = {};

            fields.forEach(f => {
                if (f.dataset.id == id) {
                    if (f.dataset.scenarioId) {
                        const sId = f.dataset.scenarioId;
                        if (!scenarioUpdates[sId]) scenarioUpdates[sId] = {};
                        scenarioUpdates[sId][f.dataset.field] = f.value;
                    } else if (f.dataset.inconsistencyId) {
                        const iId = f.dataset.inconsistencyId;
                        if (!inconsistencyUpdates[iId]) inconsistencyUpdates[iId] = {};
                        inconsistencyUpdates[iId][f.dataset.field] = f.value;
                    } else {
                        huData[f.dataset.field] = f.value;
                    }
                }
            });

            UI.showLoading();
            try {
                await ApiService.updateUserStory(id, huData);
                
                // Actualizar escenarios
                const promises = Object.entries(scenarioUpdates).map(([sId, data]) => 
                    ApiService.updateScenario(sId, data)
                );
                // Actualizar inconsistencias
                const iPromises = Object.entries(inconsistencyUpdates).map(([iId, data]) => 
                    ApiService.updateInconsistency(iId, data)
                );
                await Promise.all([...promises, ...iPromises]);

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
                if (!confirm('¿Eliminar este escenario?')) return;
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
        // Add Inconsistency
        container.querySelector('#btn-add-inconsistency')?.addEventListener('click', async (e) => {
            const usId = parseInt(e.target.dataset.usId);
            const us = Store.state.userStories.find(u => u.id === usId);
            const nextOrder = (us?.inconsistencies?.length || 0);
            
            UI.showLoading();
            try {
                await ApiService.createInconsistency({ 
                    us_id: usId, 
                    title: `Nueva Inconsistencia ${nextOrder + 1}`,
                    order_index: nextOrder 
                });
                await this.reloadUS();
                this.render(container);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });

        // Delete Inconsistency
        container.querySelectorAll('.delete-inconsistency').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(btn.dataset.id);
                if (!confirm('¿Eliminar este análisis?')) return;
                UI.showLoading();
                try {
                    await ApiService.deleteInconsistency(id);
                    await this.reloadUS();
                    this.render(container);
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
    }
};
