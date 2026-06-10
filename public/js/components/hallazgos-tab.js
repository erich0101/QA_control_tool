import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

const STATUS_COLORS = {
    'OPEN': 'var(--fail)',
    'IN_PROGRESS': 'var(--warning)',
    'FIXED': 'var(--ok)',
    'CLOSED': 'var(--muted)',
    'WONT_FIX': 'var(--muted)'
};

const SEVERITY_COLORS = {
    'Crítica': '#ef4444',
    'Alta': '#f97316',
    'Media': '#f59e0b',
    'Baja': '#22c55e'
};

const EVIDENCE_CATEGORIES = ['GENERAL', 'FIGMA', 'DEV', 'BUG'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX'];

export const HallazgosTab = {
    loadedProjectId: null,
    selectedId: null,
    isCreating: false,
    filterStatus: '',
    filterSeverity: '',
    filterSearch: '',

    async render(container) {
        if (!Store.state.activeProjectId) {
            container.innerHTML = `<div class="empty-state">Seleccioná un proyecto para ver los Hallazgos.</div>`;
            return;
        }

        if (this.loadedProjectId !== Store.state.activeProjectId) {
            try {
                UI.showLoading();
                const { hallazgos } = await ApiService.getHallazgos(Store.state.activeProjectId);
                this.loadedProjectId = Store.state.activeProjectId;
                Store.setHallazgos(hallazgos || []);
                this.selectedId = null;
                this.isCreating = false;
                UI.hideLoading();
            } catch (err) {
                UI.hideLoading();
                container.innerHTML = `<div class="empty-state">Error cargando hallazgos: ${UI.escapeHTML(err.message)}</div>`;
                return;
            }
        }

        const hallazgos = Store.state.hallazgos;
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const canCreate = isAdmin || Store.state.user?.permissions?.can_create_cu;

        container.innerHTML = `
            <div class="hallazgos-layout">
                <div class="hallazgos-sidebar">
                    <div class="hallazgos-sidebar-header">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">🔍 Hallazgos</span>
                            <span class="tab-badge" title="Total hallazgos">${hallazgos.length}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="position: relative;">
                                <input type="text" id="h-search" placeholder="Buscar por título..." value="${UI.escapeHTML(this.filterSearch)}"
                                    style="width: 100%; padding: 6px 10px 6px 30px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.78rem; outline: none; box-sizing: border-box;">
                                <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 0.8rem; opacity: 0.4;">🔍</span>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <select id="h-filter-status" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.72rem;">
                                    <option value="">Todos</option>
                                    ${STATUSES.map(s => `<option value="${s}" ${s === this.filterStatus ? 'selected' : ''}>${s}</option>`).join('')}
                                </select>
                                <select id="h-filter-severity" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-main); font-size: 0.72rem;">
                                    <option value="">Todas</option>
                                    ${Object.keys(SEVERITY_COLORS).map(s => `<option value="${s}" ${s === this.filterSeverity ? 'selected' : ''}>${s}</option>`).join('')}
                                </select>
                            </div>
                            ${canCreate ? '<button class="btn btn-primary btn-sm" id="h-btn-new" style="width:100%;">+ Nuevo Hallazgo</button>' : ''}
                        </div>
                    </div>
                    <div class="hallazgos-sidebar-list" id="h-sidebar-list">
                        ${this.renderSidebarList(hallazgos)}
                    </div>
                </div>
                <div class="hallazgos-main-content" id="h-main-content">
                    ${this.renderRightPane(hallazgos)}
                </div>
            </div>
        `;

        this.bindEvents(container);
    },

    renderSidebarList(hallazgos) {
        const q = this.filterSearch.toLowerCase();
        const filtered = hallazgos.filter(h => {
            if (this.filterStatus && h.status !== this.filterStatus) return false;
            if (this.filterSeverity && h.severity !== this.filterSeverity) return false;
            if (q && !h.title.toLowerCase().includes(q)) return false;
            return true;
        });
        if (filtered.length === 0) {
            return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">Sin hallazgos</div>`;
        }
        return filtered.map(h => this.renderSidebarCard(h)).join('');
    },

    renderSidebarCard(h) {
        const active = this.selectedId === h.id && !this.isCreating;
        const sevColor = SEVERITY_COLORS[h.severity] || '#f59e0b';
        return `
            <div class="h-card ${active ? 'active' : ''}" data-id="${h.id}">
                <div class="h-card-header">
                    <span class="h-card-id">#${h.id}</span>
                    <span class="status-pill" style="background: ${STATUS_COLORS[h.status] || 'var(--muted)'}; color: white; font-size: 0.55rem; padding: 1px 6px;">${h.status || 'OPEN'}</span>
                </div>
                <div class="h-card-title">${UI.escapeHTML(h.title)}</div>
                <div class="h-card-meta">
                    <span style="color: ${sevColor};">● ${h.severity || 'Media'}</span>
                    <span>${UI.escapeHTML(h.assignee_name || 'Sin asignar')}</span>
                    ${h.evidence_count > 0 ? `<span>📎${h.evidence_count}</span>` : ''}
                    ${h.jira_key ? `<span style="color:var(--brand);">J</span>` : ''}
                </div>
            </div>
        `;
    },

    renderRightPane(hallazgos) {
        if (this.isCreating) {
            return this.renderCreateForm();
        }
        if (this.selectedId) {
            const h = hallazgos.find(x => x.id === this.selectedId);
            if (h) return this.renderDetailForm(h);
        }
        return this.renderPlaceholder();
    },

    renderPlaceholder() {
        return `
            <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center; opacity: 0.5;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">🔍</div>
                    <h3 style="font-weight: 700;">Selecciona un hallazgo</h3>
                    <p>Haz clic en un hallazgo de la izquierda para ver sus detalles o crea uno nuevo.</p>
                </div>
            </div>
        `;
    },

    renderFormFields(data) {
        const d = data || {};
        const team = Store.state.team || [];
        return `
            <div class="h-form-grid">
                <div class="field-group full-width">
                    <label class="field-label">Título *</label>
                    <input type="text" id="hf-title" value="${UI.escapeHTML(d.title || '')}" placeholder="Resumen del hallazgo..." style="width:100%; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-size:0.95rem;">
                </div>
                <div class="field-group full-width">
                    <label class="field-label">Pasos</label>
                    <textarea id="hf-steps" placeholder="1. Ir a...&#10;2. Hacer clic en...&#10;3. Observar..." style="width:100%; min-height:90px; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-family:inherit;">${UI.escapeHTML(d.steps_to_reproduce || '')}</textarea>
                </div>
                <div class="field-group full-width">
                    <label class="field-label">Resultado Esperado</label>
                    <textarea id="hf-expected" placeholder="Lo que debería ocurrir..." style="width:100%; min-height:80px; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-family:inherit;">${UI.escapeHTML(d.expected_result || '')}</textarea>
                </div>
                <div class="field-group">
                    <label class="field-label">Precondiciones</label>
                    <textarea id="hf-preconditions" placeholder="Estado inicial necesario..." style="width:100%; min-height:80px; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-family:inherit;">${UI.escapeHTML(d.preconditions || '')}</textarea>
                </div>
                <div class="field-group">
                    <label class="field-label">Observaciones</label>
                    <textarea id="hf-observations" placeholder="Notas adicionales..." style="width:100%; min-height:80px; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-family:inherit;">${UI.escapeHTML(d.observations || '')}</textarea>
                </div>
                <div class="field-group full-width">
                    <label class="field-label">Resultado Obtenido</label>
                    <textarea id="hf-obtained" placeholder="Lo que realmente ocurrió..." style="width:100%; min-height:80px; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main); font-family:inherit;">${UI.escapeHTML(d.actual_result || '')}</textarea>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px;">
                <div class="field-group">
                    <label class="field-label">Severidad</label>
                    <select id="hf-severity" style="width:100%; padding:10px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main);">
                        ${['Baja', 'Media', 'Alta', 'Crítica'].map(s => `<option value="${s}" ${s === (d.severity || 'Media') ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label class="field-label">Frecuencia</label>
                    <select id="hf-frequency" style="width:100%; padding:10px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main);">
                        ${['Siempre', 'Casi Siempre', 'A veces', 'Rara vez'].map(s => `<option value="${s}" ${s === (d.frequency || 'Siempre') ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label class="field-label">Impacto</label>
                    <select id="hf-impact" style="width:100%; padding:10px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main);">
                        ${['', 'Bajo', 'Medio', 'Alto', 'Crítico'].map(s => `<option value="${s}" ${s === (d.business_impact || '') ? 'selected' : ''}>${s || '— Sin especificar —'}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label class="field-label">Asignado a</label>
                    <select id="hf-assigned" style="width:100%; padding:10px; background:var(--bg-input); border:1px solid var(--border); border-radius:10px; color:var(--text-main);">
                        <option value="">— Sin asignar —</option>
                        ${team.map(u => `<option value="${u.id}" ${u.id === d.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    renderCreateForm() {
        return `
            <div class="h-detail-header">
                <div>
                    <h2 style="margin:0; font-size:1rem; font-weight:800; color:var(--text-main);">✏️ Nuevo Hallazgo</h2>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--text-muted);">Completá los campos para registrar un nuevo hallazgo.</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-ghost btn-sm" id="hf-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="hf-save">Crear Hallazgo</button>
                </div>
            </div>
            <div class="h-detail-body">
                <div class="h-form-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">📋 Datos del Hallazgo</span>
                    </div>
                    <div class="h-form-section-body">
                        ${this.renderFormFields({})}
                    </div>
                </div>
                <div class="h-form-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">📎 Evidencias</span>
                    </div>
                    <div class="h-form-section-body">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <input type="file" id="hf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="hf-add-evidence">📷 Agregar captura</button>
                            <select id="hf-evidence-category" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text-main); font-size:0.78rem;">
                                ${EVIDENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <span style="font-size:0.72rem; color:var(--text-muted);" id="hf-evidence-count">0 archivos</span>
                        </div>
                        <div class="h-evidence-grid" id="hf-evidence-grid"></div>
                    </div>
                </div>
            </div>
        `;
    },

    renderDetailForm(h) {
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        return `
            <div class="h-detail-header">
                <div style="display:flex; align-items:center; gap:12px;">
                    <h2 style="margin:0; font-size:1rem; font-weight:800; color:var(--text-main);">🔍 Hallazgo #${h.id}</h2>
                    <span class="status-pill" style="background:${STATUS_COLORS[h.status] || 'var(--muted)'}; color:white; font-size:0.65rem; padding:2px 10px;">${h.status || 'OPEN'}</span>
                    ${h.jira_key ? `<a href="${UI.escapeHTML(h.jira_url || '#')}" target="_blank" style="color:var(--brand); font-size:0.75rem; text-decoration:none;">${h.jira_key} ↗</a>` : ''}
                    ${h.converted_to_tc ? `<span style="color:var(--ok); font-size:0.75rem;">✅ TC#${h.converted_tc_id}</span>` : ''}
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(h.created_at).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-sm" id="hf-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="hf-save">Guardar Cambios</button>
                </div>
            </div>
            <div class="h-detail-body">
                <div class="h-form-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">📋 Datos del Hallazgo</span>
                    </div>
                    <div class="h-form-section-body">
                        ${this.renderFormFields(h)}
                    </div>
                </div>

                ${h.jira_key ? '' : `
                <div class="h-form-section" id="h-jira-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">🎯 Exportar a Jira</span>
                        <button class="btn btn-ghost btn-xs" id="h-toggle-jira">${h.jira_key ? 'Vinculado' : 'Expandir'}</button>
                    </div>
                    <div class="h-form-section-body" id="h-jira-body" style="display:none;">
                        <select id="h-jira-epic" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem; margin-bottom:8px;"><option value="">Cargando...</option></select>
                        <select id="h-jira-assignee" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem; margin-bottom:8px;"><option value="">Cargando...</option></select>
                        <select id="h-jira-priority" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem; margin-bottom:8px;"><option value="">Cargando...</option></select>
                        <div id="h-jira-custom-fields"></div>
                        <button class="btn btn-primary" id="h-btn-create-jira" style="width:100%; background:var(--brand);">🚀 CREAR TICKET EN JIRA</button>
                        <div id="h-jira-success" style="display:none; padding:12px; background:rgba(34,197,94,0.1); border-radius:8px; margin-top:8px;">
                            ✅ Ticket creado: <a href="#" id="h-jira-link" target="_blank" style="color:var(--brand);"></a>
                        </div>
                    </div>
                </div>`}

                <div class="h-form-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">🔧 Acciones</span>
                    </div>
                    <div class="h-form-section-body">
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                            <select id="h-status-select" style="padding:8px 12px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem;">
                                ${STATUSES.map(s => `<option value="${s}" ${s === h.status ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="h-btn-update-status" style="background:var(--brand);color:white;border:none;border-radius:8px;padding:8px 16px;">Actualizar Estado</button>

                            <div style="width:1px; height:24px; background:var(--border);"></div>

                            <select id="h-assign-select" style="padding:8px 12px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem;">
                                <option value="">Sin asignar</option>
                                ${(Store.state.team || []).map(u => `<option value="${u.id}" ${u.id === h.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="h-btn-assign" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 16px;">Asignar</button>

                            ${!h.converted_to_tc ? `
                            <div style="width:1px; height:24px; background:var(--border);"></div>
                            <select id="h-suite-select" style="padding:8px 12px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem;">
                                <option value="">Suite para TC...</option>
                            </select>
                            <button class="btn btn-sm" id="h-btn-convert-tc" style="background:var(--ok);color:white;border:none;border-radius:8px;padding:8px 16px;">Crear TC</button>
                            ` : ''}

                            ${isAdmin ? `
                            <div style="width:1px; height:24px; background:var(--border);"></div>
                            <button class="btn btn-sm" id="h-btn-delete" style="background:var(--fail);color:white;border:none;border-radius:8px;padding:8px 16px;">🗑️ Eliminar</button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="h-form-section">
                    <div class="h-form-section-header">
                        <span class="h-form-section-title">📎 Evidencias</span>
                    </div>
                    <div class="h-form-section-body">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                            <input type="file" id="hf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="hf-add-evidence">📷 Agregar captura</button>
                            <select id="hf-evidence-category" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text-main); font-size:0.78rem;">
                                ${EVIDENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <span style="font-size:0.72rem; color:var(--text-muted);" id="hf-evidence-count">0 archivos</span>
                        </div>
                        <div class="h-evidence-grid" id="hf-evidence-grid">
                            <div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">Cargando evidencias...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents(container) {
        const mainContent = container.querySelector('#h-main-content');
        const sidebarList = container.querySelector('#h-sidebar-list');

        const applyFilters = () => {
            this.filterSearch = container.querySelector('#h-search')?.value || '';
            this.filterStatus = container.querySelector('#h-filter-status')?.value || '';
            this.filterSeverity = container.querySelector('#h-filter-severity')?.value || '';
            const list = container.querySelector('#h-sidebar-list');
            if (list) {
                list.innerHTML = this.renderSidebarList(Store.state.hallazgos);
                this.bindSidebarClicks(container);
            }
        };

        container.querySelector('#h-search')?.addEventListener('input', applyFilters);
        container.querySelector('#h-filter-status')?.addEventListener('change', applyFilters);
        container.querySelector('#h-filter-severity')?.addEventListener('change', applyFilters);

        container.querySelector('#h-btn-new')?.addEventListener('click', () => {
            this.isCreating = true;
            this.selectedId = null;
            const mc = container.querySelector('#h-main-content');
            if (mc) mc.innerHTML = this.renderCreateForm();
            this.bindFormEvents(container, false);
        });

        this.bindSidebarClicks(container);

        if (this.isCreating) {
            this.bindFormEvents(container, false);
        } else if (this.selectedId) {
            const h = Store.state.hallazgos.find(x => x.id === this.selectedId);
            if (h) {
                this.bindFormEvents(container, true, h);
                this.bindDetailActions(h, container);
                if (!h.jira_key) this.initJiraIntegration(h, container);
                if (!h.converted_to_tc) this.loadSuites(h, container);
                this.loadEvidence(h, container);
            }
        }
    },

    bindSidebarClicks(container) {
        container.querySelectorAll('.h-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                const h = Store.state.hallazgos.find(x => x.id === id);
                if (!h) return;
                this.isCreating = false;
                this.selectedId = id;
                const mainContent = container.querySelector('#h-main-content');
                if (mainContent) {
                    mainContent.innerHTML = this.renderDetailForm(h);
                    this.bindFormEvents(container, true, h);
                    this.bindDetailActions(h, container);
                    if (!h.jira_key) this.initJiraIntegration(h, container);
                    if (!h.converted_to_tc) this.loadSuites(h, container);
                    this.loadEvidence(h, container);
                }
                const list = container.querySelector('#h-sidebar-list');
                if (list) {
                    list.innerHTML = this.renderSidebarList(Store.state.hallazgos);
                    this.bindSidebarClicks(container);
                }
            });
        });
    },

    getFormData(container) {
        return {
            title: container.querySelector('#hf-title')?.value?.trim() || '',
            steps_to_reproduce: container.querySelector('#hf-steps')?.value?.trim() || '',
            expected_result: container.querySelector('#hf-expected')?.value?.trim() || '',
            preconditions: container.querySelector('#hf-preconditions')?.value?.trim() || '',
            observations: container.querySelector('#hf-observations')?.value?.trim() || '',
            actual_result: container.querySelector('#hf-obtained')?.value?.trim() || '',
            severity: container.querySelector('#hf-severity')?.value || 'Media',
            frequency: container.querySelector('#hf-frequency')?.value || 'Siempre',
            business_impact: container.querySelector('#hf-impact')?.value || '',
            assigned_to: container.querySelector('#hf-assigned')?.value || null
        };
    },

    async bindFormEvents(container, isEdit, h) {
        const cancelBtn = container.querySelector('#hf-cancel');
        const saveBtn = container.querySelector('#hf-save');

        cancelBtn?.addEventListener('click', () => {
            if (isEdit && h) {
                this.selectedId = h.id;
                this.isCreating = false;
                const mc = container.querySelector('#h-main-content');
                if (mc) {
                    mc.innerHTML = this.renderDetailForm(h);
                    this.bindFormEvents(container, true, h);
                    this.bindDetailActions(h, container);
                    if (!h.jira_key) this.initJiraIntegration(h, container);
                    if (!h.converted_to_tc) this.loadSuites(h, container);
                    this.loadEvidence(h, container);
                }
                const list = container.querySelector('#h-sidebar-list');
                if (list) {
                    list.innerHTML = this.renderSidebarList(Store.state.hallazgos);
                    this.bindSidebarClicks(container);
                }
            } else {
                this.isCreating = false;
                const mc = container.querySelector('#h-main-content');
                if (mc) mc.innerHTML = this.renderPlaceholder();
            }
        });

        saveBtn?.addEventListener('click', async () => {
            const data = this.getFormData(container);
            if (!data.title) return UI.toast('El título es requerido', 'error');

            UI.showLoading();
            try {
                if (isEdit && h) {
                    await ApiService.updateHallazgo(h.id, data);
                    UI.toast('✅ Hallazgo actualizado');

                    const pendingFiles = this._pendingFiles || [];
                    if (pendingFiles.length > 0) {
                        await this.uploadPendingEvidence(h.id, pendingFiles);
                        this._pendingFiles = [];
                    }

                    await this.refreshAndSelect(container, h.id);
                } else {
                    data.project_id = Store.state.activeProjectId;
                    const res = await ApiService.createHallazgo(data);
                    UI.toast('✅ Hallazgo creado');

                    const pendingFiles = this._pendingFiles || [];
                    if (pendingFiles.length > 0 && res.id) {
                        await this.uploadPendingEvidence(res.id, pendingFiles);
                        this._pendingFiles = [];
                    }

                    this.isCreating = false;
                    this.selectedId = res.id;
                    await this.refreshAndSelect(container, res.id);
                }
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });

        this.bindEvidenceEvents(container, h);
    },

    async uploadPendingEvidence(hallazgoId, files) {
        for (const f of files) {
            const formData = new FormData();
            formData.append('evidence', f.file);
            formData.append('defect_id', hallazgoId);
            formData.append('category', f.category);
            try {
                await fetch('/api/evidence', { method: 'POST', body: formData });
            } catch (err) {
                console.error('Error subiendo evidencia:', err);
            }
        }
    },

    bindEvidenceEvents(container, h) {
        const input = container.querySelector('#hf-evidence-input');
        const addBtn = container.querySelector('#hf-add-evidence');
        const categorySelect = container.querySelector('#hf-evidence-category');
        const countSpan = container.querySelector('#hf-evidence-count');
        const grid = container.querySelector('#hf-evidence-grid');

        if (!input || !addBtn) return;

        addBtn.addEventListener('click', () => input.click());

        input.addEventListener('change', () => {
            const files = Array.from(input.files);
            if (files.length === 0) return;
            const category = categorySelect?.value || 'GENERAL';

            if (!this._pendingFiles) this._pendingFiles = [];

            files.forEach(file => {
                this._pendingFiles.push({ file, category });
                const reader = new FileReader();
                reader.onload = (e) => {
                    const div = document.createElement('div');
                    div.className = 'h-evidence-item';
                    div.dataset.pending = 'true';
                    div.innerHTML = `
                        <img src="${e.target.result}" alt="${file.name}">
                        <span class="h-evidence-category-badge">${category}</span>
                        <button class="h-evidence-remove" data-pending="true" data-filename="${file.name}">✕</button>
                    `;
                    grid?.prepend(div);
                    div.querySelector('.h-evidence-remove')?.addEventListener('click', () => {
                        div.remove();
                        this._pendingFiles = this._pendingFiles.filter(f => f.file !== file);
                        this.updateEvidenceCount(container);
                    });
                };
                reader.readAsDataURL(file);
            });

            this.updateEvidenceCount(container);
            input.value = '';
        });
    },

    updateEvidenceCount(container) {
        const grid = container.querySelector('#hf-evidence-grid');
        const countSpan = container.querySelector('#hf-evidence-count');
        if (!grid || !countSpan) return;
        const items = grid.querySelectorAll('.h-evidence-item');
        countSpan.textContent = `${items.length} archivo(s)`;
    },

    async bindDetailActions(h, container) {
        container.querySelector('#h-btn-update-status')?.addEventListener('click', async () => {
            const status = container.querySelector('#h-status-select')?.value;
            if (!status) return;
            try {
                await ApiService.updateHallazgoStatus(h.id, status);
                UI.toast('✅ Estado actualizado');
                await this.refreshAndSelect(container, h.id);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        });

        container.querySelector('#h-btn-assign')?.addEventListener('click', async () => {
            const assigned_to = container.querySelector('#h-assign-select')?.value;
            try {
                await ApiService.assignHallazgo(h.id, assigned_to || null);
                UI.toast('✅ Asignación actualizada');
                await this.refreshAndSelect(container, h.id);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        });

        container.querySelector('#h-btn-convert-tc')?.addEventListener('click', async () => {
            const suiteId = container.querySelector('#h-suite-select')?.value;
            if (!suiteId) return UI.toast('⚠️ Seleccioná una suite', 'error');
            try {
                const res = await ApiService.convertHallazgoToTC(h.id, parseInt(suiteId));
                UI.toast(`✅ Test Case creado: ${res.key_id || 'TC#' + res.tc_id}`);
                await this.refreshAndSelect(container, h.id);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        });

        container.querySelector('#h-btn-delete')?.addEventListener('click', async () => {
            if (!confirm(`¿Eliminar el hallazgo #${h.id}?`)) return;
            try {
                await ApiService.deleteHallazgo(h.id);
                UI.toast('🗑️ Hallazgo eliminado');
                this.selectedId = null;
                this.loadedProjectId = null;
                await this.render(container.closest('.hallazgos-layout')?.parentElement || container);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
        });

        container.querySelector('#h-toggle-jira')?.addEventListener('click', () => {
            const body = container.querySelector('#h-jira-body');
            if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
        });
    },

    async initJiraIntegration(h, container) {
        const epicSelect = container.querySelector('#h-jira-epic');
        const assigneeSelect = container.querySelector('#h-jira-assignee');
        const prioritySelect = container.querySelector('#h-jira-priority');
        const btnCreate = container.querySelector('#h-btn-create-jira');
        const successContainer = container.querySelector('#h-jira-success');
        const ticketLink = container.querySelector('#h-jira-link');
        if (!epicSelect) return;

        try {
            const projectId = Store.state.activeProjectId || h.project_id;
            if (!projectId) return;

            const { epics, users, priorities, customFields, error } = await ApiService.getJiraContext(projectId);

            if (error) {
                UI.toast(error, 'warn');
                epicSelect.innerHTML = '<option value="">— ' + (error.includes('token') ? 'Configura tu token' : error) + ' —</option>';
            } else {
                epicSelect.innerHTML = '<option value="">— Sin Épica —</option>' +
                    (epics || []).map(e => `<option value="${e.id}">${UI.escapeHTML(e.key)} | ${UI.escapeHTML(e.summary)}</option>`).join('');
                assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>' +
                    (users || []).map(u => `<option value="${u.accountId}">${UI.escapeHTML(u.displayName)}</option>`).join('');
                prioritySelect.innerHTML = (priorities || []).map(p =>
                    `<option value="${p.id}" ${p.name === 'Medium' ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>`
                ).join('');
            }

            const cfContainer = container.querySelector('#h-jira-custom-fields');
            if (customFields && customFields.length > 0) {
                let html = '';
                for (const field of customFields) {
                    html += `<div style="margin-bottom:8px;">
                        <label style="font-size:0.65rem; color:var(--text-muted);">${UI.escapeHTML(field.name)}${field.required ? ' *' : ''}</label>`;
                    if (field.options?.length > 0) {
                        html += `<select id="h-cf-${field.fieldId}" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem;">
                            <option value="">— Seleccionar —</option>${field.options.map(o => `<option value="${o.id}">${UI.escapeHTML(o.name)}</option>`).join('')}</select>`;
                    } else {
                        html += `<input type="text" id="h-cf-${field.fieldId}" style="width:100%; padding:8px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-main); font-size:0.8rem;">`;
                    }
                    html += `</div>`;
                }
                cfContainer.innerHTML = html;
            }

            btnCreate.onclick = async () => {
                const customFieldValues = {};
                if (customFields) {
                    for (const field of customFields) {
                        const el = container.querySelector(`#h-cf-${field.fieldId}`);
                        if (el?.value) customFieldValues[field.fieldId] = field.options?.length > 0 ? { id: el.value } : el.value;
                    }
                }
                btnCreate.disabled = true;
                btnCreate.innerText = '⌛ CREANDO TICKET...';
                try {
                    const result = await ApiService.createJiraFromHallazgo(h.id, epicSelect.value, assigneeSelect.value, prioritySelect.value, customFieldValues);
                    if (successContainer) successContainer.style.display = 'block';
                    if (ticketLink) { ticketLink.href = result.jira.browser_url; ticketLink.innerText = result.jira.key; }
                    let msg = '✅ Ticket Jira creado';
                    if (result.attachment_count > 0) msg += ` — ${result.attachment_count} evidencia(s) adjuntada(s)`;
                    UI.toast(msg);
                    await this.refreshAndSelect(container, h.id);
                } catch (err) {
                    UI.toast(err.message, 'error');
                    btnCreate.disabled = false;
                    btnCreate.innerText = '🚀 CREAR TICKET EN JIRA';
                }
            };
        } catch (err) {
            console.log('Jira no disponible:', err.message);
        }
    },

    async loadSuites(h, container) {
        const select = container.querySelector('#h-suite-select');
        if (!select) return;
        try {
            const res = await ApiService.getTestSuites(null, Store.state.activeProjectId);
            const suites = res.testSuites || [];
            select.innerHTML = '<option value="">— Seleccionar Suite —</option>' +
                (suites || []).map(s => `<option value="${s.id}">${UI.escapeHTML(s.title)}</option>`).join('');
        } catch (err) {
            select.innerHTML = '<option value="">Error cargando suites</option>';
        }
    },

    async loadEvidence(h, container) {
        const grid = container.querySelector('#hf-evidence-grid');
        const countSpan = container.querySelector('#hf-evidence-count');
        if (!grid) return;
        try {
            const res = await fetch(`/api/hallazgos/${h.id}/evidence`);
            const data = await res.json();
            const items = data.evidence || [];
            if (items.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">Sin evidencias adjuntas.</div>';
                if (countSpan) countSpan.textContent = '0 archivos';
                return;
            }
            grid.innerHTML = items.map(ev => `
                <div class="h-evidence-item" data-id="${ev.id}">
                    <img src="/api/evidence/${ev.id}" alt="${UI.escapeHTML(ev.file_name)}" loading="lazy">
                    <span class="h-evidence-category-badge">${ev.evidence_category || 'GENERAL'}</span>
                    <button class="h-evidence-remove" data-id="${ev.id}">✕</button>
                </div>
            `).join('');
            if (countSpan) countSpan.textContent = `${items.length} archivo(s)`;

            grid.querySelectorAll('.h-evidence-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('¿Eliminar esta evidencia?')) return;
                    try {
                        await fetch(`/api/evidence/${btn.dataset.id}`, { method: 'DELETE' });
                        btn.closest('.h-evidence-item')?.remove();
                        this.updateEvidenceCount(container);
                    } catch (err) {
                        UI.toast('Error al eliminar evidencia', 'error');
                    }
                });
            });
        } catch (err) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">Error cargando evidencias.</div>';
        }
    },

    async refreshAndSelect(container, hallazgoId) {
        try {
            const { hallazgos } = await ApiService.getHallazgos(Store.state.activeProjectId);
            Store.setHallazgos(hallazgos || []);
            this.selectedId = hallazgoId;
            this.isCreating = false;
            const mc = container.querySelector('#h-main-content');
            const list = container.querySelector('#h-sidebar-list');
            if (list) list.innerHTML = this.renderSidebarList(Store.state.hallazgos);
            if (mc) mc.innerHTML = this.renderPlaceholder();
            this.bindSidebarClicks(container);
            if (hallazgoId) {
                const h = Store.state.hallazgos.find(x => x.id === hallazgoId);
                if (h && mc) {
                    mc.innerHTML = this.renderDetailForm(h);
                    this.bindFormEvents(container, true, h);
                    this.bindDetailActions(h, container);
                    if (!h.jira_key) this.initJiraIntegration(h, container);
                    if (!h.converted_to_tc) this.loadSuites(h, container);
                    this.loadEvidence(h, container);
                }
            }
        } catch (err) {
            UI.toast('Error al refrescar', 'error');
        }
    }
};
