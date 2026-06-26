import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { getCachedTab, setCachedTab, invalidateTabCache } from '../store/state.js';

const STATUS_COLORS = {
    'OPEN': 'var(--apple-red)',
    'IN_PROGRESS': 'var(--apple-orange)',
    'FIXED': 'var(--apple-green)',
    'CLOSED': 'var(--apple-label-tertiary)',
    'WONT_FIX': 'var(--apple-label-tertiary)'
};

const STATUS_BG = {
    'OPEN': 'var(--apple-red-soft)',
    'IN_PROGRESS': 'var(--apple-orange-soft)',
    'FIXED': 'var(--apple-green-soft)',
    'CLOSED': 'var(--apple-fill)',
    'WONT_FIX': 'var(--apple-fill)'
};

const SEVERITY_COLORS = {
    'Crítica': 'var(--apple-red)',
    'Alta': 'var(--apple-orange)',
    'Media': 'var(--apple-yellow)',
    'Baja': 'var(--apple-green)'
};

const SEVERITY_BG = {
    'Crítica': 'var(--apple-red-soft)',
    'Alta': 'var(--apple-orange-soft)',
    'Media': 'var(--apple-yellow-soft)',
    'Baja': 'var(--apple-green-soft)'
};

const EVIDENCE_CATEGORIES = ['GENERAL', 'FIGMA', 'DEV', 'BUG'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX'];

const SUGGESTION_CATEGORIES = ['UX', 'Performance', 'Seguridad', 'Accesibilidad', 'Otro'];
const SUGGESTION_STATUSES = ['OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'DONE'];
const SUGGESTION_PRIORITIES = ['Baja', 'Media', 'Alta'];

const SUGGESTION_CATEGORY_COLORS = {
    'UX': 'var(--apple-blue)',
    'Performance': 'var(--apple-orange)',
    'Seguridad': 'var(--apple-red)',
    'Accesibilidad': 'var(--apple-purple)',
    'Otro': 'var(--apple-label-tertiary)'
};
const SUGGESTION_CATEGORY_BG = {
    'UX': 'var(--apple-blue-soft)',
    'Performance': 'var(--apple-orange-soft)',
    'Seguridad': 'var(--apple-red-soft)',
    'Accesibilidad': 'var(--apple-purple-soft)',
    'Otro': 'var(--apple-fill)'
};
const SUGGESTION_STATUS_COLORS = {
    'OPEN': 'var(--apple-blue)',
    'IN_REVIEW': 'var(--apple-orange)',
    'ACCEPTED': 'var(--apple-green)',
    'DONE': 'var(--apple-green)',
    'REJECTED': 'var(--apple-label-tertiary)'
};
const SUGGESTION_STATUS_BG = {
    'OPEN': 'var(--apple-blue-soft)',
    'IN_REVIEW': 'var(--apple-orange-soft)',
    'ACCEPTED': 'var(--apple-green-soft)',
    'DONE': 'var(--apple-green-soft)',
    'REJECTED': 'var(--apple-fill)'
};

export const HallazgosTab = {
    loadedProjectId: null,
    selectedId: null,
    isCreating: false,
    subTab: 'bugs', // 'bugs' | 'suggestions'
    filterStatus: '',
    filterSeverity: '',
    filterCategory: '',
    filterPriority: '',
    filterSearch: '',

    async render(container) {
        if (!Store.state.activeProjectId) {
            container.innerHTML = `<div class="empty-state">Seleccioná un proyecto para ver los Hallazgos.</div>`;
            return;
        }

        if (this.loadedProjectId !== Store.state.activeProjectId) {
            const cached = getCachedTab('hallazgos', Store.state.activeProjectId);
            if (cached) {
                this.loadedProjectId = Store.state.activeProjectId;
                Store.setHallazgos(cached.data.hallazgos || []);
                Store.setSuggestions(cached.data.suggestions || []);
            } else {
                container.innerHTML = UI.skeletonHTML(8, 3);
                try {
                    const [hallazgosRes, suggestionsRes] = await Promise.all([
                        ApiService.getHallazgos(Store.state.activeProjectId),
                        ApiService.getSuggestions(Store.state.activeProjectId).catch(() => ({ suggestions: [] }))
                    ]);
                    this.loadedProjectId = Store.state.activeProjectId;
                    Store.setHallazgos(hallazgosRes.hallazgos || []);
                    Store.setSuggestions(suggestionsRes.suggestions || []);
                    setCachedTab('hallazgos', Store.state.activeProjectId, {
                        hallazgos: hallazgosRes.hallazgos || [],
                        suggestions: suggestionsRes.suggestions || []
                    });
                    this.selectedId = null;
                    this.isCreating = false;
                } catch (err) {
                    container.innerHTML = `<div class="empty-state">Error cargando hallazgos: ${UI.escapeHTML(err.message)}</div>`;
                    return;
                }
            }
        }

        const isBugs = this.subTab === 'bugs';
        const items = isBugs ? Store.state.hallazgos : Store.state.suggestions;
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const canCreate = isAdmin || Store.state.user?.permissions?.can_create_cu;
        const newBtnLabel = isBugs ? '+ Nuevo Hallazgo' : '+ Nueva Sugerencia';
        const sectionTitle = isBugs ? '🐞 Bugs' : '💡 Sugerencias';
        const sectionTooltip = isBugs ? 'Total bugs' : 'Total sugerencias';

        container.innerHTML = `
            <div class="hallazgos-layout" style="display: flex; height: 100%;">
                <div class="hallazgos-sidebar" style="width: 320px; border-right: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); display: flex; flex-direction: column;">
                    <div class="hallazgos-sidebar-header" style="padding: 16px; border-bottom: 1px solid var(--apple-separator);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">${sectionTitle}</span>
                            <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);" title="${sectionTooltip}">${items.length}</span>
                        </div>
                        <div style="display: flex; gap: 4px; background: var(--apple-fill); padding: 3px; border-radius: 20px; margin-bottom: 12px;">
                            <button class="hallazgos-subtab ${isBugs ? 'active' : ''}" data-subtab="bugs" style="flex: 1; padding: 6px 10px; border-radius: 18px; border: none; background: ${isBugs ? 'var(--apple-blue)' : 'transparent'}; color: ${isBugs ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">🐞 Bugs</button>
                            <button class="hallazgos-subtab ${!isBugs ? 'active' : ''}" data-subtab="suggestions" style="flex: 1; padding: 6px 10px; border-radius: 18px; border: none; background: ${!isBugs ? 'var(--apple-blue)' : 'transparent'}; color: ${!isBugs ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">💡 Sugerencias</button>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <input type="text" id="h-search" placeholder="🔍 Buscar por título..." value="${UI.escapeHTML(this.filterSearch)}"
                                style="width: 100%; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none; box-sizing: border-box; transition: border-color 0.15s;"
                                onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'">
                            <div style="display: flex; gap: 8px;">
                                <select id="h-filter-status" style="flex: 1; padding: 6px 10px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.72rem; outline: none;">
                                    <option value="">Todos</option>
                                    ${(isBugs ? STATUSES : SUGGESTION_STATUSES).map(s => `<option value="${s}" ${s === this.filterStatus ? 'selected' : ''}>${s}</option>`).join('')}
                                </select>
                                ${isBugs
                                    ? `<select id="h-filter-severity" style="flex: 1; padding: 6px 10px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.72rem; outline: none;">
                                            <option value="">Todas</option>
                                            ${Object.keys(SEVERITY_COLORS).map(s => `<option value="${s}" ${s === this.filterSeverity ? 'selected' : ''}>${s}</option>`).join('')}
                                        </select>`
                                    : `<select id="h-filter-category" style="flex: 1; padding: 6px 10px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.72rem; outline: none;">
                                            <option value="">Todas</option>
                                            ${SUGGESTION_CATEGORIES.map(c => `<option value="${c}" ${c === this.filterCategory ? 'selected' : ''}>${c}</option>`).join('')}
                                        </select>`
                                }
                            </div>
                            ${canCreate ? `<button class="btn btn-primary btn-sm" id="h-btn-new" style="width:100%; padding: 8px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--apple-radius-md);">${newBtnLabel}</button>` : ''}
                        </div>
                    </div>
                    <div class="hallazgos-sidebar-list" id="h-sidebar-list" style="flex: 1; overflow-y: auto;">
                        ${this.renderSidebarList(items)}
                    </div>
                </div>
                <div class="hallazgos-main-content" id="h-main-content" style="flex: 1; overflow-y: auto; background: var(--apple-bg-primary);">
                    ${this.renderRightPane(items)}
                </div>
            </div>
        `;

        this.bindEvents(container);
    },

    renderSidebarList(items) {
        const q = this.filterSearch.toLowerCase();
        const isBugs = this.subTab === 'bugs';
        const filtered = items.filter(h => {
            if (this.filterStatus && h.status !== this.filterStatus) return false;
            if (isBugs) {
                if (this.filterSeverity && h.severity !== this.filterSeverity) return false;
            } else {
                if (this.filterCategory && h.category !== this.filterCategory) return false;
                if (this.filterPriority && h.priority !== this.filterPriority) return false;
            }
            if (q && !h.title.toLowerCase().includes(q)) return false;
            return true;
        });
        if (filtered.length === 0) {
            const emptyMsg = isBugs ? 'Sin bugs' : 'Sin sugerencias';
            return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">${emptyMsg}</div>`;
        }
        return filtered.map(h => this.renderSidebarCard(h)).join('');
    },

    renderSidebarCard(h) {
        const active = this.selectedId === h.id && !this.isCreating;
        const isBugs = this.subTab === 'bugs';
        const isDismissed = isBugs && h.status === 'DISMISSED';
        const statusColor = isBugs
            ? (STATUS_COLORS[h.status] || 'var(--apple-label-tertiary)')
            : (SUGGESTION_STATUS_COLORS[h.status] || 'var(--apple-label-tertiary)');
        const statusBg = isBugs
            ? (STATUS_BG[h.status] || 'var(--apple-fill)')
            : (SUGGESTION_STATUS_BG[h.status] || 'var(--apple-fill)');

        const selectedStyle = active ? `
            background: var(--apple-indigo-soft);
            border-left: 3px solid var(--apple-blue);
            padding-left: 11px;
        ` : `
            border-left: 3px solid transparent;
            padding-left: 12px;
        `;

        const badge = isBugs
            ? (() => {
                const sevColor = SEVERITY_COLORS[h.severity] || 'var(--apple-yellow)';
                const sevBg = SEVERITY_BG[h.severity] || 'var(--apple-yellow-soft)';
                return `<span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 10px; background: ${sevBg}; color: ${sevColor}; font-weight: 600;">
                            <span style="width: 4px; height: 4px; border-radius: 50%; background: ${sevColor};"></span>
                            ${h.severity || 'Media'}
                        </span>`;
            })()
            : (() => {
                const catColor = SUGGESTION_CATEGORY_COLORS[h.category] || 'var(--apple-label-tertiary)';
                const catBg = SUGGESTION_CATEGORY_BG[h.category] || 'var(--apple-fill)';
                return `<span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 10px; background: ${catBg}; color: ${catColor}; font-weight: 600;">
                            ${h.category || 'Otro'}
                        </span>`;
            })();

        return `
            <div class="h-card ${active ? 'active' : ''}" data-id="${h.id}" style="padding: 12px; cursor: pointer; transition: all 0.15s ease; border-bottom: 1px solid var(--apple-separator); ${selectedStyle} ${isDismissed ? 'opacity: 0.5;' : ''}"
                onmouseover="if(!this.classList.contains('active')) this.style.background='var(--apple-fill)'"
                onmouseout="if(!this.classList.contains('active')) this.style.background='transparent'">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--apple-label-tertiary);">#${h.id}</span>
                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 0.58rem; font-weight: 600;">${h.status || 'OPEN'}</span>
                    ${isDismissed ? `<span style="font-size: 0.58rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase;">Descartado</span>` : ''}
                </div>
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--apple-label); margin-bottom: 6px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(h.title)}</div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.68rem; color: var(--apple-label-tertiary);">
                    ${badge}
                    <span style="color: var(--apple-label-secondary);">👤 ${UI.escapeHTML(h.assignee_name || 'Sin asignar')}</span>
                    ${h.evidence_count > 0 ? `<span>📎 ${h.evidence_count}</span>` : ''}
                    ${h.jira_key ? `<span style="color: var(--apple-blue); font-weight: 600;">🔗 JIRA</span>` : ''}
                </div>
            </div>
        `;
    },

    renderRightPane(items) {
        if (this.isCreating) {
            return this.subTab === 'suggestions' ? this.renderCreateSuggestionForm() : this.renderCreateForm();
        }
        if (this.selectedId) {
            const h = items.find(x => x.id === this.selectedId);
            if (h) {
                return this.subTab === 'suggestions' ? this.renderSuggestionDetailForm(h) : this.renderDetailForm(h);
            }
        }
        return this.renderPlaceholder();
    },

    renderPlaceholder() {
        return `
            <div style="height: 100%; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center; opacity: 0.5;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">🔍</div>
                    <h3 style="font-weight: 700; color: var(--apple-label); margin: 0 0 8px 0;">Selecciona un hallazgo</h3>
                    <p style="color: var(--apple-label-tertiary); margin: 0;">Haz clic en un hallazgo de la izquierda para ver sus detalles o crea uno nuevo.</p>
                </div>
            </div>
        `;
    },

    renderFormFields(data) {
        const d = data || {};
        const team = Store.state.team || [];
        const inputStyle = "width:100%; padding:8px 12px; background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); border-radius:var(--apple-radius-md); color:var(--apple-label); font-size:0.85rem; outline:none; box-sizing:border-box; transition: border-color 0.15s;";
        const focusAttr = `onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'"`;

        return `
            <div class="h-form-grid" style="display: grid; gap: 16px;">
                <div class="field-group full-width">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Título *</label>
                    <input type="text" id="hf-title" value="${UI.escapeHTML(d.title || '')}" placeholder="Resumen del hallazgo..." style="${inputStyle}" ${focusAttr}>
                </div>
                <div class="field-group full-width">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Pasos</label>
                    <textarea id="hf-steps" placeholder="1. Ir a...&#10;2. Hacer clic en...&#10;3. Observar..." style="${inputStyle} min-height:90px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.steps_to_reproduce || '')}</textarea>
                </div>
                <div class="field-group full-width">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Resultado Esperado</label>
                    <textarea id="hf-expected" placeholder="Lo que debería ocurrir..." style="${inputStyle} min-height:80px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.expected_result || '')}</textarea>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="field-group">
                        <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Precondiciones</label>
                        <textarea id="hf-preconditions" placeholder="Estado inicial necesario..." style="${inputStyle} min-height:80px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.preconditions || '')}</textarea>
                    </div>
                    <div class="field-group">
                        <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Observaciones</label>
                        <textarea id="hf-observations" placeholder="Notas adicionales..." style="${inputStyle} min-height:80px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.observations || '')}</textarea>
                    </div>
                </div>
                <div class="field-group full-width">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Resultado Obtenido</label>
                    <textarea id="hf-obtained" placeholder="Lo que realmente ocurrió..." style="${inputStyle} min-height:80px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.actual_result || '')}</textarea>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-top: 16px;">
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Severidad</label>
                    <select id="hf-severity" style="${inputStyle}">
                        ${['Baja', 'Media', 'Alta', 'Crítica'].map(s => `<option value="${s}" ${s === (d.severity || 'Media') ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Frecuencia</label>
                    <select id="hf-frequency" style="${inputStyle}">
                        ${['Siempre', 'Casi Siempre', 'A veces', 'Rara vez'].map(s => `<option value="${s}" ${s === (d.frequency || 'Siempre') ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Impacto</label>
                    <select id="hf-impact" style="${inputStyle}">
                        ${['', 'Bajo', 'Medio', 'Alto', 'Crítico'].map(s => `<option value="${s}" ${s === (d.business_impact || '') ? 'selected' : ''}>${s || '— Sin especificar —'}</option>`).join('')}
                    </select>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Asignado a</label>
                    <select id="hf-assigned" style="${inputStyle}">
                        <option value="">— Sin asignar —</option>
                        ${team.map(u => `<option value="${u.id}" ${u.id === d.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    renderCreateForm() {
        return `
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h2 style="margin:0; font-size:1rem; font-weight:700; color:var(--apple-label);">✏️ Nuevo Hallazgo</h2>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--apple-label-tertiary);">Completá los campos para registrar un nuevo hallazgo.</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-ghost btn-sm" id="hf-cancel" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.75rem;">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="hf-save" style="padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.75rem; font-weight: 600;">Crear Hallazgo</button>
                </div>
            </div>
            <div style="padding: 24px; overflow-y: auto;">
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📋 Datos del Hallazgo</span>
                    </div>
                    <div style="padding: 20px;">
                        ${this.renderFormFields({})}
                    </div>
                </div>
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📎 Evidencias</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <input type="file" id="hf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="hf-add-evidence" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.75rem;">📷 Agregar captura</button>
                            <select id="hf-evidence-category" style="padding: 6px 10px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.75rem;">
                                ${EVIDENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <span style="font-size:0.72rem; color:var(--apple-label-tertiary);" id="hf-evidence-count">0 archivos</span>
                        </div>
                        <div id="hf-evidence-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-top: 12px;"></div>
                    </div>
                </div>
            </div>
        `;
    },

    renderDetailForm(h) {
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const statusColor = STATUS_COLORS[h.status] || 'var(--apple-label-tertiary)';
        const statusBg = STATUS_BG[h.status] || 'var(--apple-fill)';
        const inputStyle = "padding:6px 10px; border-radius:var(--apple-radius-md); background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); color:var(--apple-label); font-size:0.78rem; outline:none;";
        const btnStyle = "padding:6px 12px; border-radius:var(--apple-radius-sm); font-size:0.72rem; font-weight:600; cursor:pointer;";

        return `
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <h2 style="margin:0; font-size:1rem; font-weight:700; color:var(--apple-label);">🔍 Hallazgo #${h.id}</h2>
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 0.62rem; font-weight: 600;">${h.status || 'OPEN'}</span>
                    ${h.jira_key ? `<a href="${UI.escapeHTML(h.jira_url || '#')}" target="_blank" style="color:var(--apple-blue); font-size:0.75rem; text-decoration:none; font-weight:500;">${h.jira_key} ↗</a>` : ''}
                    ${h.converted_to_tc ? `<span style="color:var(--apple-green); font-size:0.72rem; font-weight:500;">✅ TC#${h.converted_tc_id}</span>` : ''}
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-size:0.7rem; color:var(--apple-label-tertiary);">${new Date(h.created_at).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-sm" id="hf-cancel" style="${btnStyle}">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="hf-save" style="${btnStyle} background:var(--apple-blue); color:white; border:none;">Guardar Cambios</button>
                </div>
            </div>
            <div style="padding: 24px; overflow-y: auto;">
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📋 Datos del Hallazgo</span>
                    </div>
                    <div style="padding: 20px;">
                        ${this.renderFormFields(h)}
                    </div>
                </div>

                ${h.jira_key || h.status === 'DISMISSED' ? '' : `
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;" id="h-jira-section">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">🎯 Exportar a Jira</span>
                        <button class="btn btn-ghost btn-sm" id="h-toggle-jira" style="${btnStyle}">${h.jira_key ? 'Vinculado' : 'Expandir'}</button>
                    </div>
                    <div id="h-jira-body" style="display:none; padding: 20px;">
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="h-jira-epic" style="${inputStyle}"><option value="">Cargando...</option></select>
                            <select id="h-jira-assignee" style="${inputStyle}"><option value="">Cargando...</option></select>
                            <select id="h-jira-priority" style="${inputStyle}"><option value="">Cargando...</option></select>
                            <div id="h-jira-custom-fields"></div>
                            <button class="btn btn-primary" id="h-btn-create-jira" style="${btnStyle} width:100%; background:var(--apple-blue); color:white; border:none; padding:10px;">🚀 CREAR TICKET EN JIRA</button>
                            <div id="h-jira-success" style="display:none; padding:12px; background:var(--apple-green-soft); border-radius:var(--apple-radius-md); margin-top:8px;">
                                <span style="color:var(--apple-green); font-weight:600;">✅ Ticket creado:</span> <a href="#" id="h-jira-link" target="_blank" style="color:var(--apple-blue);"></a>
                            </div>
                        </div>
                    </div>
                </div>`}
                ${h.status === 'DISMISSED' ? `
                <div style="background: var(--apple-fill); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px; padding: 12px 16px;">
                    <span style="font-size: 0.75rem; color: var(--apple-label-secondary);">⚠️ Este bug está descartado y no se cuenta en las estadísticas. Reabrí para exportar a Jira.</span>
                </div>
                ` : ''}

                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">🔧 Acciones</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                            <select id="h-status-select" style="${inputStyle}">
                                ${STATUSES.map(s => `<option value="${s}" ${s === h.status ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="h-btn-update-status" style="${btnStyle} background:var(--apple-blue); color:white; border:none;">Actualizar Estado</button>

                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>

                            <select id="h-assign-select" style="${inputStyle}">
                                <option value="">Sin asignar</option>
                                ${(Store.state.team || []).map(u => `<option value="${u.id}" ${u.id === h.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="h-btn-assign" style="${btnStyle} background:var(--apple-fill); color:var(--apple-label); border:1px solid var(--apple-separator);">Asignar</button>

                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>

                            <button class="btn btn-sm" id="h-btn-dismiss" data-dismissed="${h.status === 'DISMISSED' ? '1' : '0'}" style="${btnStyle} background:${h.status === 'DISMISSED' ? 'var(--apple-green)' : 'var(--apple-red)'}; color:white; border:none; font-weight:700;">${h.status === 'DISMISSED' ? 'Reabrir bug' : 'Descartar bug'}</button>

                            ${!h.converted_to_tc ? `
                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>
                            <select id="h-suite-select" style="${inputStyle}">
                                <option value="">Suite para TC...</option>
                            </select>
                            <button class="btn btn-sm" id="h-btn-convert-tc" style="${btnStyle} background:var(--apple-green); color:white; border:none;">Crear TC</button>
                            ` : ''}

                            ${isAdmin ? `
                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>
                            <button class="btn btn-sm" id="h-btn-delete" style="${btnStyle} background:var(--apple-red); color:white; border:none;">🗑️ Eliminar</button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📎 Evidencias</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                            <input type="file" id="hf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="hf-add-evidence" style="${btnStyle}">📷 Agregar captura</button>
                            <select id="hf-evidence-category" style="${inputStyle}">
                                ${EVIDENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <span style="font-size:0.72rem; color:var(--apple-label-tertiary);" id="hf-evidence-count">0 archivos</span>
                        </div>
                        <div id="hf-evidence-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;">
                            <div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Cargando evidencias...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents(container) {
        const mainContent = container.querySelector('#h-main-content');
        const sidebarList = container.querySelector('#h-sidebar-list');
        const isBugs = this.subTab === 'bugs';

        const applyFilters = () => {
            this.filterSearch = container.querySelector('#h-search')?.value || '';
            this.filterStatus = container.querySelector('#h-filter-status')?.value || '';
            if (isBugs) {
                this.filterSeverity = container.querySelector('#h-filter-severity')?.value || '';
                this.filterCategory = '';
                this.filterPriority = '';
            } else {
                this.filterCategory = container.querySelector('#h-filter-category')?.value || '';
                this.filterPriority = '';
                this.filterSeverity = '';
            }
            const items = isBugs ? Store.state.hallazgos : Store.state.suggestions;
            const list = container.querySelector('#h-sidebar-list');
            if (list) {
                list.innerHTML = this.renderSidebarList(items);
                this.bindSidebarClicks(container);
            }
        };

        container.querySelector('#h-search')?.addEventListener('input', applyFilters);
        container.querySelector('#h-filter-status')?.addEventListener('change', applyFilters);
        if (isBugs) {
            container.querySelector('#h-filter-severity')?.addEventListener('change', applyFilters);
        } else {
            container.querySelector('#h-filter-category')?.addEventListener('change', applyFilters);
        }

        container.querySelector('#h-btn-new')?.addEventListener('click', () => {
            this.isCreating = true;
            this.selectedId = null;
            const mc = container.querySelector('#h-main-content');
            if (mc) {
                mc.innerHTML = isBugs ? this.renderCreateForm() : this.renderCreateSuggestionForm();
            }
            if (isBugs) {
                this.bindFormEvents(container, false);
            } else {
                this.bindSuggestionFormEvents(container, false, null);
            }
        });

        this.bindSubTabs(container);
        this.bindSidebarClicks(container);

        if (this.isCreating) {
            if (isBugs) this.bindFormEvents(container, false);
            else this.bindSuggestionFormEvents(container, false, null);
        } else if (this.selectedId) {
            const items = isBugs ? Store.state.hallazgos : Store.state.suggestions;
            const h = items.find(x => x.id === this.selectedId);
            if (h) {
                if (isBugs) {
                    this.bindFormEvents(container, true, h);
                    this.bindDetailActions(h, container);
                    if (!h.jira_key) this.initJiraIntegration(h, container);
                    if (!h.converted_to_tc) this.loadSuites(h, container);
                } else {
                    this.bindSuggestionFormEvents(container, true, h);
                    this.bindSuggestionDetailActions(h, container);
                }
                this.loadEvidence(h, container);
            }
        }
    },

    bindSidebarClicks(container) {
        container.querySelectorAll('.h-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                const isBugs = this.subTab === 'bugs';
                const items = isBugs ? Store.state.hallazgos : Store.state.suggestions;
                const h = items.find(x => x.id === id);
                if (!h) return;
                this.isCreating = false;
                this.selectedId = id;
                const mainContent = container.querySelector('#h-main-content');
                if (mainContent) {
                    if (isBugs) {
                        mainContent.innerHTML = this.renderDetailForm(h);
                        this.bindFormEvents(container, true, h);
                        this.bindDetailActions(h, container);
                        if (!h.jira_key) this.initJiraIntegration(h, container);
                        if (!h.converted_to_tc) this.loadSuites(h, container);
                    } else {
                        mainContent.innerHTML = this.renderSuggestionDetailForm(h);
                        this.bindSuggestionFormEvents(container, true, h);
                        this.bindSuggestionDetailActions(h, container);
                    }
                    this.loadEvidence(h, container);
                }
                const list = container.querySelector('#h-sidebar-list');
                if (list) {
                    list.innerHTML = this.renderSidebarList(items);
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

        container.querySelector('#h-btn-dismiss')?.addEventListener('click', async () => {
            const wasDismissed = h.status === 'DISMISSED';
            const next = !wasDismissed;
            try {
                const res = await ApiService.dismissDefect(h.id, next);
                if (res.ok) {
                    h.status = res.status;
                    UI.toast(next ? 'Bug descartado (no cuenta en estadísticas)' : 'Bug reabierto', 'ok');
                    // Re-render del detalle para reflejar el cambio de UI
                    const rightPane = container.querySelector('.h-right-pane') || container;
                    if (rightPane) rightPane.innerHTML = this.renderDetailForm(h);
                    this.bindDetailEvents(rightPane, h);
                }
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
                        <label style="font-size:0.65rem; color:var(--apple-label-secondary);">${UI.escapeHTML(field.name)}${field.required ? ' *' : ''}</label>`;
                    if (field.options?.length > 0) {
                        html += `<select id="h-cf-${field.fieldId}" style="width:100%; padding:8px; border-radius:var(--apple-radius-md); background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); color:var(--apple-label); font-size:0.8rem;">
                            <option value="">— Seleccionar —</option>${field.options.map(o => `<option value="${o.id}">${UI.escapeHTML(o.name)}</option>`).join('')}</select>`;
                    } else {
                        html += `<input type="text" id="h-cf-${field.fieldId}" style="width:100%; padding:8px; border-radius:var(--apple-radius-md); background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); color:var(--apple-label); font-size:0.8rem;">`;
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
        if (this.subTab === 'suggestions') {
            return this.loadSuggestionEvidence(h, container);
        }
        const grid = container.querySelector('#hf-evidence-grid');
        const countSpan = container.querySelector('#hf-evidence-count');
        if (!grid) return;
        try {
            const res = await fetch(`/api/hallazgos/${h.id}/evidence`);
            const data = await res.json();
            const items = data.evidence || [];
            if (items.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Sin evidencias adjuntas.</div>';
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
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Error cargando evidencias.</div>';
        }
    },

    async refreshAndSelect(container, hallazgoId) {
        try {
            const isBugs = this.subTab === 'bugs';
            if (isBugs) {
                const { hallazgos } = await ApiService.getHallazgos(Store.state.activeProjectId);
                Store.setHallazgos(hallazgos || []);
            } else {
                const { suggestions } = await ApiService.getSuggestions(Store.state.activeProjectId);
                Store.setSuggestions(suggestions || []);
            }
            this.selectedId = hallazgoId;
            this.isCreating = false;
            const mc = container.querySelector('#h-main-content');
            const list = container.querySelector('#h-sidebar-list');
            const items = isBugs ? Store.state.hallazgos : Store.state.suggestions;
            if (list) list.innerHTML = this.renderSidebarList(items);
            if (mc) mc.innerHTML = this.renderPlaceholder();
            this.bindSidebarClicks(container);
            this.bindSubTabs(container);
            if (hallazgoId) {
                const h = items.find(x => x.id === hallazgoId);
                if (h && mc) {
                    if (isBugs) {
                        mc.innerHTML = this.renderDetailForm(h);
                        this.bindFormEvents(container, true, h);
                        this.bindDetailActions(h, container);
                        if (!h.jira_key) this.initJiraIntegration(h, container);
                        if (!h.converted_to_tc) this.loadSuites(h, container);
                    } else {
                        mc.innerHTML = this.renderSuggestionDetailForm(h);
                        this.bindSuggestionFormEvents(container, true, h);
                        this.bindSuggestionDetailActions(h, container);
                    }
                    this.loadEvidence(h, container);
                }
            }
        } catch (err) {
            UI.toast('Error al refrescar', 'error');
        }
    },

    // ══════════════════════════════════════════════════════════════
    // ── SUGERENCIAS ──
    // ══════════════════════════════════════════════════════════════

    bindSubTabs(container) {
        container.querySelectorAll('.hallazgos-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.subtab;
                if (target === this.subTab) return;
                this.subTab = target;
                this.selectedId = null;
                this.isCreating = false;
                this.filterStatus = '';
                this.filterSeverity = '';
                this.filterCategory = '';
                this.filterPriority = '';
                this.filterSearch = '';
                this.render(container);
            });
        });
    },

    renderCreateSuggestionForm() {
        return `
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h2 style="margin:0; font-size:1rem; font-weight:700; color:var(--apple-label);">💡 Nueva Sugerencia</h2>
                    <p style="margin:4px 0 0; font-size:0.75rem; color:var(--apple-label-tertiary);">Documentá una oportunidad de mejora detectada durante el testing.</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-ghost btn-sm" id="sf-cancel" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.75rem;">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="sf-save" style="padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.75rem; font-weight: 600;">Crear Sugerencia</button>
                </div>
            </div>
            <div style="padding: 24px; overflow-y: auto;">
                ${this.renderSuggestionFormFields({})}
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-top: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📎 Evidencias</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                            <input type="file" id="sf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="sf-add-evidence" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.75rem;">📷 Agregar captura</button>
                            <span style="font-size:0.72rem; color:var(--apple-label-tertiary);" id="sf-evidence-count">0 archivos</span>
                        </div>
                        <div id="sf-evidence-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;">
                            <div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Las imágenes se subirán al guardar la sugerencia.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderSuggestionFormFields(d) {
        const team = Store.state.team || [];
        const inputStyle = "width:100%; padding:8px 12px; background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); border-radius:var(--apple-radius-md); color:var(--apple-label); font-size:0.85rem; outline:none; box-sizing:border-box; transition: border-color 0.15s;";
        const focusAttr = `onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'"`;
        return `
            <div style="display: grid; gap: 16px;">
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Título *</label>
                    <input type="text" id="sf-title" value="${UI.escapeHTML(d.title || '')}" placeholder="Resumen de la sugerencia..." style="${inputStyle}" ${focusAttr}>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="field-group">
                        <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Categoría *</label>
                        <select id="sf-category" style="${inputStyle}">
                            ${SUGGESTION_CATEGORIES.map(c => `<option value="${c}" ${c === (d.category || 'UX') ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Prioridad</label>
                        <select id="sf-priority" style="${inputStyle}">
                            ${SUGGESTION_PRIORITIES.map(p => `<option value="${p}" ${p === (d.priority || 'Media') ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Descripción del problema / oportunidad</label>
                    <textarea id="sf-description" placeholder="Contexto: qué se detectó, en qué flujo, con qué frecuencia..." style="${inputStyle} min-height:100px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.description || '')}</textarea>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Solución propuesta</label>
                    <textarea id="sf-solution" placeholder="Cómo podría resolverse o qué dirección tomar..." style="${inputStyle} min-height:90px; font-family:inherit; resize:vertical;" ${focusAttr}>${UI.escapeHTML(d.proposed_solution || '')}</textarea>
                </div>
                <div class="field-group">
                    <label style="display: block; font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary); margin-bottom: 6px;">Asignado a</label>
                    <select id="sf-assigned" style="${inputStyle}">
                        <option value="">— Sin asignar —</option>
                        ${team.map(u => `<option value="${u.id}" ${u.id === d.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    renderSuggestionDetailForm(s) {
        const isAdmin = Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA';
        const statusColor = SUGGESTION_STATUS_COLORS[s.status] || 'var(--apple-label-tertiary)';
        const statusBg = SUGGESTION_STATUS_BG[s.status] || 'var(--apple-fill)';
        const btnStyle = "padding:6px 12px; border-radius:var(--apple-radius-sm); font-size:0.72rem; font-weight:600; cursor:pointer;";
        const inputStyle = "padding:6px 10px; border-radius:var(--apple-radius-md); background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); color:var(--apple-label); font-size:0.78rem; outline:none;";

        return `
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <h2 style="margin:0; font-size:1rem; font-weight:700; color:var(--apple-label);">💡 Sugerencia #${s.id}</h2>
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 0.62rem; font-weight: 600;">${s.status || 'OPEN'}</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-size:0.7rem; color:var(--apple-label-tertiary);">${new Date(s.created_at).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-sm" id="sf-cancel" style="${btnStyle}">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="sf-save" style="${btnStyle} background:var(--apple-blue); color:white; border:none;">Guardar Cambios</button>
                </div>
            </div>
            <div style="padding: 24px; overflow-y: auto;">
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📋 Datos de la Sugerencia</span>
                    </div>
                    <div style="padding: 20px;">
                        ${this.renderSuggestionFormFields(s)}
                    </div>
                </div>

                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); margin-bottom: 16px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">🔧 Acciones</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                            <select id="sf-status-select" style="${inputStyle}">
                                ${SUGGESTION_STATUSES.map(st => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${st}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="sf-btn-update-status" style="${btnStyle} background:var(--apple-blue); color:white; border:none;">Actualizar Estado</button>

                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>

                            <select id="sf-assign-select" style="${inputStyle}">
                                <option value="">Sin asignar</option>
                                ${(Store.state.team || []).map(u => `<option value="${u.id}" ${u.id === s.assigned_to ? 'selected' : ''}>${UI.escapeHTML(u.name)}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm" id="sf-btn-assign" style="${btnStyle} background:var(--apple-fill); color:var(--apple-label); border:1px solid var(--apple-separator);">Asignar</button>

                            ${isAdmin ? `
                            <div style="width:1px; height:20px; background:var(--apple-separator);"></div>
                            <button class="btn btn-sm" id="sf-btn-delete" style="${btnStyle} background:var(--apple-red); color:white; border:none;">🗑️ Eliminar</button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-fill);">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--apple-label);">📎 Evidencias</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                            <input type="file" id="sf-evidence-input" accept="image/*" multiple style="display:none;">
                            <button class="btn btn-ghost btn-sm" id="sf-add-evidence" style="${btnStyle}">📷 Agregar captura</button>
                            <span style="font-size:0.72rem; color:var(--apple-label-tertiary);" id="sf-evidence-count">0 archivos</span>
                        </div>
                        <div id="sf-evidence-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;">
                            <div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Cargando evidencias...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindSuggestionFormEvents(container, isEdit, s) {
        const cancelBtn = container.querySelector('#sf-cancel');
        const saveBtn = container.querySelector('#sf-save');

        cancelBtn?.addEventListener('click', () => {
            this.isCreating = false;
            this._pendingSuggestionFiles = [];
            const mc = container.querySelector('#h-main-content');
            if (mc) mc.innerHTML = this.renderPlaceholder();
        });

        // Vincular subida de imágenes (en el form de creación o de edición)
        if (!isEdit) {
            this.bindSuggestionEvidenceEvents(null, container);
        }

        saveBtn?.addEventListener('click', async () => {
            const assignedRaw = container.querySelector('#sf-assigned')?.value || '';
            const data = {
                title: container.querySelector('#sf-title')?.value?.trim() || '',
                category: container.querySelector('#sf-category')?.value || 'UX',
                priority: container.querySelector('#sf-priority')?.value || 'Media',
                description: container.querySelector('#sf-description')?.value?.trim() || '',
                proposed_solution: container.querySelector('#sf-solution')?.value?.trim() || '',
                assigned_to: assignedRaw ? parseInt(assignedRaw, 10) : null
            };
            if (!data.title) return UI.toast('El título es requerido', 'error');

            UI.showLoading();
            try {
                let id;
                if (isEdit && s) {
                    await ApiService.updateSuggestion(s.id, data);
                    id = s.id;
                    UI.toast('✅ Sugerencia actualizada');
                } else {
                    const res = await ApiService.createSuggestion({ ...data, project_id: Store.state.activeProjectId });
                    id = res.id;
                    UI.toast('💡 Sugerencia creada');
                }
                this._pendingSuggestionFiles = this._pendingSuggestionFiles || [];
                if (this._pendingSuggestionFiles.length > 0) {
                    await this.uploadPendingSuggestionEvidence(id, this._pendingSuggestionFiles);
                    this._pendingSuggestionFiles = [];
                }
                await this.refreshAndSelect(container, id);
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },

    bindSuggestionDetailActions(s, container) {
        container.querySelector('#sf-btn-update-status')?.addEventListener('click', async () => {
            const status = container.querySelector('#sf-status-select')?.value;
            UI.showLoading();
            try {
                await ApiService.updateSuggestionStatus(s.id, status);
                UI.toast('Estado actualizado');
                await this.refreshAndSelect(container, s.id);
            } catch (err) { UI.toast(err.message, 'error'); }
            UI.hideLoading();
        });

        container.querySelector('#sf-btn-assign')?.addEventListener('click', async () => {
            const userId = container.querySelector('#sf-assign-select')?.value || null;
            UI.showLoading();
            try {
                await ApiService.assignSuggestion(s.id, userId);
                UI.toast('Asignación actualizada');
                await this.refreshAndSelect(container, s.id);
            } catch (err) { UI.toast(err.message, 'error'); }
            UI.hideLoading();
        });

        container.querySelector('#sf-btn-delete')?.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta sugerencia?')) return;
            UI.showLoading();
            try {
                await ApiService.deleteSuggestion(s.id);
                UI.toast('Sugerencia eliminada');
                this.selectedId = null;
                await this.refreshAndSelect(container, null);
            } catch (err) { UI.toast(err.message, 'error'); }
            UI.hideLoading();
        });

        this.bindSuggestionEvidenceEvents(s, container);
    },

    bindSuggestionEvidenceEvents(s, container) {
        const input = container.querySelector('#sf-evidence-input');
        const addBtn = container.querySelector('#sf-add-evidence');
        if (!input || !addBtn) return;

        addBtn.onclick = () => input.click();
        input.onchange = async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            this._pendingSuggestionFiles = this._pendingSuggestionFiles || [];
            this._pendingSuggestionFiles.push(...files);
            UI.toast(`📎 ${files.length} imagen(es) lista(s) para subir al guardar`);
            this.renderPendingSuggestionEvidence(container);
            e.target.value = '';
        };
    },

    renderPendingSuggestionEvidence(container) {
        const grid = container.querySelector('#sf-evidence-grid');
        const countSpan = container.querySelector('#sf-evidence-count');
        if (!grid) return;
        const pending = this._pendingSuggestionFiles || [];
        const baseCount = parseInt(countSpan?.textContent || '0') || 0;
        const total = baseCount + pending.length;
        if (countSpan) countSpan.textContent = `${total} archivo(s) (${pending.length} pendiente(s))`;
        const pendingHtml = pending.map((f, i) => `
            <div class="sf-evidence-item" data-pending="${i}" style="position: relative; aspect-ratio: 1; border-radius: var(--apple-radius-md); overflow: hidden; border: 1px dashed var(--apple-blue); background: var(--apple-blue-soft); display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: var(--apple-blue); text-align: center; padding: 4px;">
                ⏳ ${UI.escapeHTML(f.name)}
            </div>
        `).join('');
        const existing = grid.innerHTML;
        if (existing.includes('grid-column:1/-1; text-align:center;')) {
            grid.innerHTML = pendingHtml;
        } else {
            grid.insertAdjacentHTML('beforeend', pendingHtml);
        }
    },

    async uploadPendingSuggestionEvidence(suggestionId, files) {
        for (const file of files) {
            const fd = new FormData();
            fd.append('evidence', file);
            fd.append('suggestion_id', suggestionId);
            fd.append('category', 'GENERAL');
            try {
                await fetch('/api/evidence', { method: 'POST', body: fd });
            } catch (e) {
                console.warn('Error subiendo evidencia:', e);
            }
        }
    },

    async loadSuggestionEvidence(s, container) {
        const grid = container.querySelector('#sf-evidence-grid');
        const countSpan = container.querySelector('#sf-evidence-count');
        if (!grid) return;
        try {
            const res = await fetch(`/api/suggestions/${s.id}/evidence`);
            const data = await res.json();
            const items = data.evidence || [];
            if (items.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Sin evidencias adjuntas.</div>';
                if (countSpan) countSpan.textContent = '0 archivos';
                return;
            }
            grid.innerHTML = items.map(ev => `
                <div class="sf-evidence-item" data-id="${ev.id}" style="position: relative; aspect-ratio: 1; border-radius: var(--apple-radius-md); overflow: hidden; border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary);">
                    <img src="/api/evidence/${ev.id}" alt="${UI.escapeHTML(ev.file_name)}" loading="lazy" style="width:100%; height:100%; object-fit: cover;">
                    <button class="sf-evidence-remove" data-id="${ev.id}" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
                </div>
            `).join('');
            if (countSpan) countSpan.textContent = `${items.length} archivo(s)`;
            grid.querySelectorAll('.sf-evidence-remove').forEach(btn => {
                btn.onclick = async () => {
                    await fetch(`/api/evidence/${btn.dataset.id}`, { method: 'DELETE' });
                    this.loadSuggestionEvidence(s, container);
                };
            });
        } catch (err) {
            grid.innerHTML = `<div style="color: var(--apple-red);">Error: ${UI.escapeHTML(err.message)}</div>`;
        }
    },

    _isListening: false,
    setupRealtimeListener() {
        if (this._isListening) return;
        window.addEventListener('realtime-refresh', async () => {
            this.loadedProjectId = null;
            this.selectedId = null;
            this.isCreating = false;
            invalidateTabCache('hallazgos', Store.state.activeProjectId);
            const container = document.getElementById('tab-content');
            if (Store.state.activeTab === 'hallazgos' && container) {
                await this.render(container);
            }
        });
        this._isListening = true;
    }
};
