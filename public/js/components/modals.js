import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

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
            case 'gemini': content = this.getGeminiContent(); width = '600px'; break;
            case 'user-admin': content = this.getNewUserContent(options); width = '600px'; break;
            case 'bug-details-pro': content = this.getBugDetailsProContent(options); width = '800px'; break;
            case 'evidence-upload': content = this.getEvidenceUploadContent(options); width = '450px'; break;
            case 'import-dual': content = this.getImportDualContent(options); width = '450px'; break;
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
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
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
            this.bindJiraConfigEvents(dialog, options);
        } else if (type === 'user-admin') {
            this.bindUserAdminEvents(dialog, options);
        } else if (type === 'edit-suite') {
            this.bindEditSuiteEvents(dialog, options);
        } else if (type === 'evidence-upload') {
            this.bindEvidenceUploadEvents(dialog, options);
        } else if (type === 'import-dual') {
            this.bindImportDualEvents(dialog, options);
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

                <div id="custom-filters-area" style="display: none; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
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
                <div style="background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 16px; margin-bottom: 8px;">
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

                <div class="field-group" style="background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); border-radius: 12px; padding: 14px; text-align: center;">
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
                    <select id="bug-severity" style="width: 100%; padding: 12px; background: #2a2a2a; border: 1px solid var(--border); border-radius: 12px; color: white; cursor: pointer;">
                        <option value="Baja" style="background: #2a2a2a; color: white;">Baja</option>
                        <option value="Media" selected style="background: #2a2a2a; color: white;">Media</option>
                        <option value="Alta" style="background: #2a2a2a; color: white;">Alta</option>
                        <option value="Crítica" style="background: #2a2a2a; color: white;">Crítica</option>
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
            </div>
            <div style="display: flex; gap: 12px; margin-top: 32px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="modal-edit-save">Guardar Cambios</button>
            </div>
        `;
    },

    bindEditSuiteEvents(overlay, { suite }) {
        const epicSelect = overlay.querySelector('#edit-suite-epic');
        const close = () => { overlay.close(); overlay.remove(); };
        overlay.querySelector('#modal-cancel').onclick = close;

        (async () => {
            try {
                const ctx = await ApiService.getJiraContext(Store.state.activeProjectId);
                if (ctx && ctx.epics) {
                    epicSelect.innerHTML = '<option value="">— Sin Épica —</option>' + 
                        ctx.epics.map(e => `<option value="${e.key}" ${e.key === suite.jira_epic_key ? 'selected' : ''}>${e.key} - ${e.name}</option>`).join('');
                }
            } catch (e) { epicSelect.innerHTML = '<option value="">Error al cargar</option>'; }
        })();

        overlay.querySelector('#modal-edit-save').onclick = async () => {
            const title = overlay.querySelector('#edit-suite-title').value.trim();
            const jira_epic_key = epicSelect.value;
            const description = overlay.querySelector('#edit-suite-desc').value;

            UI.showLoading();
            await ApiService.updateTestSuite(suite.id, { title, description, jira_epic_key });
            const { testSuites } = await ApiService.getTestSuites(Store.state.selectedUseCaseId);
            Store.setTestSuites(testSuites || []);
            UI.hideLoading();
            close();
            UI.toast("Suite actualizada");
            // Disparar evento para que TestSuitesTab refresque el render
            window.dispatchEvent(new Event('realtime-refresh'));
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
                    <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;">
                        <div style="padding: 16px; background: rgba(239, 68, 68, 0.05); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="background: var(--fail); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 800;">BUG #${bug.id}</span>
                                <span style="font-weight: 700; color: var(--text-main);">${UI.escapeHTML(bug.title)}</span>
                            </div>
                            <span class="status-pill ${bug.status === 'FIXED' ? 'ok' : 'warn'}" style="font-size: 0.65rem;">${UI.escapeHTML(bug.status)}</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 1px; background: var(--border);">
                            <div style="background: var(--bg-surface-elevated); padding: 16px;">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Contexto del Test</div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: var(--brand);">${UI.escapeHTML(bug.tc_title)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Asignado a: ${UI.escapeHTML(bug.tester_name || 'Desconocido')}</div>
                                <div style="margin-top: 12px; font-size: 0.7rem; display: flex; gap: 8px;">
                                    <span style="color: var(--fail); font-weight: 800;">${UI.escapeHTML(bug.severity)}</span>
                                    <span style="color: var(--text-muted);">•</span>
                                    <span style="color: var(--text-muted);">${new Date(bug.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div style="background: var(--bg-surface-elevated); padding: 16px; border-left: 1px solid var(--border);">
                                <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Descripción y Detalles</div>
                                <div style="font-size: 0.85rem; color: var(--text-main); line-height: 1.5; white-space: pre-wrap;">${UI.escapeHTML(bug.description || 'Sin descripción adicional.')}</div>
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
                Store.setUserStories(userStories || []);
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
                    if (ctx && ctx.epics) {
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
        const { config } = options;
        return `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🏢</div>
                <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Configuración de Jira</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Configura la conexión para el proyecto actual.</p>
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
                <div class="field-group">
                    <label class="field-label">Email de Usuario Jira</label>
                    <input type="email" id="jira-user-email" placeholder="usuario@empresa.com" value="${UI.escapeHTML(config?.jira_user_email || '')}" style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main);">
                </div>
                <div class="field-group">
                    <label class="field-label">Jira API Token</label>
                    <input type="password" id="jira-api-token" placeholder="${config?.has_token ? '••••••••••••••••' : 'Ingresa el token de Jira'}" style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px; color: var(--text-main);">
                    <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Este token se almacenará cifrado y nunca será expuesto al frontend.</p>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button class="btn btn-ghost" id="cancel-jira" style="flex: 1; padding: 14px;">Cancelar</button>
                    <button class="btn btn-primary" id="save-jira" style="flex: 2; padding: 14px;">Guardar Configuración</button>
                </div>
            </div>
        `;
    },

    bindJiraConfigEvents(overlay, options) {
        const close = () => {
            overlay.close();
            overlay.remove();
        };

        overlay.querySelector('#cancel-jira').addEventListener('click', close);

        overlay.querySelector('#save-jira').addEventListener('click', async () => {
            const data = {
                jira_domain: overlay.querySelector('#jira-domain').value.trim(),
                jira_project_key: overlay.querySelector('#jira-project-key').value.trim(),
                jira_user_email: overlay.querySelector('#jira-user-email').value.trim(),
                jira_api_token: overlay.querySelector('#jira-api-token').value.trim() || undefined
            };

            if (!data.jira_domain || !data.jira_project_key || !data.jira_user_email) {
                UI.toast('Todos los campos excepto el token son obligatorios', 'error');
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
                        <label class="field-label">Contraseña ${isEditing ? '<span style="font-size: 0.6rem; opacity: 0.6;">(Opcional)</span>' : ''}</label>
                        <input type="password" id="nu-pass" placeholder="••••••••">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <span class="field-label" style="display: block; margin-bottom: 12px; color: var(--brand); font-weight: 800; font-size: 0.7rem; text-transform: uppercase;">Permisos Granulares</span>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
                        <div>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Casos de Uso</span>
                                <input type="checkbox" id="nu-p-cu" ${user.permissions?.can_create_cu ? 'checked' : ''}>
                            </label>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Historias de Usuario</span>
                                <input type="checkbox" id="nu-p-hu" ${user.permissions?.can_create_hu ? 'checked' : ''}>
                            </label>
                        </div>
                        <div>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Test Suites</span>
                                <input type="checkbox" id="nu-p-suite" ${user.permissions?.can_create_suite ? 'checked' : ''}>
                            </label>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Test Cases</span>
                                <input type="checkbox" id="nu-p-test" ${user.permissions?.can_create_test ? 'checked' : ''}>
                            </label>
                        </div>
                        <div>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Ejecutar Pruebas</span>
                                <input type="checkbox" id="nu-p-exec" ${user.permissions?.can_execute_test ? 'checked' : ''}>
                            </label>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Gestionar Proyectos</span>
                                <input type="checkbox" id="nu-p-manage-proj" ${user.permissions?.can_manage_projects ? 'checked' : ''}>
                            </label>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Gestionar Usuarios</span>
                                <input type="checkbox" id="nu-p-manage-users" ${user.permissions?.can_manage_users ? 'checked' : ''}>
                            </label>
                            <label style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; cursor: pointer;">
                                <span>Configurar Jira</span>
                                <input type="checkbox" id="nu-p-config-jira" ${user.permissions?.can_configure_jira ? 'checked' : ''}>
                            </label>
                        </div>
                    </div>
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
                projects,
                permissions: {
                    can_create_cu: overlay.querySelector('#nu-p-cu').checked,
                    can_create_hu: overlay.querySelector('#nu-p-hu').checked,
                    can_create_suite: overlay.querySelector('#nu-p-suite').checked,
                    can_create_test: overlay.querySelector('#nu-p-test').checked,
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
                    <div class="result-box-title" style="color: #52c41a; font-size: 0.75rem; font-weight: 800; margin-bottom: 8px;">✔️ RESULTADO ESPERADO</div>
                    <div style="padding: 12px; background: rgba(82, 196, 26, 0.05); border: 1px solid rgba(82, 196, 26, 0.2); border-radius: 8px; min-height: 100px; font-size: 0.85rem;">
                        ${UI.escapeHTML(bug.expected_result || '—')}
                    </div>
                </div>
                <div class="field-group">
                    <div class="result-box-title" style="color: #ff4d4f; font-size: 0.75rem; font-weight: 800; margin-bottom: 8px;">❌ RESULTADO ACTUAL</div>
                    <div style="padding: 12px; background: rgba(255, 77, 79, 0.05); border: 1px solid rgba(255, 77, 79, 0.2); border-radius: 8px; min-height: 100px; font-size: 0.85rem;">
                        ${UI.escapeHTML(bug.actual_result || '—')}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: var(--bg-hover); padding: 20px; border-radius: 16px; margin-bottom: 32px;">
                <div class="field-group">
                    <label class="field-label">Severidad</label>
                    <span style="font-weight: 800; color: var(--fail);">${UI.escapeHTML(bug.severity)}</span>
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
                <p style="color: var(--text-muted); font-size: 0.85rem;">Sube una captura o video para respaldar el resultado.</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="field-group">
                    <label class="field-label">Categoría de Evidencia</label>
                    <select id="modal-evidence-category" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; color: var(--text-main);">
                        <option value="GENERAL">Evidencia General</option>
                        <option value="FIGMA">Diseño (Figma)</option>
                        <option value="DEV">Desarrollo (Sistema)</option>
                        <option value="BUG">Evidencia de Error</option>
                    </select>
                </div>

                <div class="field-group">
                    <label class="field-label">Seleccionar Archivo</label>
                    <div id="drop-zone" style="border: 2px dashed var(--border); border-radius: 12px; padding: 30px; text-align: center; cursor: pointer; transition: all 0.2s;">
                        <input type="file" id="modal-evidence-file" style="display: none;" accept="image/*,video/*">
                        <div id="file-info" style="font-size: 0.85rem; color: var(--text-muted);">
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
                <p style="color: var(--text-muted); font-size: 0.85rem;">Carga Historias de Usuario y sus Tests asociados de forma segura.</p>
            </div>

            <div style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <div style="font-size: 0.75rem; color: var(--brand); font-weight: 800; margin-bottom: 8px;">REQUISITOS DEL ARCHIVO:</div>
                <ul style="font-size: 0.75rem; color: var(--text-secondary); padding-left: 16px; margin: 0;">
                    <li><b>XLSX:</b> Hojas "historia de usuario" y "Casos de Prueba".</li>
                    <li><b>CSV:</b> Un solo archivo con columnas de HU y Tests.</li>
                    <li><b>Seguridad:</b> No se permiten scripts HTML ni fórmulas.</li>
                </ul>
            </div>

            <div class="field-group">
                <label class="field-label">Seleccionar Archivo (.xlsx, .csv)</label>
                <div id="import-drop-zone" style="border: 2px dashed var(--border); border-radius: 12px; padding: 30px; text-align: center; cursor: pointer;">
                    <input type="file" id="modal-import-file" style="display: none;" accept=".xlsx, .csv">
                    <div id="import-file-info" style="font-size: 0.85rem; color: var(--text-muted);">
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

            UI.showLoading();
            try {
                const formData = new FormData();
                formData.append('xlsx', file);

                // Llamamos al nuevo endpoint que no requiere suiteId previo
                const response = await fetch(`/api/use-cases/${options.useCaseId}/import-dual`, {
                    method: 'POST',
                    body: formData
                });

                const res = await response.json();
                if (!response.ok) throw new Error(res.error || 'Error en la importación');

                UI.toast(res.message);
                dialog.close();
                if (options.onSuccess) options.onSuccess();
            } catch (err) {
                UI.toast(err.message, 'error');
            }
            UI.hideLoading();
        };
    }
};
