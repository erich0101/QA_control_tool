import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { modalManager } from '../utils/modal-manager.js';

/**
 * MODALS.JS - Sistema de modales reutilizable.
 * Types: 'new-project', 'new-us', 'new-suite', 'confirm', 'gemini'
 */
export const Modals = {
    render(type, options = {}) {
        // Eliminar cualquier diálogo anterior
        const oldDialog = document.querySelector('dialog.modal-native');
        if (oldDialog) oldDialog.remove();

        const dialog = document.createElement('dialog');
        dialog.className = 'modal-native';
        
        let content = '';
        let width = '420px';

        switch (type) {
            case 'new-project': content = this.getNewProjectContent(); break;
            case 'new-use-case': content = this.getNewUseCaseContent(); break;
            case 'new-us': content = this.getNewUSContent(); break;
            case 'new-suite': content = this.getNewSuiteContent(); break;
            case 'edit-suite': content = this.getEditSuiteContent(options); break;
            case 'confirm': content = this.getConfirmContent(options); break;
            case 'alert': content = this.getAlertContent(options); break;
            case 'prompt': content = this.getPromptContent(options); break;
            case 'start-run-wizard': content = this.getStartRunWizardContent(options); width = '500px'; break;
            case 'new-bug': content = this.getNewBugContent(options); width = '500px'; break;
            case 'view-bugs': content = this.getViewBugsContent(options); width = '900px'; break;
            case 'jira-config': content = this.getJiraConfigContent(options); width = '500px'; break;
            case 'jira-user-config': content = this.getJiraUserConfigContent(options); width = '500px'; break;
            case 'gemini': content = this.getGeminiContent(); width = '600px'; break;
            case 'user-admin': content = this.getNewUserContent(options); width = '600px'; break;
            case 'bug-details-pro': content = this.getBugDetailsProContent(options); width = '800px'; break;
            case 'evidence-upload': content = this.getEvidenceUploadContent(options); width = '450px'; break;
            case 'import-dual': content = this.getImportDualContent(options); width = '450px'; break;
            case 'batch-jira-tickets': content = this.getBatchJiraTicketsContent(options); width = '720px'; break;
            // Hallazgos ahora usan master-detail inline — estos casos se eliminaron
        }

        dialog.innerHTML = `
            <div class="modal-content" style="width: ${width}; max-height: 90vh; overflow-y: auto; padding: 32px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: var(--shadow-md); color: var(--text-main);">
                ${content}
            </div>
        `;

        document.body.appendChild(dialog);
        dialog.showModal();

        // Estilos para el backdrop nativo
        const style = document.createElement('style');
        style.id = 'modal-native-styles';
        style.innerHTML = `
            .modal-native {
                border: none;
                background: transparent;
                padding: 0;
                overflow: visible;
                margin: auto;
            }
            .modal-native::backdrop {
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(20px) saturate(180%);
            }
        `;
        if (!document.getElementById('modal-native-styles')) {
            document.head.appendChild(style);
        }
        
        if (type === 'new-bug') {
            this.bindBugEvents(dialog, options);
        } else if (type === 'view-bugs') {
            this.bindViewBugsEvents(dialog, options);
        } else if (type === 'jira-config') {
            this.bindJiraConfigEvents(dialog.querySelector('.modal-content'), options);
        } else if (type === 'jira-user-config') {
            this.bindJiraUserConfigEvents(dialog.querySelector('.modal-content'), options);
        } else if (type === 'user-admin') {
            this.bindUserAdminEvents(dialog, options);
        } else if (type === 'edit-suite') {
            this.bindEditSuiteEvents(dialog, options);
        } else if (type === 'evidence-upload') {
            this.bindEvidenceUploadEvents(dialog, options);
        } else if (type === 'import-dual') {
            this.bindImportDualEvents(dialog, options);
        } else if (type === 'batch-jira-tickets') {
            this.bindBatchJiraTicketsEvents(dialog, options);
        } else if (false) { // Hallazgos ahora usan master-detail inline
        } else {
            const content = dialog.querySelector('.modal-content');
            this.bindEvents(content, type, options);
        }
    },

    getNewProjectContent() {
        return `
            <h3 style="margin-bottom: 8px;">Nuevo Proyecto</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">Configura tu nuevo proyecto de QA.</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div class="field-group">
                    <label class="field-label">Nombre del Proyecto</label>
                    <input type="text" id="modal-proj-name" placeholder="Ej: Portal Bancario V3">
                </div>
                <div class="field-group">
                    <label class="field-label">Descripción</label>
                    <textarea id="modal-proj-desc" placeholder="Descripción breve..." style="min-height: 80px;"></textarea>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-save">Crear Proyecto</button>
            </div>
        `;
    },

    getNewUseCaseContent() {
        return `
            <h3 style="margin-bottom: 8px;">Nuevo Caso de Uso</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">Agrega un Caso de Uso al proyecto.</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="field-group">
                        <label class="field-label">Key ID</label>
                        <input type="text" id="modal-cu-key" placeholder="Ej: CU-001 (auto si vacío)">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Título</label>
                        <input type="text" id="modal-cu-title" placeholder="Ej: Gestión de Usuarios">
                    </div>
                </div>
                <div class="field-group">
                    <label class="field-label">Descripción</label>
                    <textarea id="modal-cu-desc" placeholder="Descripción del caso de uso..." style="min-height: 80px;"></textarea>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-save">Crear Caso de Uso</button>
            </div>
        `;
    },

    getNewUSContent() {
        return `
            <h3 style="margin-bottom: 8px;">Nueva Historia de Usuario</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">Agrega una HU al Caso de Uso seleccionado.</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
<div class="field-group">
                    <label class="field-label">Key ID</label>
                    <input type="text" id="modal-us-key" placeholder="Ej: US-101 (auto si vacío)">
                </div>
                <div class="field-group">
                    <label class="field-label">Epic</label>
                    <input type="text" id="modal-us-epic" placeholder="Ej: Autenticación">
                </div>
                <div class="field-group">
                    <label class="field-label">Título</label>
                    <input type="text" id="modal-us-title" placeholder="Ej: Login con Google SSO">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="field-group">
                        <label class="field-label">Estado</label>
                        <select id="modal-us-status">
                            <option value="En Análisis" selected>En Análisis</option>
                            <option value="Finalizada">Finalizada</option>
                            <option value="Deprecada">Deprecada</option>
                            <option value="Rechazada">Rechazada</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Prioridad</label>
                        <select id="modal-us-priority">
                            <option value="Baja">Baja</option>
                            <option value="Media" selected>Media</option>
                            <option value="Alta">Alta</option>
                        </select>
                    </div>
                </div>
                <div class="field-group">
                    <label class="field-label">Análisis de Inconsistencias</label>
                    <textarea id="modal-us-detail" placeholder="Como [rol], quiero [acción], para [valor]..." style="min-height: 100px;"></textarea>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-save">Crear HU</button>
            </div>
        `;
    },

    getNewSuiteContent() {
        return `
            <h3 style="margin-bottom: 8px;">Nueva Test Suite</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">Agrupa Test Cases relacionados.</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div class="field-group">
                    <label class="field-label">Título de la Suite</label>
                    <input type="text" id="modal-suite-title" placeholder="Ej: Validaciones de Login">
                </div>
                <div class="field-group">
                    <label class="field-label">Vincular a Épica Jira</label>
                    <select id="modal-suite-epic">
                        <option value="">— Cargando épicas de Jira... —</option>
                    </select>
                    <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Selecciona la épica para pre-configurar los bugs detectados.</p>
                </div>
                <div class="field-group">
                    <label class="field-label">Descripción</label>
                    <textarea id="modal-suite-desc" placeholder="Descripción de las pruebas..." style="min-height: 80px;"></textarea>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-save">Crear Suite</button>
            </div>
        `;
    },

getStartRunWizardContent({ suite, suites, cuTitle }) {
        const isBulk = Array.isArray(suites) && suites.length > 0;
        const suiteList = isBulk ? suites : [suite];
        const titleText = isBulk ? cuTitle : suite?.title || '';

        return `
            <h3 style="margin-bottom: 8px;">🚀 ${isBulk ? 'Ejecución Masiva' : 'Configurar Ejecución Inteligente'}</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">${isBulk ? `Caso de Uso: <strong>${UI.escapeHTML(titleText)}</strong>` : `Suite: <strong>${UI.escapeHTML(titleText)}</strong>`}</p>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                ${!isBulk ? `
                <div class="field-group">
                    <label class="field-label">Tipo de Ejecución</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <button class="btn btn-ghost exec-type-btn" data-type="SMOKE" style="font-size: 0.65rem; padding: 10px 4px; flex-direction: column; gap: 4px;">
                            <span style="font-size: 1rem;">💨</span>
                            <span>Smoke</span>
                        </button>
                        <button class="btn btn-ghost exec-type-btn active" data-type="REGRESSION" style="font-size: 0.65rem; padding: 10px 4px; flex-direction: column; gap: 4px;">
                            <span style="font-size: 1rem;">🔄</span>
                            <span>Regresión</span>
                        </button>
                        <button class="btn btn-ghost exec-type-btn" data-type="INTEGRATION" style="font-size: 0.65rem; padding: 10px 4px; flex-direction: column; gap: 4px;">
                            <span style="font-size: 1rem;">🔗</span>
                            <span>Integración</span>
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button class="btn btn-ghost exec-type-btn" data-type="EXPLORATORY" style="font-size: 0.65rem; padding: 10px 4px; flex-direction: column; gap: 4px;">
                            <span style="font-size: 1rem;">🔍</span>
                            <span>Exploratoria</span>
                        </button>
                        <button class="btn btn-ghost exec-type-btn" data-type="CUSTOM" style="font-size: 0.65rem; padding: 10px 4px; flex-direction: column; gap: 4px;">
                            <span style="font-size: 1rem;">🛠️</span>
                            <span>Personalizada</span>
                        </button>
                    </div>
                </div>

                <div id="custom-filters-area" style="display: none; background: var(--apple-fill-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-lg); padding: 16px;">
                    <span class="field-label" style="display: block; margin-bottom: 12px; color: var(--brand);">Filtros Personalizados</span>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="field-group">
                            <label class="field-label">Prioridad</label>
                            <select id="filter-priority">
                                <option value="">Cualquiera</option>
                                <option value="Alta">Alta</option>
                                <option value="Media">Media</option>
                                <option value="Baja">Baja</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Módulo / Feature</label>
                            <input type="text" id="filter-module" placeholder="Ej: Login">
                        </div>
                    </div>

                    <div style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; cursor: pointer;">
                            <div class="switch" style="width: 24px; height: 14px;">
                                <input type="checkbox" id="filter-smoke">
                                <span class="slider" style="border-radius: 10px;"></span>
                                <style>#custom-filters-area .slider:before { height: 10px; width: 10px; left: 1px; bottom: 1px; } #custom-filters-area input:checked + .slider:before { transform: translateX(11px); }</style>
                            </div>
                            Smoke
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; cursor: pointer;">
                            <div class="switch" style="width: 24px; height: 14px;">
                                <input type="checkbox" id="filter-regression" checked>
                                <span class="slider" style="border-radius: 10px;"></span>
                                <style>#custom-filters-area .slider:before { height: 10px; width: 10px; left: 1px; bottom: 1px; } #custom-filters-area input:checked + .slider:before { transform: translateX(11px); }</style>
                            </div>
                            Regresión
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; cursor: pointer;">
                            <div class="switch" style="width: 24px; height: 14px;">
                                <input type="checkbox" id="filter-integration">
                                <span class="slider" style="border-radius: 10px;"></span>
                                <style>#custom-filters-area .slider:before { height: 10px; width: 10px; left: 1px; bottom: 1px; } #custom-filters-area input:checked + .slider:before { transform: translateX(11px); }</style>
                            </div>
                            Integración
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; cursor: pointer;">
                            <div class="switch" style="width: 24px; height: 14px;">
                                <input type="checkbox" id="filter-exploratory">
                                <span class="slider" style="border-radius: 10px;"></span>
                                <style>#custom-filters-area .slider:before { height: 10px; width: 10px; left: 1px; bottom: 1px; } #custom-filters-area input:checked + .slider:before { transform: translateX(11px); }</style>
                            </div>
                            Exploratoria
                        </label>
                    </div>
                </div>
                ` : `
                <div style="background: var(--apple-indigo-soft); border: 1px solid var(--apple-indigo-soft); border-radius: var(--apple-radius-lg); padding: 16px; margin-bottom: 8px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--brand); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">📁 Suites a ejecutar (${suiteList.length})</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${suiteList.map(s => `
                            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-main);">
                                <span style="color: var(--brand); font-weight: 700;">→</span>
                                <span style="flex: 1;">${UI.escapeHTML(s.title)}</span>
                                <span style="font-size: 0.7rem; color: var(--text-muted);">${(s.test_cases || []).filter(t => t.is_regression).length} tests</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                `}

                <div class="field-group" style="background: var(--apple-green-soft); border: 1px solid var(--apple-green-soft); border-radius: var(--apple-radius-lg); padding: 14px; text-align: center;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--ok); text-transform: uppercase; letter-spacing: 0.05em;">Tests a ejecutar</span>
                    <div style="font-size: 2rem; font-weight: 900; color: var(--ok); margin-top: 4px;"><span id="preview-count">${isBulk ? suiteList.reduce((acc, s) => acc + (s.test_cases || []).filter(t => t.is_regression).length, 0) : (suite?.test_cases || []).filter(t => t.is_regression).length}</span></div>
                </div>

                <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <button class="btn btn-primary" style="flex: 1;" id="modal-run-start">▶ Iniciar Ejecución</button>
                    <button class="btn btn-ghost" id="modal-run-cancel">Cancelar</button>
                </div>
            </div>
        `;
    },

    getConfirmContent({ title, msg }) {
        return `
            <h3 style="margin-bottom: 8px;">${UI.escapeHTML(title)}</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">${UI.escapeHTML(msg)}</p>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" style="background: var(--fail); border-color: var(--fail);" id="modal-confirm-btn">Confirmar</button>
            </div>
        `;
    },

    getAlertContent({ title, msg }) {
        return `
            <h3 style="margin-bottom: 8px;">${UI.escapeHTML(title || 'Aviso')}</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">${UI.escapeHTML(msg)}</p>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-primary" id="modal-cancel" style="padding-left: 32px; padding-right: 32px;">Entendido</button>
            </div>
        `;
    },

    getPromptContent({ title, msg, value, placeholder }) {
        return `
            <h3 style="margin-bottom: 8px;">${UI.escapeHTML(title)}</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 20px;">${UI.escapeHTML(msg)}</p>
            <div class="field-group">
                <input type="text" id="modal-prompt-input" value="${UI.escapeHTML(value || '')}" placeholder="${UI.escapeHTML(placeholder || '')}" autofocus style="width: 100%;">
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-prompt-save">Guardar Cambios</button>
            </div>
        `;
    },

    getGeminiContent() {
        return `
            <h3 style="margin-bottom: 8px;">🧙 AI Wizard</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 20px;">Funcionalidad de AI próximamente.</p>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="btn btn-ghost" id="modal-cancel">Cerrar</button>
            </div>
        `;
    },

    getNewBugContent(options) {
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🐞</div>
                <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Reportar Defecto</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Registra un nuevo bug para el Test Case actual.</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label">Título del Bug</label>
                    <input type="text" id="bug-title" placeholder="Resumen corto del error..." value="${UI.escapeHTML(options.defaultTitle || '')}" style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main);">
                </div>
                <div class="field-group">
                    <label class="field-label">Pasos para reproducir</label>
                    <textarea id="bug-desc" placeholder="1. Ir a...\n2. Observar..." style="width: 100%; min-height: 120px; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main); font-family: inherit;">${UI.escapeHTML(options.defaultDesc || '')}</textarea>
                </div>
                <div class="field-group">
                    <label class="field-label">Severidad</label>
                    <select id="bug-severity" class="st-select" style="width: 100%; padding: 12px;">
                        <option value="Baja">Baja</option>
                        <option value="Media" selected>Media</option>
                        <option value="Alta">Alta</option>
                        <option value="Crítica">Crítica</option>
                    </select>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button class="btn btn-ghost btn-sm" id="cancel-bug" style="flex: 1;">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="save-bug" style="flex: 2; background: var(--fail);">Guardar Bug</button>
                </div>
            </div>
        `;
    },

    bindBugEvents(overlay, options) {
        const close = () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('#cancel-bug').addEventListener('click', close);

        // Auto-resize textareas
        overlay.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });
        
        overlay.querySelector('#save-bug').addEventListener('click', async () => {
            const title = overlay.querySelector('#bug-title').value;
            const desc = overlay.querySelector('#bug-desc').value;
            const severity = overlay.querySelector('#bug-severity').value;
            
            // Buscar épica de la suite si existe
            const suite = Store.state.testSuites.find(s => s.id === options.suiteId);
            const epicId = suite?.jira_epic_key || null;

            if (!title) {
                UI.toast('El título es requerido', 'error');
                return;
            }

            UI.showLoading();
            try {
                const res = await ApiService.createDefect({
                    execution_id: options.executionId,
                    title,
                    description: desc,
                    severity
                });
                if (res.ok) {
                    UI.toast('🐞 Bug reportado localmente');
                    
                    // Si hay épica pre-configurada, podríamos intentar crear el ticket Jira de una vez
                    // Pero por seguridad lo dejamos para que el usuario lo haga desde el botón de Jira
                    // para elegir el asignado. No obstante, ya guardamos la relación.
                    
                    close();
                    if (options.onSuccess) options.onSuccess();
                }
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },

    getEditSuiteContent({ suite }) {
        return `
            <h3 style="margin-bottom: 8px;">Editar Test Suite</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px;">Modifica los detalles de la suite.</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div class="field-group">
                    <label class="field-label">Título de la Suite</label>
                    <input type="text" id="edit-suite-title" value="${UI.escapeHTML(suite.title)}" placeholder="Ej: Validaciones de Login">
                </div>
                <div class="field-group">
                    <label class="field-label">Épica Jira</label>
                    <select id="edit-suite-epic">
                        <option value="">— Cargando épicas... —</option>
                    </select>
                </div>
                <div class="field-group">
                    <label class="field-label">Descripción</label>
                    <textarea id="edit-suite-desc" placeholder="Descripción de las pruebas..." style="min-height: 80px;">${UI.escapeHTML(suite.description || '')}</textarea>
                </div>
                <div class="field-group" style="border-top: 1px solid var(--border); padding-top: 12px;">
                    <label class="field-label">Mover a Caso de Uso</label>
                    <select id="edit-suite-move-cu">
                        <option value="">— CU actual: cargando... —</option>
                    </select>
                    <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Solo suites sin HU vinculadas y sin ejecución activa pueden moverse.</p>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-edit-save">Guardar Cambios</button>
            </div>
        `;
    },

    bindEditSuiteEvents(overlay, { suite }) {
        const epicSelect = overlay.querySelector('#edit-suite-epic');
        const moveCuSelect = overlay.querySelector('#edit-suite-move-cu');
        const close = () => { overlay.close(); overlay.remove(); };
        overlay.querySelector('#modal-cancel').onclick = close;

        (async () => {
            try {
                const ctx = await ApiService.getJiraContext(Store.state.activeProjectId);
                if (ctx?.error) {
                    if (ctx.error.includes('token')) {
                        UI.toast('🔑 Configura tu token de Jira para ver las épicas', 'warn');
                        epicSelect.innerHTML = '<option value="">— Configura tu token —</option>';
                    } else {
                        epicSelect.innerHTML = '<option value="">' + ctx.error + '</option>';
                    }
                } else if (ctx && ctx.epics) {
                    epicSelect.innerHTML = '<option value="">— Sin Épica —</option>' + 
                        ctx.epics.map(e => `<option value="${e.key}" ${e.key === suite.jira_epic_key ? 'selected' : ''}>${e.key} - ${e.name}</option>`).join('');
                }
            } catch (e) { epicSelect.innerHTML = '<option value="">Error al cargar</option>'; }
        })();

        (async () => {
            try {
                const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
                const currentCU = useCases?.find(cu => cu.id === suite.use_case_id);
                moveCuSelect.innerHTML = `<option value="">— CU actual: ${currentCU ? UI.escapeHTML(currentCU.key_id + ' - ' + currentCU.title) : 'N/A'} —</option>` +
                    (useCases || []).filter(cu => cu.id !== suite.use_case_id).map(cu =>
                        `<option value="${cu.id}">${UI.escapeHTML(cu.key_id)} - ${UI.escapeHTML(cu.title)}</option>`
                    ).join('');
            } catch (e) { moveCuSelect.innerHTML = '<option value="">Error al cargar CU</option>'; }
        })();

        overlay.querySelector('#modal-edit-save').onclick = async () => {
            const title = overlay.querySelector('#edit-suite-title').value.trim();
            const jira_epic_key = epicSelect.value;
            const description = overlay.querySelector('#edit-suite-desc').value;
            const newCuId = parseInt(moveCuSelect.value) || null;

            UI.showLoading();
            try {
                await ApiService.updateTestSuite(suite.id, { title, description, jira_epic_key });

                if (newCuId && newCuId !== suite.use_case_id) {
                    overlay.close(); // Cerrar dialog de edición para que el confirm sea visible
                    const confirmed = await modalManager.confirm(
                        `Mover la suite "${title}" al Caso de Uso seleccionado?`,
                        'Confirmar movimiento de Suite'
                    );
                    if (confirmed) {
                        await ApiService.moveTestSuite(suite.id, newCuId);
                    }
                }

                const { testSuites } = await ApiService.getTestSuites(Store.state.selectedUseCaseId);
                Store.setTestSuites(testSuites || []);
                UI.hideLoading();
                close();
                UI.toast("Suite actualizada");
                window.dispatchEvent(new Event('realtime-refresh'));
            } catch (err) {
                UI.hideLoading();
                UI.toast(err.message, 'error');
            }
        };
    },

    getViewBugsContent(options) {
        const { bugs = [] } = options;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 2rem;">🐛</span>
                    <div>
                        <h2 style="font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin: 0;">Defectos del Ciclo #${options.runId}</h2>
                        <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">${bugs.length} bugs encontrados en esta ejecución.</p>
                    </div>
                </div>
                <button class="btn btn-ghost btn-sm" id="close-bugs-modal" style="border-radius: 50%; width: 32px; height: 32px; padding: 0;">✕</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px; max-height: 60vh; overflow-y: auto; padding-right: 8px;">
                ${bugs.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <div style="font-size: 3rem; margin-bottom: 16px;">🎉</div>
                        <p>No se encontraron bugs registrados en este ciclo.</p>
                    </div>
                ` : bugs.map(bug => `
                    <div style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-lg); overflow: hidden; display: flex; flex-direction: column;">
                        <div style="padding: 16px; background: var(--apple-red-soft); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--apple-separator);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="background: var(--apple-red); color: white; padding: 4px 8px; border-radius: var(--apple-radius-sm); font-size: 0.7rem; font-weight: 800;">BUG #${bug.id}</span>
                                <span style="font-weight: 700; color: var(--apple-label);">${UI.escapeHTML(bug.title)}</span>
                            </div>
                            <span class="status-pill ${bug.status === 'FIXED' ? 'ok' : 'warn'}" style="font-size: 0.65rem;">${UI.escapeHTML(bug.status)}</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 1px; background: var(--apple-separator);">
                            <div style="background: var(--apple-bg-elevated); padding: 16px;">
                                <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Contexto del Test</div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: var(--apple-blue);">${UI.escapeHTML(bug.tc_title)}</div>
                                <div style="font-size: 0.75rem; color: var(--apple-label-secondary); margin-top: 4px;">Asignado a: ${UI.escapeHTML(bug.tester_name || 'Desconocido')}</div>
                                <div style="margin-top: 12px; font-size: 0.7rem; display: flex; gap: 8px;">
                                    <span style="color: var(--apple-red); font-weight: 800;">${UI.escapeHTML(bug.severity)}</span>
                                    <span style="color: var(--apple-label-tertiary);">•</span>
                                    <span style="color: var(--apple-label-tertiary);">${new Date(bug.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div style="background: var(--apple-bg-elevated); padding: 16px; border-left: 1px solid var(--apple-separator);">
                                <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Descripción y Detalles</div>
                                <div style="font-size: 0.85rem; color: var(--apple-label); line-height: 1.5; white-space: pre-wrap;">${UI.escapeHTML(bug.description || 'Sin descripción adicional.')}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" id="btn-close-bugs-footer" style="padding: 12px 32px;">Entendido</button>
            </div>
        `;
    },

    bindViewBugsEvents(overlay, options) {
        const close = () => {
            overlay.close();
            overlay.remove();
        };
        overlay.querySelector('#close-bugs-modal').addEventListener('click', close);
        overlay.querySelector('#btn-close-bugs-footer').addEventListener('click', close);
    },

    bindEvents(overlay, type, options) {
        const close = () => {
            const dialog = overlay.closest('dialog');
            dialog?.close();
            dialog?.remove();
        };

        overlay.querySelector('#modal-cancel')?.addEventListener('click', close);

        // Auto-resize textareas
        overlay.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });

        if (type === 'new-project') {
            overlay.querySelector('#modal-save')?.addEventListener('click', async () => {
                const name = overlay.querySelector('#modal-proj-name').value.trim();
                if (!name) return UI.toast("El nombre es obligatorio", "error");
                
                UI.showLoading();
                await ApiService.createProject({ name, description: overlay.querySelector('#modal-proj-desc').value });
                const { projects } = await ApiService.getProjects();
                Store.setProjects(projects || []);
                // Select the new project
                const newProj = projects?.find(p => p.name === name);
                if (newProj) {
                    Store.setActiveProject(newProj.id);
                    const { useCases } = await ApiService.getUseCases(newProj.id);
                    Store.setUseCases(useCases || []);
                }
                UI.hideLoading();
                close();
                UI.toast("Proyecto creado");
            });
        }

        if (type === 'new-use-case') {
            overlay.querySelector('#modal-save')?.addEventListener('click', async () => {
                const title = overlay.querySelector('#modal-cu-title').value.trim();
                if (!title) return UI.toast("El título es obligatorio", "error");
                
                UI.showLoading();
                await ApiService.createUseCase({
                    project_id: Store.state.activeProjectId,
                    key_id: overlay.querySelector('#modal-cu-key').value.trim() || undefined,
                    title,
                    description: overlay.querySelector('#modal-cu-desc').value
                });
                const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
                Store.setUseCases(useCases || []);
                UI.hideLoading();
                close();
                UI.toast("Caso de Uso creado");
            });
        }

        if (type === 'new-us') {
            overlay.querySelector('#modal-save')?.addEventListener('click', async () => {
                const title = overlay.querySelector('#modal-us-title').value.trim();
                if (!title) return UI.toast("El título es obligatorio", "error");
                
                UI.showLoading();
                await ApiService.createUserStory({
                    use_case_id: Store.state.selectedUseCaseId,
                    key_id: overlay.querySelector('#modal-us-key').value.trim() || undefined,
                    title,
                    epic: overlay.querySelector('#modal-us-epic').value.trim(),
                    hu_detallada: overlay.querySelector('#modal-us-detail').value.trim(),
                    priority: overlay.querySelector('#modal-us-priority').value,
                    status: overlay.querySelector('#modal-us-status').value
                });
                const { userStories } = await ApiService.getUserStories(Store.state.selectedUseCaseId);
                Store.setUserStories(userStories || [], Store.state.selectedUseCaseId);
                // Refresh CU counts
                const { useCases } = await ApiService.getUseCases(Store.state.activeProjectId);
                Store.state.useCases = useCases || [];
                UI.hideLoading();
                close();
                UI.toast("Historia de Usuario creada");
            });
        }

        if (type === 'new-suite') {
            const epicSelect = overlay.querySelector('#modal-suite-epic');
            
            // Cargar épicas asíncronamente
            (async () => {
                try {
                    const ctx = await ApiService.getJiraContext(Store.state.activeProjectId);
                    if (ctx?.error) {
                        if (ctx.error.includes('token')) {
                            epicSelect.innerHTML = '<option value="">— Configura tu token —</option>';
                        } else {
                            epicSelect.innerHTML = '<option value="">' + ctx.error + '</option>';
                        }
                    } else if (ctx && ctx.epics) {
                        epicSelect.innerHTML = '<option value="">— Sin Épica —</option>' + 
                            ctx.epics.map(e => `<option value="${e.key}">${e.key} - ${e.name}</option>`).join('');
                    } else {
                        epicSelect.innerHTML = '<option value="">Jira no configurado</option>';
                    }
                } catch (err) {
                    epicSelect.innerHTML = '<option value="">Error al cargar épicas</option>';
                }
            })();

            overlay.querySelector('#modal-save')?.addEventListener('click', async () => {
                const title = overlay.querySelector('#modal-suite-title').value.trim();
                const jira_epic_key = epicSelect.value;
                if (!title) return UI.toast("El nombre es obligatorio", "error");
                
                UI.showLoading();
                await ApiService.createTestSuite({
                    use_case_id: Store.state.selectedUseCaseId,
                    title,
                    description: overlay.querySelector('#modal-suite-desc').value,
                    jira_epic_key
                });
                const { testSuites } = await ApiService.getTestSuites(Store.state.selectedUseCaseId);
                Store.setTestSuites(testSuites || []);
                UI.hideLoading();
                close();
                UI.toast("Test Suite creada");
            });
        }

        if (type === 'confirm') {
            overlay.querySelector('#modal-confirm-btn')?.addEventListener('click', () => {
                if (options.onConfirm) options.onConfirm();
                close();
            });
        }

        if (type === 'alert') {
            // El botón "Entendido" ya llama a close() mediante el ID modal-cancel en bindEvents base
        }

        if (type === 'prompt') {
            const input = overlay.querySelector('#modal-prompt-input');
            // No auto-focus to avoid unwanted scroll - user can click input if needed
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') overlay.querySelector('#modal-prompt-save').click();
            });

            overlay.querySelector('#modal-prompt-save')?.addEventListener('click', () => {
                const val = input.value.trim();
                if (options.onConfirm) options.onConfirm(val);
                close();
            });
        }

        if (type === 'start-run-wizard') {
            const isBulk = Array.isArray(options.suites) && options.suites.length > 0;
            let currentType = 'REGRESSION';
            const suite = options.suite;
            const suites = options.suites || [];
            const tcs = (suite?.test_cases || []);

            const updatePreview = () => {
                let filtered = [];
                if (currentType === 'SMOKE') {
                    filtered = tcs.filter(t => t.is_smoke);
                } else if (currentType === 'REGRESSION') {
                    filtered = tcs.filter(t => t.is_regression);
                } else if (currentType === 'INTEGRATION') {
                    filtered = tcs.filter(t => t.is_integration);
                } else if (currentType === 'EXPLORATORY') {
                    filtered = tcs.filter(t => t.is_exploratory);
                } else {
                    const prio = overlay.querySelector('#filter-priority').value;
                    const mod = overlay.querySelector('#filter-module').value.toLowerCase();
                    const smoke = overlay.querySelector('#filter-smoke').checked;
                    const regr = overlay.querySelector('#filter-regression').checked;
                    const integ = overlay.querySelector('#filter-integration').checked;
                    const explo = overlay.querySelector('#filter-exploratory').checked;
                    filtered = tcs.filter(t => {
                        let ok = true;
                        if (prio && t.priority !== prio) ok = false;
                        if (mod && !(t.module_name || '').toLowerCase().includes(mod)) ok = false;
                        if (smoke && !t.is_smoke) ok = false;
                        if (regr && !t.is_regression) ok = false;
                        if (integ && !t.is_integration) ok = false;
                        if (explo && !t.is_exploratory) ok = false;
                        return ok;
                    });
                }
                overlay.querySelector('#preview-count').textContent = filtered.length;
                overlay.querySelector('#modal-run-start').disabled = filtered.length === 0;
            };

            overlay.querySelectorAll('.exec-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    overlay.querySelectorAll('.exec-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentType = btn.dataset.type;
                    overlay.querySelector('#custom-filters-area').style.display = currentType === 'CUSTOM' ? 'block' : 'none';
                    updatePreview();
                });
            });

            overlay.querySelectorAll('select, input').forEach(el => {
                el.addEventListener('change', updatePreview);
                el.addEventListener('keyup', updatePreview);
            });

            if (!isBulk) updatePreview();

            overlay.querySelector('#modal-run-start')?.addEventListener('click', async () => {
                UI.showLoading();
                try {
                    if (isBulk) {
                        const results = [];
                        let totalTests = 0;
                        for (const s of suites) {
                            try {
                                const filtered = (s.test_cases || []).filter(t => t.is_regression);
                                if (filtered.length === 0) continue;
                                const res = await ApiService.startRun(s.id, 'REGRESSION', null);
                                if (res?.ok) {
                                    results.push({ id: s.id, title: s.title, ok: true, count: res.testCount });
                                    totalTests += res.testCount;
                                } else {
                                    results.push({ id: s.id, title: s.title, ok: false, error: res?.error || 'Error desconocido' });
                                }
                            } catch (err) {
                                results.push({ id: s.id, title: s.title, ok: false, error: err.message });
                            }
                        }
                        const okCount = results.filter(r => r.ok).length;
                        const failCount = results.filter(r => !r.ok).length;
                        if (failCount > 0) {
                            UI.toast(`⚠️ ${okCount}/${suites.length} suites iniciadas. ${failCount} fallidas.`, 'warn');
                        } else {
                            UI.toast(`🚀 ${okCount}/${suites.length} suites iniciadas (${totalTests} tests)`, 'ok');
                        }
                        close();
                        if (options.onSuccess) options.onSuccess();
                    } else {
                        const filters = currentType === 'CUSTOM' ? {
                            priority: overlay.querySelector('#filter-priority').value || undefined,
                            module_name: overlay.querySelector('#filter-module').value || undefined,
                            is_smoke: overlay.querySelector('#filter-smoke').checked || undefined,
                            is_regression: overlay.querySelector('#filter-regression').checked || undefined,
                            is_integration: overlay.querySelector('#filter-integration').checked || undefined,
                            is_exploratory: overlay.querySelector('#filter-exploratory').checked || undefined
                        } : null;

                        const res = await ApiService.startRun(suite.id, currentType, filters);
                        if (res && res.ok) {
                            UI.toast(`🚀 Ciclo iniciado con ${res.testCount} tests`);
                            close();
                            if (options.onSuccess) options.onSuccess();
                        } else {
                            UI.toast(res?.error || 'No se pudo iniciar el ciclo', 'error');
                        }
                    }
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });

            overlay.querySelector('#modal-run-cancel')?.addEventListener('click', close);
        }

        if (type === 'confirm') {
            overlay.querySelector('#modal-confirm-btn')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true;
                btn.innerText = 'Procesando...';
                
                await options.onConfirm();
                close();
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    },

    getJiraConfigContent(options) {
        const { config, userHasToken } = options;
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🏢</div>
                <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Configuración de Jira</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Dominio y proyecto — la configuración de tokens es por usuario.</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label">Dominio de Jira (URL)</label>
                    <input type="text" id="jira-domain" placeholder="https://tu-empresa.atlassian.net" value="${UI.escapeHTML(config?.jira_domain || '')}">
                </div>
                <div class="field-group">
                    <label class="field-label">Key del Proyecto Jira</label>
                    <input type="text" id="jira-project-key" placeholder="Ej: PROJ" value="${UI.escapeHTML(config?.jira_project_key || '')}">
                </div>
                <div style="background: var(--apple-indigo-soft); border: 1px solid var(--apple-indigo-soft); border-radius: var(--apple-radius-lg); padding: 14px;">
                    <div style="font-size: 0.75rem; color: var(--apple-label-secondary); margin-bottom: 8px;">
                        🔐 Cada usuario debe configurar su propio token de Jira en su perfil.
                        ${userHasToken ? '<span style="color: var(--apple-green); font-weight: 600;"> Token configurado ✓</span>' : '<span style="color: var(--apple-red); font-weight: 600;"> Sin token</span>'}
                    </div>
                    <button class="btn btn-ghost" id="btn-config-user-jira" style="font-size: 0.75rem; padding: 8px 12px; width: 100%;">
                        ${userHasToken ? '🔄 Cambiar mi Token' : '➕ Configurar mi Token'}
                    </button>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button class="btn btn-ghost" id="cancel-jira" style="flex: 1; padding: 14px;">Cancelar</button>
                    <button class="btn btn-primary" id="save-jira" style="flex: 2; padding: 14px;">Guardar Proyecto</button>
                </div>
            </div>
        `;
    },

    bindJiraConfigEvents(content, options) {
        const dialog = content.closest('dialog');
        const close = () => {
            dialog?.close();
            dialog?.remove();
        };

        content.querySelector('#cancel-jira').addEventListener('click', close);

        content.querySelector('#btn-config-user-jira')?.addEventListener('click', async () => {
            close();
            const { config } = options;
            UI.showLoading();
            try {
                const { hasConfig, email } = await ApiService.getJiraUserConfig(Store.state.activeProjectId);
                Modals.render('jira-user-config', { config, hasConfig, savedEmail: email });
            } catch (err) {
                UI.toast(err.message || 'Error al cargar tu configuración de Jira', 'error');
            }
            UI.hideLoading();
        });

        content.querySelector('#save-jira').addEventListener('click', async () => {
            const data = {
                jira_domain: content.querySelector('#jira-domain').value.trim(),
                jira_project_key: content.querySelector('#jira-project-key').value.trim()
            };

            if (!data.jira_domain || !data.jira_project_key) {
                UI.toast('Dominio y Key del proyecto son obligatorios', 'error');
                return;
            }

            UI.showLoading();
            try {
                const res = await ApiService.saveJiraConfig(Store.state.activeProjectId, data);
                if (res.ok) {
                    UI.toast('✅ Configuración de Jira guardada');
                    close();
                }
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },

    getJiraUserConfigContent(options) {
        const { hasConfig, savedEmail, config } = options;
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🔑</div>
                <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main);">${hasConfig ? 'Actualizar mi Token' : 'Tu Token de Jira'}</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">${hasConfig ? 'Modifica tu email y token de Jira.' : 'Configura tu email y token para conectar con Jira.'}</p>
                ${hasConfig ? `<p style="color: var(--ok); font-size: 0.75rem; font-weight: 600;">✓ Ya tienes un token configurado para este proyecto</p>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label">Email de Usuario Jira</label>
                    <input type="email" id="jira-user-email" placeholder="tu-email@empresa.com" value="${UI.escapeHTML(savedEmail || '')}" style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main);">
                </div>
                <div class="field-group">
                    <label class="field-label">Jira API Token</label>
                    <input type="password" id="jira-api-token" placeholder="${hasConfig ? 'Dejar vacío para conservar el actual' : 'Ingresa tu API Token de Jira'}" style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main);">
                    <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">
                        Genera tu token en: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" style="color: var(--brand);">Atlassian Account → API Tokens</a>
                    </p>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-ghost" id="btn-test-jira" style="flex: 1; padding: 12px; font-size: 0.8rem;">🧪 Probar Conexión</button>
                    ${hasConfig ? `<button class="btn btn-ghost" id="btn-volver-jira-config" style="flex: 1; padding: 12px; font-size: 0.8rem;">← Volver</button>` : ''}
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-ghost" id="cancel-jira-user" style="flex: 1; padding: 14px;">Cancelar</button>
                    ${hasConfig ? `<button class="btn btn-ghost" id="btn-delete-jira-user" style="flex: 1; padding: 14px; color: var(--error);">🗑 Eliminar</button>` : ''}
                    <button class="btn btn-primary" id="save-jira-user" style="flex: 2; padding: 14px;">${hasConfig ? 'Actualizar' : 'Guardar'}</button>
                </div>
            </div>
        `;
    },

    bindJiraUserConfigEvents(content, options) {
        const dialog = content.closest('dialog');
        const close = () => {
            dialog?.close();
            dialog?.remove();
        };

        content.querySelector('#cancel-jira-user').addEventListener('click', close);

        content.querySelector('#btn-test-jira')?.addEventListener('click', async () => {
            const email = content.querySelector('#jira-user-email').value.trim();
            const token = content.querySelector('#jira-api-token').value.trim();
            if (!email || !token) {
                UI.toast('Completa email y token para probar', 'warn');
                return;
            }
            UI.showLoading();
            try {
                await ApiService.saveJiraUserConfig(Store.state.activeProjectId, { jira_user_email: email, jira_api_token: token });
                const { config } = options;
                const res = await fetch(`/api/jira/projects/${Store.state.activeProjectId}/context?force_test=1`);
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Token inválido');
                }
                UI.toast('✅ Conexión exitosa con Jira');
            } catch (err) {
                UI.toast(`❌ ${err.message}`, 'error');
            }
            UI.hideLoading();
        });

        content.querySelector('#btn-volver-jira-config')?.addEventListener('click', async () => {
            close();
            UI.showLoading();
            try {
                const { config, userHasToken } = await ApiService.getJiraConfig(Store.state.activeProjectId);
                Modals.render('jira-config', { config: config || {}, userHasToken: !!userHasToken });
            } catch (err) {
                UI.toast(err.message || 'Error al volver a configuración', 'error');
            }
            UI.hideLoading();
        });

        content.querySelector('#btn-delete-jira-user')?.addEventListener('click', async () => {
            if (!confirm('¿Eliminar tu token de Jira para este proyecto? Esta acción no se puede deshacer.')) return;
            UI.showLoading();
            try {
                await ApiService.deleteJiraUserConfig(Store.state.activeProjectId);
                UI.toast('✅ Token eliminado correctamente');
                close();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });

        content.querySelector('#save-jira-user').addEventListener('click', async () => {
            const email = content.querySelector('#jira-user-email').value.trim();
            const token = content.querySelector('#jira-api-token').value.trim();

            if (!email) {
                UI.toast('Email es obligatorio', 'error');
                return;
            }

            if (!token && !options.hasConfig) {
                UI.toast('API Token es obligatorio', 'error');
                return;
            }

            const data = {
                jira_user_email: email,
                jira_api_token: token
            };

            UI.showLoading();
            try {
                await ApiService.saveJiraUserConfig(Store.state.activeProjectId, data);
                UI.toast(options.hasConfig ? '✅ Token actualizado correctamente' : '✅ Token guardado correctamente');
                close();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },

    getNewUserContent(options) {
        const { user = {}, projects = [] } = options;
        const isEditing = !!user.id;
        
        return `
            <div style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 8px;">${isEditing ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem;">${isEditing ? 'Modifica los datos y permisos del usuario.' : 'Configura un nuevo integrante para el equipo.'}</p>
            </div>

            <form id="modal-user-form">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                    <div class="field-group">
                        <label class="field-label">Nombre Completo</label>
                        <input type="text" id="nu-name" required value="${UI.escapeHTML(user.name || '')}" placeholder="Ej: Ana García">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Email</label>
                        <input type="email" id="nu-email" required value="${UI.escapeHTML(user.email || '')}" placeholder="ana@empresa.com">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Rol</label>
                        <select id="nu-role">
                            ${['Tester', 'Analista QA', 'Lider Tecnico', 'Project Manager', 'Admin'].map(r => `
                                <option value="${r}" ${user.role === r ? 'selected' : ''}>${r}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Perfil</label>
                        <select id="nu-perfil">
                            <option value="user" ${user.perfil === 'user' || !user.perfil ? 'selected' : ''}>User</option>
                            <option value="admin" ${user.perfil === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        <p style="font-size: 0.6rem; color: var(--text-muted); margin-top: 4px;">Admin puede gestionar el equipo y ver todos los permisos.</p>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Contraseña ${isEditing ? '<span style="font-size: 0.6rem; opacity: 0.6;">(Opcional)</span>' : ''}</label>
                        <input type="password" id="nu-pass" placeholder="••••••••">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <span class="field-label" style="display: block; margin-bottom: 12px; color: var(--brand); font-weight: 800; font-size: 0.7rem; text-transform: uppercase;">Permisos Granulares</span>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
                        <div>
                            <span style="display:block; font-size:0.6rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Crear</span>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Casos de Uso</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-cu" ${user.can_create_cu ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Historias de Usuario</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-hu" ${user.can_create_hu ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Test Suites</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-suite" ${user.can_create_suite ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Test Cases</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-test" ${user.can_create_test ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                        </div>
                        <div>
                            <span style="display:block; font-size:0.6rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Asignar</span>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Casos de Uso</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-assign-cu" ${user.can_assign_cu ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Historias de Usuario</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-assign-hu" ${user.can_assign_hu ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Test Suites</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-assign-suite" ${user.can_assign_suite ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                        </div>
                        <div>
                            <span style="display:block; font-size:0.6rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Gestión</span>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Ejecutar Pruebas</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-exec" ${user.can_execute_test ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Gestionar Proyectos</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-manage-proj" ${user.can_manage_projects ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Gestionar Usuarios</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-manage-users" ${user.can_manage_users ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                            <label class="toggle-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Configurar Jira</span>
                                <span class="toggle-switch"><input type="checkbox" id="nu-p-config-jira" ${user.can_configure_jira ? 'checked' : ''}><span class="toggle-slider"></span></span>
                            </label>
                        </div>
                    </div>
                    <style>
                        .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; }
                        .toggle-switch input { display: none; }
                        .toggle-slider { position: absolute; inset: 0; background: var(--apple-fill); border: 1px solid var(--apple-separator); border-radius: 24px; cursor: pointer; transition: 0.25s ease; }
                        .toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 2px; bottom: 2px; background: var(--apple-label-secondary); border-radius: 50%; transition: 0.25s ease; }
                        .toggle-switch input:checked + .toggle-slider { background: var(--apple-blue); border-color: var(--apple-blue); }
                        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); background: white; }
                        .toggle-row:hover .toggle-slider { border-color: var(--apple-blue); }
                    </style>
                </div>

                <div style="margin-bottom: 24px;">
                    <span class="field-label" style="display: block; margin-bottom: 12px; color: var(--brand); font-weight: 800; font-size: 0.7rem; text-transform: uppercase;">Proyectos Asignados</span>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto; padding: 4px;">
                        ${projects.map(p => `
                            <label style="display: flex; align-items: center; gap: 8px; background: var(--bg-surface-elevated); padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border); font-size: 0.75rem; cursor: pointer;">
                                <input type="checkbox" class="nu-project-checkbox" value="${p.id}" ${(user.projects || []).includes(p.id) ? 'checked' : ''}>
                                <span>${UI.escapeHTML(p.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 24px;">
                    <button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="padding-left: 24px; padding-right: 24px;">${isEditing ? 'Guardar Cambios' : 'Crear Usuario'}</button>
                </div>
            </form>
        `;
    },

    bindUserAdminEvents(overlay, options) {
        const close = () => {
            overlay.close();
            overlay.remove();
        };

        overlay.querySelector('#modal-cancel').addEventListener('click', close);

        overlay.querySelector('#modal-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const projects = Array.from(overlay.querySelectorAll('.nu-project-checkbox:checked')).map(cb => parseInt(cb.value));
            const data = {
                name: overlay.querySelector('#nu-name').value.trim(),
                email: overlay.querySelector('#nu-email').value.trim(),
                role: overlay.querySelector('#nu-role').value,
                perfil: overlay.querySelector('#nu-perfil').value,
                projects,
                permissions: {
                    can_create_cu: overlay.querySelector('#nu-p-cu').checked,
                    can_create_hu: overlay.querySelector('#nu-p-hu').checked,
                    can_create_suite: overlay.querySelector('#nu-p-suite').checked,
                    can_create_test: overlay.querySelector('#nu-p-test').checked,
                    can_assign_cu: overlay.querySelector('#nu-p-assign-cu').checked,
                    can_assign_hu: overlay.querySelector('#nu-p-assign-hu').checked,
                    can_assign_suite: overlay.querySelector('#nu-p-assign-suite').checked,
                    can_execute_test: overlay.querySelector('#nu-p-exec').checked,
                    can_manage_projects: overlay.querySelector('#nu-p-manage-proj').checked,
                    can_manage_users: overlay.querySelector('#nu-p-manage-users').checked,
                    can_configure_jira: overlay.querySelector('#nu-p-config-jira').checked
                }
            };

            const pass = overlay.querySelector('#nu-pass').value;
            if (pass) data.password = pass;

            UI.showLoading();
            try {
                if (options.user?.id) {
                    await ApiService.updateUser(options.user.id, data);
                    UI.toast('✅ Usuario actualizado');
                } else {
                    await ApiService.createUser(data);
                    UI.toast('✅ Usuario creado');
                }
                close();
                if (options.onSuccess) options.onSuccess();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        });
    },
    getBugDetailsProContent(options) {
        const { bug } = options;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <div>
                    <h2 style="margin: 0; color: var(--fail); display: flex; align-items: center; gap: 12px;">
                        🐞 DETALLE TÉCNICO DE DEFECTO
                    </h2>
                    <p style="color: var(--text-muted); margin-top: 4px;">ID: #${bug.id} • Reportado en: ${new Date(bug.created_at).toLocaleString()}</p>
                </div>
                <div class="status-pill ${bug.status === 'FIXED' ? 'ok' : 'warn'}" style="font-size: 0.8rem; padding: 6px 16px;">
                    ${bug.status}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                <div class="field-group">
                    <label class="field-label">Título del Bug</label>
                    <div style="padding: 12px; background: var(--bg-hover); border-radius: 8px; font-weight: 700;">
                        ${UI.escapeHTML(bug.title)}
                    </div>
                </div>
                <div class="field-group">
                    <label class="field-label">Test Case Origen</label>
                    <div style="padding: 12px; background: var(--bg-hover); border-radius: 8px; color: var(--brand); font-weight: 600;">
                        ${UI.escapeHTML(bug.tc_key)} - ${UI.escapeHTML(bug.tc_title)}
                    </div>
                </div>
            </div>

            <div class="field-group" style="margin-bottom: 24px;">
                <label class="field-label">Pasos para reproducir</label>
                <div style="padding: 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; white-space: pre-wrap; font-family: monospace; font-size: 0.85rem; line-height: 1.6;">
                    ${UI.escapeHTML(bug.steps_to_reproduce || 'No se proporcionaron pasos.')}
                </div>
            </div>

            <div class="bug-result-compare" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div class="field-group">
                    <div class="result-box-title" style="color: var(--apple-green); font-size: 0.75rem; font-weight: 800; margin-bottom: 8px;">✔️ RESULTADO ESPERADO</div>
                    <div style="padding: 12px; background: var(--apple-green-soft); border: 1px solid var(--apple-green-soft); border-radius: var(--apple-radius-sm); min-height: 100px; font-size: 0.85rem;">
                        ${UI.escapeHTML(bug.expected_result || '—')}
                    </div>
                </div>
                <div class="field-group">
                    <div class="result-box-title" style="color: var(--apple-red); font-size: 0.75rem; font-weight: 800; margin-bottom: 8px;">❌ RESULTADO ACTUAL</div>
                    <div style="padding: 12px; background: var(--apple-red-soft); border: 1px solid var(--apple-red-soft); border-radius: var(--apple-radius-sm); min-height: 100px; font-size: 0.85rem;">
                        ${UI.escapeHTML(bug.actual_result || '—')}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: var(--apple-fill-tertiary); padding: 20px; border-radius: var(--apple-radius-lg); margin-bottom: 32px;">
                <div class="field-group">
                    <label class="field-label">Severidad</label>
                    <span style="font-weight: 800; color: var(--apple-red);">${UI.escapeHTML(bug.severity)}</span>
                </div>
                <div class="field-group">
                    <label class="field-label">Frecuencia</label>
                    <span style="font-weight: 700;">${UI.escapeHTML(bug.frequency || 'Siempre')}</span>
                </div>
                <div class="field-group">
                    <label class="field-label">Impacto Negocio</label>
                    <span style="font-size: 0.8rem;">${UI.escapeHTML(bug.business_impact || 'No especificado')}</span>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" id="modal-cancel" style="padding: 10px 40px;">Cerrar Detalle</button>
            </div>
        `;
    },
    getEvidenceUploadContent(options) {
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🖼️</div>
                <h3 style="margin-bottom: 8px;">Cargar Evidencia</h3>
                <p style="color: var(--apple-label-secondary); font-size: 0.85rem;">Sube una captura o video para respaldar el resultado.</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label">Categoría de Evidencia</label>
                    <select id="modal-evidence-category" class="st-select" style="width: 100%; padding: 10px;">
                        <option value="GENERAL">Evidencia General</option>
                        <option value="FIGMA">Diseño (Figma)</option>
                        <option value="DEV">Desarrollo (Sistema)</option>
                        <option value="BUG">Evidencia de Error</option>
                    </select>
                </div>

                <div class="field-group">
                    <label class="field-label">Seleccionar Archivo</label>
                    <div id="drop-zone" style="border: 2px dashed var(--apple-separator-opaque); border-radius: var(--apple-radius-lg); padding: 30px; text-align: center; cursor: pointer; transition: all 0.2s;">
                        <input type="file" id="modal-evidence-file" style="display: none;" accept="image/*,video/*">
                        <div id="file-info" style="font-size: 0.85rem; color: var(--apple-label-secondary);">
                            Haga clic o arrastre un archivo aquí
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-upload-evidence" disabled>Subir Archivo</button>
            </div>
        `;
    },

    bindEvidenceUploadEvents(dialog, options) {
        const fileInput = dialog.querySelector('#modal-evidence-file');
        const dropZone = dialog.querySelector('#drop-zone');
        const fileInfo = dialog.querySelector('#file-info');
        const uploadBtn = dialog.querySelector('#modal-upload-evidence');
        const cancelBtn = dialog.querySelector('#modal-cancel');
        const categorySelect = dialog.querySelector('#modal-evidence-category');

        const setFile = (file) => {
            if (!file) return;
            // Validar que sea imagen o video
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                UI.toast('Solo se permiten imágenes o videos', 'warn');
                return;
            }
            
            // Simular el cambio en el input file para que uploadBtn funcione igual
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            fileInfo.innerHTML = `
                <div style="color: var(--ok); font-weight: 800; margin-bottom: 4px;">✅ Archivo capturado</div>
                <strong style="font-size: 0.8rem;">${file.name || 'Captura de portapapeles'}</strong><br>
                <span style="font-size: 0.7rem; opacity: 0.7;">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
            `;
            uploadBtn.disabled = false;
            dropZone.style.borderColor = 'var(--ok)';
            dropZone.style.background = 'rgba(82, 196, 26, 0.05)';
        };

        // Click para abrir explorador
        dropZone.onclick = () => fileInput.click();
        
        fileInput.onchange = (e) => setFile(e.target.files[0]);

        // Soporte para Arrastrar y Soltar (Drag & Drop)
        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--brand)';
            dropZone.style.background = 'rgba(59, 130, 246, 0.1)';
        };

        dropZone.ondragleave = () => {
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'transparent';
        };

        dropZone.ondrop = (e) => {
            e.preventDefault();
            setFile(e.dataTransfer.files[0]);
        };

        // SOPORTE PARA PEGAR (Ctrl+V)
        const pasteHandler = (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    setFile(file);
                    break;
                }
            }
        };
        window.addEventListener('paste', pasteHandler);

        // Limpiar el listener al cerrar el modal
        dialog.onclose = () => {
            window.removeEventListener('paste', pasteHandler);
        };

        cancelBtn.onclick = () => dialog.close();

        uploadBtn.onclick = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            UI.showLoading();
            try {
                const formData = new FormData();
                formData.append('evidence', file);
                formData.append('tc_id', options.tcId);
                formData.append('category', categorySelect.value);

                const response = await fetch('/api/evidence', {
                    method: 'POST',
                    body: formData
                });

                const res = await response.json();
                if (!response.ok) throw new Error(res.error || 'Error al subir evidencia');

                UI.toast('Evidencia subida correctamente');
                dialog.close();
                if (options.onSuccess) options.onSuccess();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        };
    },

    getImportDualContent(options) {
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">📊</div>
                <h3 style="margin-bottom: 8px;">Importación Segura (XLSX / CSV)</h3>
                <p style="color: var(--apple-label-secondary); font-size: 0.85rem;">Carga Historias de Usuario y sus Tests asociados de forma segura.</p>
            </div>

            <div style="background: var(--apple-blue-soft); border: 1px solid var(--apple-blue-soft); border-radius: var(--apple-radius-lg); padding: 16px; margin-bottom: 24px;">
                <div style="font-size: 0.75rem; color: var(--apple-blue); font-weight: 800; margin-bottom: 8px;">FORMATOS SOPORTADOS:</div>
                <ul style="font-size: 0.75rem; color: var(--apple-label-secondary); padding-left: 16px; margin: 0;">
                    <li><b>Unificado (recomendado):</b> 1 hoja con columnas: CU Vinculado, Suite, HU, Escenario, Pasos, Resultado Esperado, etc.</li>
                    <li><b>Dual (legacy):</b> XLSX con 2 hojas: "historia de usuario" y "Casos de Prueba".</li>
                    <li><b>CSV:</b> Un solo archivo con columnas de HU y Tests.</li>
                    <li><b>Nota:</b> Los ID (CU, HU, TC) se generan automáticamente al importar.</li>
                </ul>
            </div>

            <div class="field-group">
                <label class="field-label">Seleccionar Archivo (.xlsx, .csv)</label>
                <div id="import-drop-zone" style="border: 2px dashed var(--apple-separator-opaque); border-radius: var(--apple-radius-lg); padding: 30px; text-align: center; cursor: pointer;">
                    <input type="file" id="modal-import-file" style="display: none;" accept=".xlsx, .csv">
                    <div id="import-file-info" style="font-size: 0.85rem; color: var(--apple-label-secondary);">
                        Haga clic para seleccionar archivo
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-start-import" disabled>Iniciar Importación</button>
            </div>
        `;
    },

    bindImportDualEvents(dialog, options) {
        const fileInput = dialog.querySelector('#modal-import-file');
        const dropZone = dialog.querySelector('#import-drop-zone');
        const fileInfo = dialog.querySelector('#import-file-info');
        const importBtn = dialog.querySelector('#modal-start-import');
        const cancelBtn = dialog.querySelector('#modal-cancel');

        dropZone.onclick = () => fileInput.click();
        
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                fileInfo.innerHTML = `<strong>${file.name}</strong><br><span style="font-size: 0.75rem;">Archivo listo para procesar</span>`;
                importBtn.disabled = false;
                dropZone.style.borderColor = 'var(--brand)';
            }
        };

        cancelBtn.onclick = () => dialog.close();

        importBtn.onclick = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            importBtn.disabled = true;
            const originalContent = dialog.querySelector('.modal-content').innerHTML;
            dialog.querySelector('.modal-content').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <div class="loader-spinner" style="width:48px; height:48px; border:4px solid var(--border); border-top-color:var(--brand); border-radius:50%; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                    <h3 style="margin: 0 0 8px; font-size: 1.1rem; color: var(--text-main);">Importando...</h3>
                    <p style="margin: 0 0 4px; font-size: 0.85rem; color: var(--text-muted);">Archivo: <strong>${file.name}</strong></p>
                    <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">Esto puede tomar unos segundos</p>
                    <div style="margin-top: 24px; width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                        <div style="width: 30%; height: 100%; background: linear-gradient(90deg, var(--brand), #6366f1); border-radius: 2px; animation: progressPulse 1.5s ease-in-out infinite;"></div>
                    </div>
                    <style>@keyframes progressPulse { 0%, 100% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 40%; } }</style>
                </div>
            `;

            try {
                const formData = new FormData();
                formData.append('xlsx', file);

                const response = await fetch(`/api/use-cases/${options.useCaseId}/import-dual`, {
                    method: 'POST',
                    body: formData
                });

                const res = await response.json();
                if (!response.ok) throw new Error(res.error || 'Error en la importación');

                dialog.close();
                dialog.remove();
                UI.toast(res.message);
                if (options.onSuccess) options.onSuccess();
            } catch (err) {
                dialog.querySelector('.modal-content').innerHTML = originalContent;
                importBtn.disabled = false;
                UI.toast(err.message, 'error');
            }
        };
    },

    // ══════════════════════════════════════════════════════════════
    // ── BATCH JIRA TICKETS ──
    // ══════════════════════════════════════════════════════════════

    getBatchJiraTicketsContent(options) {
        const { bugs = [] } = options;
        return `
            <div id="batch-jira-phase-config" style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <h3 style="margin: 0 0 6px 0; font-size: 1.2rem; font-weight: 800; color: var(--text-main);">🚀 Crear ${bugs.length} ticket${bugs.length === 1 ? '' : 's'} en Jira</h3>
                    <p style="color: var(--text-muted); font-size: 0.82rem; margin: 0;">Se enviarán en secuencia. Épica y asignado se aplican a todos; la prioridad se puede ajustar por bug.</p>
                </div>

                <div id="batch-jira-context" style="background: var(--apple-fill-tertiary); padding: 16px; border-radius: var(--apple-radius-md); display: flex; flex-direction: column; gap: 14px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--apple-label-secondary); font-size: 0.78rem;">
                        <div class="loader-spinner" style="width: 14px; height: 14px; border: 2px solid var(--apple-fill); border-top-color: var(--apple-blue); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        Cargando configuración de Jira...
                    </div>
                </div>

                <div>
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">Bugs a procesar (${bugs.length})</div>
                    <div id="batch-jira-bugs-list" style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); max-height: 240px; overflow-y: auto;">
                        ${bugs.map(bug => {
                            const sevBg = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'rgba(255,59,48,0.1)' : 'rgba(255,149,0,0.1)';
                            const sevColor = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'var(--apple-red)' : 'var(--apple-orange)';
                            return `
                            <div data-bug-row="${bug.id}" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--apple-separator); font-size: 0.82rem;">
                                <span style="font-size: 0.72rem; font-weight: 800; color: var(--apple-label-tertiary); min-width: 50px;">#${bug.id}</span>
                                <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--apple-label);">${UI.escapeHTML(bug.title || 'Sin título')}</span>
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.62rem; font-weight: 700; background: ${sevBg}; color: ${sevColor};">${UI.escapeHTML(bug.severity || 'Media')}</span>
                                <select id="batch-priority-${bug.id}" data-priority-select="${bug.id}" style="font-size: 0.72rem; padding: 4px 8px; border-radius: var(--apple-radius-sm); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label); cursor: pointer; min-width: 110px;" disabled>
                                    <option value="">— Prioridad —</option>
                                </select>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                    <button class="btn btn-ghost btn-sm" id="batch-jira-cancel" style="padding: 8px 18px; border-radius: var(--apple-radius-md); font-size: 0.78rem;">Cancelar</button>
                    <button class="btn btn-primary btn-sm" id="batch-jira-start" disabled style="padding: 8px 22px; border-radius: var(--apple-radius-md); font-size: 0.78rem; font-weight: 700; opacity: 0.5; cursor: not-allowed;">🚀 Iniciar creación</button>
                </div>
            </div>

            <div id="batch-jira-phase-progress" style="display: none; flex-direction: column; gap: 16px;">
                <div>
                    <h3 style="margin: 0 0 6px 0; font-size: 1.2rem; font-weight: 800; color: var(--text-main);">Creando tickets en Jira</h3>
                    <p id="batch-jira-progress-label" style="color: var(--text-muted); font-size: 0.82rem; margin: 0;">0 de ${bugs.length} completados</p>
                </div>

                <div style="background: var(--apple-fill-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="batch-jira-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--apple-blue), var(--apple-indigo)); border-radius: 4px; transition: width 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);"></div>
                </div>

                <div id="batch-jira-progress-list" style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); max-height: 280px; overflow-y: auto;"></div>

                <div id="batch-jira-summary" style="display: none; flex-direction: column; gap: 8px;">
                    <div id="batch-jira-summary-text" style="font-size: 0.85rem; font-weight: 700; padding: 10px 14px; border-radius: var(--apple-radius-md);"></div>
                    <details id="batch-jira-errors-details" style="display: none; background: var(--apple-bg-elevated); border: 1px solid rgba(255,59,48,0.2); border-radius: var(--apple-radius-md); padding: 12px 16px;">
                        <summary style="cursor: pointer; font-size: 0.78rem; font-weight: 700; color: var(--apple-red); user-select: none;">Ver detalles de errores</summary>
                        <div id="batch-jira-errors-list" style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem;"></div>
                    </details>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 4px;">
                    <button class="btn btn-ghost btn-sm" id="batch-jira-refresh" style="display: none; padding: 8px 18px; border-radius: var(--apple-radius-md); font-size: 0.78rem;">🔄 Actualizar lista</button>
                    <button class="btn btn-primary btn-sm" id="batch-jira-close" disabled style="padding: 8px 22px; border-radius: var(--apple-radius-md); font-size: 0.78rem; font-weight: 700; opacity: 0.5; cursor: not-allowed;">Cerrar</button>
                </div>
            </div>
        `;
    },

    bindBatchJiraTicketsEvents(dialog, options) {
        const { bugs = [], onComplete } = options;
        const close = () => { dialog.close(); dialog.remove(); };

        document.getElementById('batch-jira-cancel').onclick = close;
        document.getElementById('batch-jira-close').onclick = close;
        document.getElementById('batch-jira-refresh').onclick = async () => {
            close();
            if (onComplete) await onComplete();
        };

        // Estado compartido entre el loader de contexto y el handler de creación
        let priorities = [];

        // Mapear severidad del bug → nombre de prioridad de Jira (para el default por fila)
        const SEVERITY_TO_PRIORITY_NAME = {
            'Crítica': 'Highest',
            'Alta': 'High',
            'Media': 'Medium',
            'Baja': 'Low'
        };
        const defaultPriorityIdFor = (severity) => {
            const targetName = SEVERITY_TO_PRIORITY_NAME[severity] || 'Medium';
            const found = priorities.find(p => p.name === targetName);
            return (found || priorities.find(p => p.name === 'Medium') || priorities[0])?.id || '';
        };

        // 1. Cargar contexto Jira y popular selects
        (async () => {
            const projectId = Store.state.activeProjectId;
            if (!projectId) return;

            const contextContainer = document.getElementById('batch-jira-context');
            const startBtn = document.getElementById('batch-jira-start');
            let jiraContext = { epics: [], users: [], priorities: [], customFields: [], error: null };

            try {
                jiraContext = await ApiService.getJiraContext(projectId);
            } catch (e) {
                jiraContext = { ...jiraContext, error: e.message };
            }

            if (jiraContext.error) {
                contextContainer.innerHTML = `
                    <div style="color: var(--apple-red); font-size: 0.82rem; padding: 8px 4px;">
                        ⚠️ ${UI.escapeHTML(jiraContext.error.includes('token') ? 'Configura tu token de Jira antes de crear tickets.' : jiraContext.error)}
                    </div>
                `;
                return;
            }

            const { epics = [], users = [], priorities: loadedPriorities = [], customFields = [] } = jiraContext;
            priorities = loadedPriorities;
            const inputStyle = "width:100%; padding:8px 12px; background:var(--apple-bg-tertiary); border:1px solid var(--apple-separator); border-radius:var(--apple-radius-md); color:var(--apple-label); font-size:0.85rem; outline:none; box-sizing:border-box; transition: border-color 0.15s;";
            const focusAttr = `onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'"`;

            contextContainer.innerHTML = `
                <div>
                    <label style="display:block; font-size: 0.7rem; font-weight: 700; color: var(--apple-label-secondary); margin-bottom: 4px;">📌 Épica</label>
                    <select id="batch-jira-epic" style="${inputStyle}" ${focusAttr}>
                        <option value="">— Sin Épica —</option>
                        ${epics.map(e => `<option value="${UI.escapeHTML(e.id)}">${UI.escapeHTML(e.key)} | ${UI.escapeHTML(e.summary)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size: 0.7rem; font-weight: 700; color: var(--apple-label-secondary); margin-bottom: 4px;">👤 Asignado a</label>
                    <select id="batch-jira-assignee" style="${inputStyle}" ${focusAttr}>
                        <option value="">— Sin asignar —</option>
                        ${users.map(u => `<option value="${UI.escapeHTML(u.accountId)}">${UI.escapeHTML(u.displayName)}</option>`).join('')}
                    </select>
                </div>
                ${customFields.length > 0 ? `
                    <div>
                        <div style="font-size: 0.7rem; font-weight: 700; color: var(--apple-label-secondary); margin-bottom: 6px;">⚙️ Campos personalizados</div>
                        <div id="batch-jira-custom-fields" style="display: flex; flex-direction: column; gap: 10px;"></div>
                    </div>
                ` : ''}
            `;

            // Popular el select de prioridad de cada fila del listado "Bugs a procesar"
            for (const bug of bugs) {
                const rowSelect = document.getElementById(`batch-priority-${bug.id}`);
                if (!rowSelect) continue;
                rowSelect.innerHTML = priorities.map(p =>
                    `<option value="${UI.escapeHTML(p.id)}">${UI.escapeHTML(p.name)}</option>`
                ).join('');
                const defaultId = defaultPriorityIdFor(bug.severity);
                if (defaultId) rowSelect.value = defaultId;
                rowSelect.disabled = priorities.length === 0;
            }

            // Renderizar custom fields
            if (customFields.length > 0) {
                const cfContainer = document.getElementById('batch-jira-custom-fields');
                let cfHtml = '';
                for (const field of customFields) {
                    cfHtml += `<div>
                        <label style="display:block; font-size: 0.66rem; color: var(--apple-label-secondary); margin-bottom: 3px;">${UI.escapeHTML(field.name)}${field.required ? ' *' : ''}</label>`;
                    if (field.options && field.options.length > 0) {
                        cfHtml += `<select id="batch-cf-${UI.escapeHTML(field.fieldId)}" style="${inputStyle}" ${focusAttr}>
                            <option value="">— Seleccionar —</option>
                            ${field.options.map(o => `<option value="${UI.escapeHTML(o.id)}">${UI.escapeHTML(o.name)}</option>`).join('')}
                        </select>`;
                    } else {
                        cfHtml += `<input type="text" id="batch-cf-${UI.escapeHTML(field.fieldId)}" style="${inputStyle}" ${focusAttr} placeholder="Ingresar valor...">`;
                    }
                    cfHtml += `</div>`;
                }
                cfContainer.innerHTML = cfHtml;
            }

            // Habilitar botón
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
        })();

        // 2. Iniciar la creación
        document.getElementById('batch-jira-start').onclick = async () => {
            const startBtn = document.getElementById('batch-jira-start');
            const cancelBtn = document.getElementById('batch-jira-cancel');
            const phaseConfig = document.getElementById('batch-jira-phase-config');
            const phaseProgress = document.getElementById('batch-jira-phase-progress');
            const progressLabel = document.getElementById('batch-jira-progress-label');
            const progressBar = document.getElementById('batch-jira-progress-bar');
            const progressList = document.getElementById('batch-jira-progress-list');
            const summary = document.getElementById('batch-jira-summary');
            const summaryText = document.getElementById('batch-jira-summary-text');
            const errorsDetails = document.getElementById('batch-jira-errors-details');
            const errorsList = document.getElementById('batch-jira-errors-list');
            const refreshBtn = document.getElementById('batch-jira-refresh');
            const closeBtn = document.getElementById('batch-jira-close');

            const epicId = document.getElementById('batch-jira-epic')?.value || '';
            const assigneeId = document.getElementById('batch-jira-assignee')?.value || '';

            const customFieldValues = {};
            document.querySelectorAll('[id^="batch-cf-"]').forEach(el => {
                const fieldId = el.id.replace('batch-cf-', '');
                if (el.value) {
                    if (el.tagName === 'SELECT') {
                        customFieldValues[fieldId] = { id: el.value };
                    } else {
                        customFieldValues[fieldId] = el.value;
                    }
                }
            });

            // Snapshot de la prioridad elegida por bug para usarla al crear y mostrarla en el progreso
            const bugPriorityById = {};
            for (const bug of bugs) {
                const sel = document.getElementById(`batch-priority-${bug.id}`);
                const id = sel?.value || '';
                const p = priorities.find(x => x.id === id);
                bugPriorityById[bug.id] = { id, name: p ? p.name : '' };
            }

            // Inicializar lista visual
            progressList.innerHTML = bugs.map(bug => {
                const pInfo = bugPriorityById[bug.id];
                const priorityChip = pInfo && pInfo.name
                    ? `<span data-priority-chip style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 0.62rem; font-weight: 700; background: rgba(0,122,255,0.1); color: var(--apple-blue);">${UI.escapeHTML(pInfo.name)}</span>`
                    : '';
                return `
                <div id="batch-row-${bug.id}" data-status="pending" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--apple-separator); font-size: 0.82rem;">
                    <span style="font-size: 0.85rem; min-width: 22px; text-align: center;" data-icon>⏳</span>
                    <span style="font-size: 0.72rem; font-weight: 800; color: var(--apple-label-tertiary); min-width: 50px;">#${bug.id}</span>
                    <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--apple-label);">${UI.escapeHTML(bug.title || 'Sin título')}</span>
                    ${priorityChip}
                    <span data-result style="font-size: 0.7rem; color: var(--apple-label-tertiary); font-weight: 600;">Pendiente</span>
                </div>
                `;
            }).join('');

            // Cambiar fase
            phaseConfig.style.display = 'none';
            phaseProgress.style.display = 'flex';
            cancelBtn.disabled = true;

            // Ejecutar creación en secuencia
            let okCount = 0;
            let errCount = 0;
            const errors = [];

            for (let i = 0; i < bugs.length; i++) {
                const bug = bugs[i];
                const row = document.getElementById(`batch-row-${bug.id}`);
                const iconEl = row?.querySelector('[data-icon]');
                const resultEl = row?.querySelector('[data-result]');

                // Marcar como "enviando"
                if (row) row.dataset.status = 'sending';
                if (iconEl) iconEl.textContent = '⌛';
                if (resultEl) { resultEl.textContent = 'Enviando...'; resultEl.style.color = 'var(--apple-blue)'; }
                if (row) row.style.background = 'rgba(0,122,255,0.04)';

                try {
                    const result = await ApiService.createJiraBug(bug.id, epicId, assigneeId, bugPriorityById[bug.id]?.id || '', customFieldValues);
                    if (row) row.dataset.status = 'ok';
                    if (iconEl) iconEl.textContent = '✅';
                    if (resultEl) {
                        resultEl.innerHTML = `<a href="${UI.escapeHTML(result.jira.browser_url)}" target="_blank" rel="noopener" style="color: var(--apple-green); font-weight: 700; text-decoration: none;">${UI.escapeHTML(result.jira.key)} ↗</a>`;
                    }
                    if (row) row.style.background = 'rgba(52,199,89,0.06)';
                    okCount++;
                } catch (err) {
                    if (row) row.dataset.status = 'error';
                    if (iconEl) iconEl.textContent = '❌';
                    if (resultEl) {
                        resultEl.textContent = 'Error';
                        resultEl.style.color = 'var(--apple-red)';
                    }
                    if (row) row.style.background = 'rgba(255,59,48,0.06)';
                    errors.push({ bug, error: err.message });
                    errCount++;
                }

                // Actualizar barra y label
                const done = i + 1;
                const pct = (done / bugs.length) * 100;
                progressLabel.textContent = `${done} de ${bugs.length} completados`;
                progressBar.style.width = `${pct}%`;

                // Auto-scroll al item actual
                if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }

            // Resumen final
            summary.style.display = 'flex';
            if (errCount === 0) {
                summaryText.style.background = 'rgba(52,199,89,0.10)';
                summaryText.style.color = 'var(--apple-green)';
                summaryText.textContent = `✅ ${okCount} ticket${okCount === 1 ? '' : 's'} creado${okCount === 1 ? '' : 's'} correctamente`;
            } else if (okCount === 0) {
                summaryText.style.background = 'rgba(255,59,48,0.10)';
                summaryText.style.color = 'var(--apple-red)';
                summaryText.textContent = `❌ No se pudo crear ninguno de los ${bugs.length} tickets`;
            } else {
                summaryText.style.background = 'rgba(255,149,0,0.10)';
                summaryText.style.color = 'var(--apple-orange)';
                summaryText.textContent = `⚠️ ${okCount} creado${okCount === 1 ? '' : 's'}, ${errCount} con error`;
            }

            if (errors.length > 0) {
                errorsDetails.style.display = 'block';
                errorsList.innerHTML = errors.map(e => `
                    <div style="padding: 8px 10px; background: rgba(255,59,48,0.04); border-radius: var(--apple-radius-sm);">
                        <div style="font-weight: 700; color: var(--apple-label); margin-bottom: 2px;">#${e.bug.id} — ${UI.escapeHTML(e.bug.title || 'Sin título')}</div>
                        <div style="color: var(--apple-red);">${UI.escapeHTML(e.error)}</div>
                    </div>
                `).join('');
            }

            refreshBtn.style.display = (okCount > 0) ? 'inline-flex' : 'none';
            closeBtn.disabled = false;
            closeBtn.style.opacity = '1';
            closeBtn.style.cursor = 'pointer';
        };
    },

};
