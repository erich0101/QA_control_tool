import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { Modals } from './modals.js';
import { modalManager } from '../utils/modal-manager.js';

export const ExecutionTab = {
    selectedSuiteId: null,
    expandedSuiteId: null, // Control de expansión de suites activas
    expandedTCId: null,
    lastRefresh: null,
    projectSuites: [], // Caché local de suites del proyecto
    timerInterval: null, // Intervalo del cronómetro

    async render(container) {
        const scrollPos = container.scrollTop;
        const { activeProjectId, user } = Store.state;

        if (!activeProjectId) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚡</div>
                    <h3>Modo Ejecución</h3>
                    <p>Selecciona un proyecto para comenzar la ejecución.</p>
                </div>
            `;
            return;
        }

        // Cargar suites del proyecto si no las tenemos
        if (this.projectSuites.length === 0 || this.currentProjectId !== activeProjectId) {
            this.currentProjectId = activeProjectId;
            UI.showLoading();
            const res = await ApiService.getTestSuites(null, activeProjectId);
            this.projectSuites = res.testSuites || [];
            UI.hideLoading();
        }

        const activeSuites = this.projectSuites.filter(s => s.activeRun);
        const availableSuites = this.projectSuites.filter(s => !s.activeRun);
        const totalActiveTests = activeSuites.reduce((acc, s) => acc + (s.test_cases || []).length, 0);

        container.innerHTML = `
            <div class="tab-toolbar">
                <div class="tab-toolbar-left">
                    <span class="tab-toolbar-title">Ejecución de Pruebas</span>
                    <div style="display: flex; gap: 6px;">
                        <span class="tab-badge" title="Ciclos Activos">${activeSuites.length} Ciclos</span>
                        <span class="tab-badge" style="background: var(--brand); color: white;" title="Total de Pruebas en ejecución">${totalActiveTests} Tests</span>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn btn-ghost btn-sm" id="btn-refresh-exec" title="Sincronizar cambios">
                        🔄 ${this.lastRefresh ? `Sinc: ${this.lastRefresh}` : 'Sincronizar'}
                    </button>
                </div>
            </div>

            <div class="exec-layout" style="display: flex; flex-direction: column; gap: 32px; padding-bottom: 40px;">
                
                <!-- SECCION: CICLOS ACTIVOS -->
                <section>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 10px var(--ok);"></div>
                        <h2 style="font-size: 0.9rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Ciclos en Ejecución</h2>
                    </div>
                    
                    ${activeSuites.length === 0 ? `
                        <div class="empty-state" style="padding: 40px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border);">
                            <p style="color: var(--text-muted); font-size: 0.85rem;">No hay ciclos de prueba activos en este momento.</p>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 20px;">
                            ${activeSuites.map(s => this.renderActiveSuiteCard(s)).join('')}
                        </div>
                    `}
                </section>

            </div>
        `;

        this.bindEvents(container);
        container.scrollTop = scrollPos;
        this.startTimers();
    },

    startTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const timerElements = document.querySelectorAll('.suite-timer');
            timerElements.forEach(el => {
                const runId = parseInt(el.dataset.runId);
                const suite = this.projectSuites.find(s => s.activeRun?.id === runId);
                if (!suite || !suite.activeRun) return;

                let totalSeconds = suite.activeRun.accumulated_seconds || 0;
                if (suite.activeRun.status === 'RUNNING') {
                    const lastResume = new Date(suite.activeRun.last_resume_at);
                    const now = new Date();
                    const delta = Math.floor((now - lastResume) / 1000);
                    totalSeconds += delta;
                }

                const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
                const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
                const secs = (totalSeconds % 60).toString().padStart(2, '0');
                el.innerText = `${hrs}:${mins}:${secs}`;
            });
        }, 1000);
    },

    // Flag para evitar múltiples listeners
    _isListening: false,
    setupRealtimeListener() {
        if (this._isListening) return;

        window.addEventListener('realtime-refresh', async () => {
            // Limpiar caché SIEMPRE que ocurra un cambio en el sistema
            // Esto asegura que la próxima vez que se renderice la pestaña, los datos sean frescos
            this.projectSuites = []; 
            console.log('⚡ Realtime: Execution cache invalidated.');

            const container = document.getElementById('tab-content');
            if (Store.state.activeTab === 'execution' && container) {
                console.log('⚡ Realtime: Refreshing Execution UI...');
                await this.render(container);
                this.lastRefresh = new Date().toLocaleTimeString();
            }
        });
        this._isListening = true;
    },

    renderActiveSuiteCard(suite) {
        const { user } = Store.state;
        const isExpanded = this.expandedSuiteId === suite.id;
        const tcs = suite.test_cases || [];
        const myTestsCount = tcs.filter(tc => tc.assigned_to === user?.id).length;
        const executedCount = tcs.filter(t => t.status && t.status !== 'PENDING' && t.status !== '').length;
        const totalCount = tcs.length;
        const progress = totalCount > 0 ? Math.round((executedCount / totalCount) * 100) : 0;
        const responsible = (Store.state.team || []).find(u => u.id === suite.assigned_to);

        return `
            <div class="tt-suite-row ${isExpanded ? 'is-open' : ''}" data-suite-id="${suite.id}" style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-surface);">
                <div class="tt-suite-header suite-exec-header" data-suite-id="${suite.id}" style="padding: 16px 24px; display: flex; align-items: center; gap: 20px;">
                    <span class="tt-toggle" style="font-size: 10px;">${isExpanded ? '▼' : '▶'}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-pill ${suite.activeRun.status === 'RUNNING' ? 'ok' : 'warn'}" style="background: ${suite.activeRun.status === 'RUNNING' ? 'rgba(82, 196, 26, 0.1)' : 'rgba(250, 173, 20, 0.1)'}; color: ${suite.activeRun.status === 'RUNNING' ? '#52c41a' : '#faad14'}; font-weight: 800; padding: 4px 12px; border-radius: 6px; font-size: 0.65rem; min-width: 90px; text-align: center;">
                            ${suite.activeRun.status === 'RUNNING' ? 'EJECUTANDO' : 'PAUSADO'}
                        </span>
                        <span class="suite-timer" data-run-id="${suite.activeRun.id}" style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: var(--text-main); min-width: 70px;">00:00:00</span>
                    </div>
                    
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--brand);">${UI.escapeHTML(suite.key_id || 'TS-000')}</span>
                    <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-main); flex: 1;">${UI.escapeHTML(suite.title)}</span>
                    
                    <div style="display: flex; align-items: center; gap: 24px;">
                        <span style="font-size: 0.8rem; color: var(--text-secondary); opacity: 0.8;">— ${myTestsCount} mis tests</span>
                        <div style="width: 150px; display: flex; align-items: center; gap: 12px;">
                            <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                                <div style="width: ${progress}%; height: 100%; background: var(--brand); transition: width 0.3s;"></div>
                            </div>
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); width: 30px;">${progress}%</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            ${suite.activeRun.status === 'RUNNING' ? `
                                <button class="btn btn-pause-run btn-sm" data-run-id="${suite.activeRun.id}" style="background: rgba(250, 173, 20, 0.1); color: #faad14; border: 1px solid rgba(250, 173, 20, 0.2); font-weight: 700;" title="Pausar ciclo">⏸️ Pausar</button>
                            ` : `
                                <button class="btn btn-resume-run btn-sm" data-run-id="${suite.activeRun.id}" style="background: rgba(82, 196, 26, 0.1); color: #52c41a; border: 1px solid rgba(82, 196, 26, 0.2); font-weight: 700;" title="Reanudar ciclo">▶️ Reanudar</button>
                            `}
                            ${suite.assigned_to === user?.id || user?.role === 'Admin' || user?.role === 'Analista QA' ? `
                                <button class="btn btn-finish-run btn-sm" data-suite-id="${suite.id}" style="background: rgba(255, 77, 79, 0.1); color: #ff4d4f; border: 1px solid rgba(255, 77, 79, 0.2); font-weight: 700;">Finalizar Ciclo</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="tt-tc-group" style="padding: 0 24px 24px 24px; background: rgba(0,0,0,0.1);">
                        <div style="padding: 16px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; font-size: 0.85rem; color: var(--text-secondary);">
                            ${UI.escapeHTML(suite.description || 'Sin descripción.')}
                        </div>
                        ${tcs.map(tc => this.renderTestCard(tc)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    renderTestCard(tc) {
        const { user } = Store.state;
        const isAssigned = tc.assigned_to === user?.id;
        const isExpanded = this.expandedTCId === tc.id;
        const status = tc.status || 'PENDING';
        const isLocked = status !== 'PENDING';
        
        // Buscar el label del escenario (E1, E2...)
        let scenarioLabel = '';
        if (tc.scenario_id) {
            const us = Store.state.userStories.find(u => u.id === tc.us_id);
            if (us && us.scenarios) {
                const idx = us.scenarios.findIndex(s => s.id === tc.scenario_id);
                if (idx !== -1) scenarioLabel = `E${idx + 1}`;
            }
        }

        return `
            <div class="tt-tc-row ${isExpanded ? 'is-open' : ''}" data-tc-id="${tc.id}" style="background: transparent; margin-bottom: 8px;">
                <div class="tt-tc-header test-card-header" data-tc-id="${tc.id}" style="padding: 6px 0; border: none; background: transparent; display: flex; align-items: center; gap: 12px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${status === 'PASS' || status === 'OK' ? '#52c41a' : (status === 'FAIL' ? '#ff4d4f' : (status === 'BLOCK' ? '#fadb14' : (status === 'SKIPPED' ? '#595959' : 'var(--text-muted)')))};"></span>
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--brand); min-width: 45px;">${UI.escapeHTML(tc.key_id || 'TC-000')}</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); flex: 1;">${UI.escapeHTML(tc.title)}</span>
                    ${scenarioLabel ? `<span class="scenario-badge mini" style="font-size: 8px; padding: 1px 4px; margin-right: 8px;">${scenarioLabel}</span>` : ''}

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-pill ${status.toLowerCase()}" style="font-size: 0.6rem; padding: 1px 6px; font-weight: 800; border-radius: 4px;">${status}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">${isExpanded ? '▲' : '▼'}</span>
                    </div>
                </div>

                ${isExpanded ? `
                    <div class="test-exec-detail" style="padding: 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; margin-top: 4px;">
                        <div class="bug-result-compare" style="margin-bottom: 24px;">
                            <div class="field-group">
                                <label class="field-label">Instrucciones / Pasos</label>
                                <div class="result-box" style="min-height: 80px; font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap;">${UI.highlightSteps(tc.steps || 'Sin pasos.')}</div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Resultado Esperado</label>
                                <div class="result-box" style="min-height: 80px; font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap;">${UI.escapeHTML(tc.expected_result || 'Sin resultado.')}</div>
                            </div>
                        </div>

                        <!-- Panel de Reporte de Defecto (Solo si FAIL) -->
                        <div class="bug-report-panel" id="bug-panel-${tc.id}" style="display: ${status === 'FAIL' ? 'block' : 'none'};">
                            <div class="bug-report-header">
                                <span style="font-size: 0.75rem; font-weight: 800; color: #ff4d4f; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 1.1rem;">🐞</span> REPORTE DE DEFECTO (BUG)
                                </span>
                                <span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.8;">⚠️ Se creará un ticket automáticamente al guardar</span>
                            </div>
                            <div class="bug-report-body">
                                <div class="field-group">
                                    <label class="field-label">Título del Bug</label>
                                    <input type="text" class="bug-input" data-field="title" data-tc-id="${tc.id}" placeholder="Resumen conciso del error..." value="Error en: ${UI.escapeHTML(tc.title)}" ${isLocked ? 'disabled' : ''}>
                                </div>
                                
                                <div class="field-group">
                                    <label class="field-label">Descripción General</label>
                                    <textarea class="bug-input" data-field="description" data-tc-id="${tc.id}" placeholder="Contexto del error..." style="min-height: 80px;" ${isLocked ? 'disabled' : ''}></textarea>
                                </div>

                                <div class="field-group">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <label class="field-label">Pasos para reproducir</label>
                                        ${!isLocked ? `<button class="btn btn-ghost btn-sm btn-copy-steps" data-tc-id="${tc.id}" style="font-size: 0.65rem; color: var(--brand);">Copiar del Test Case</button>` : ''}
                                    </div>
                                    <textarea class="bug-input" data-field="steps_to_reproduce" data-tc-id="${tc.id}" placeholder="1. ..." style="min-height: 120px;" ${isLocked ? 'disabled' : ''}></textarea>
                                </div>

                                <div class="bug-result-compare">
                                    <div class="field-group">
                                        <div class="result-box-title" style="color: #52c41a;">✔️ Resultado Esperado</div>
                                        <textarea class="bug-input" data-field="expected_result" data-tc-id="${tc.id}" style="min-height: 100px;" ${isLocked ? 'disabled' : ''}>${UI.escapeHTML(tc.expected_result || '')}</textarea>
                                    </div>
                                    <div class="field-group">
                                        <div class="result-box-title" style="color: #ff4d4f;">❌ Resultado Actual</div>
                                        <textarea class="bug-input" data-field="actual_result" data-tc-id="${tc.id}" placeholder="¿Qué pasó realmente?" style="min-height: 100px;" ${isLocked ? 'disabled' : ''}></textarea>
                                    </div>
                                </div>

                                <div class="bug-grid-impact">
                                    <div class="field-group">
                                        <label class="field-label">Frecuencia</label>
                                        <select class="bug-input" data-field="frequency" data-tc-id="${tc.id}" ${isLocked ? 'disabled' : ''}>
                                            <option value="Siempre">Siempre</option>
                                            <option value="Intermitente">Intermitente</option>
                                            <option value="Una vez">Una vez</option>
                                        </select>
                                    </div>
                                    <div class="field-group">
                                        <label class="field-label">Severidad</label>
                                        <select class="bug-input" data-field="severity" data-tc-id="${tc.id}" ${isLocked ? 'disabled' : ''}>
                                            <option value="Crítica">Crítica</option>
                                            <option value="Alta" selected>Alta</option>
                                            <option value="Media">Media</option>
                                            <option value="Baja">Baja</option>
                                        </select>
                                    </div>
                                    <div class="field-group">
                                        <label class="field-label">Impacto en el negocio</label>
                                        <input type="text" class="bug-input" data-field="business_impact" data-tc-id="${tc.id}" placeholder="Ej: Bloquea edición..." ${isLocked ? 'disabled' : ''}>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel de Justificación de Bloqueo (Solo si BLOCK) -->
                        <div class="block-report-panel" id="block-panel-${tc.id}" style="display: ${status === 'BLOCK' ? 'block' : 'none'}; margin-top: 16px; padding: 16px; background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px;">
                            <label class="field-label" style="color: var(--warn); font-weight: 800; font-size: 0.7rem; margin-bottom: 8px; display: block;">⚠️ JUSTIFICACIÓN DEL BLOQUEO</label>
                            <textarea class="block-input" data-tc-id="${tc.id}" placeholder="Indica por qué no se pudo ejecutar este test..." style="width: 100%; min-height: 80px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-main); font-size: 0.85rem;" ${isLocked ? 'disabled' : ''}>${UI.escapeHTML(tc.observations || '')}</textarea>
                        </div>

                        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <label class="field-label" style="margin: 0;">🖼️ EVIDENCIAS (${(tc.attachments || []).length})</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <span style="font-size: 0.65rem; color: var(--text-muted);">Categoría:</span>
                                    <select class="evidence-category-inline" data-tc-id="${tc.id}" style="font-size: 0.7rem; background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; color: var(--text-secondary);">
                                        <option value="GENERAL">General</option>
                                        <option value="FIGMA">Figma</option>
                                        <option value="DEV">Sistema</option>
                                        <option value="BUG">Error</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Zona de Carga Inline -->
                            <div class="drop-zone-inline" data-tc-id="${tc.id}" style="border: 2px dashed var(--border); border-radius: 12px; padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.01); margin-bottom: 16px;">
                                <input type="file" class="file-input-inline" data-tc-id="${tc.id}" style="display: none;" accept="image/*,video/*">
                                <div style="font-size: 0.8rem; color: var(--text-muted); pointer-events: none;">
                                    <span style="color: var(--brand); font-weight: 700;">Pega (Ctrl+V)</span>, arrastra o haz clic aquí para adjuntar evidencia
                                </div>
                            </div>

                            <div class="evidence-grid-mini" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px;">
                                ${this.renderAttachments(tc)}
                            </div>
                        </div>

                        <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 20px;">
                             ${isLocked ? `
                                <div style="display: flex; align-items: center; gap: 8px; color: var(--ok); font-weight: 800; font-size: 0.75rem;">
                                    <span>🔒 RESULTADO CERRADO</span>
                                </div>
                                <div class="execution-status-group" style="background: transparent; border: none; padding: 0;">
                                    <button class="btn-status pass ${status === 'PASS' || status === 'OK' ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.65rem;" disabled>✔️ PASS</button>
                                    <button class="btn-status fail ${status === 'FAIL' ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.65rem;" disabled>❌ FAIL</button>
                                    <button class="btn-status block ${status === 'BLOCK' ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.65rem;" disabled>⚠️ BLOCK</button>
                                    <button class="btn-status skipped ${status === 'SKIPPED' ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.65rem;" disabled>⏭️ SKIP</button>
                                </div>
                             ` : `
                                <div class="execution-status-group" style="background: transparent; border: none; padding: 0;">
                                    <button class="btn-status pass ${status === 'PASS' || status === 'OK' ? 'active' : ''}" data-status="PASS" data-tc-id="${tc.id}" style="padding: 4px 10px; font-size: 0.65rem;">✔️ PASS</button>
                                    <button class="btn-status fail ${status === 'FAIL' ? 'active' : ''}" data-status="FAIL" data-tc-id="${tc.id}" style="padding: 4px 10px; font-size: 0.65rem;">❌ FAIL</button>
                                    <button class="btn-status block ${status === 'BLOCK' ? 'active' : ''}" data-status="BLOCK" data-tc-id="${tc.id}" style="padding: 4px 10px; font-size: 0.65rem;">⚠️ BLOCK</button>
                                    <button class="btn-status skipped ${status === 'SKIPPED' ? 'active' : ''}" data-status="SKIPPED" data-tc-id="${tc.id}" style="padding: 4px 10px; font-size: 0.65rem;">⏭️ SKIP</button>
                                </div>
                                <button class="btn btn-primary btn-save-exec-pro btn-sm" data-tc-id="${tc.id}" style="padding-left: 24px; padding-right: 24px; font-weight: 800; height: 32px;">GUARDAR RESULTADO</button>
                             `}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    renderAttachments(tc) {
        const atts = tc.attachments || [];
        return atts.map(att => {
            const label = att.category || 'GENERAL';
            const color = label === 'FIGMA' ? '#ff7262' : (label === 'DEV' ? '#3b82f6' : 'var(--text-muted)');
            
            return `
                <div class="evidence-item" style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
                    <img src="/${att.src}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="UI.showImageZoom('/${att.src}')">
                    <div style="position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; color: ${color}; border: 1px solid ${color}44;">
                        ${label}
                    </div>
                    <button class="clear-exec-evidence" data-tc-id="${tc.id}" data-att-id="${att.id}" style="position: absolute; top: 4px; right: 4px; background: var(--fail); border: none; border-radius: 4px; color: white; font-size: 0.6rem; padding: 2px 4px; cursor: pointer; opacity: 0.8;">✕</button>
                </div>
            `;
        }).join('');
    },
    
    async handleCreateBug(tcId, container) {
        const suite = this.projectSuites.find(s => s.test_cases.some(tc => tc.id === tcId));
        const tc = suite.test_cases.find(t => t.id === tcId);

        if (!tc.execution_id) {
            UI.toast('Debes guardar el resultado primero para generar un ID de ejecución.', 'warn');
            return;
        }

        Modals.render('new-bug', {
            executionId: tc.execution_id,
            defaultTitle: `Bug en: ${tc.title}`,
            onSuccess: async () => {
                const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                this.projectSuites = resSuites.testSuites || [];
                this.render(container);
            }
        });
    },

    bindEvents(container) {
        // Auto-resize textareas
        container.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });

                // Botones de Status (Badge style)
                container.querySelectorAll('.btn-status').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const tcId = parseInt(btn.dataset.tcId);
                        const status = btn.dataset.status;

                        // Actualizar UI localmente
                        btn.parentElement.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        // Mostrar/Ocultar paneles
                        const bugPanel = container.querySelector(`#bug-panel-${tcId}`);
                        const blockPanel = container.querySelector(`#block-panel-${tcId}`);
                        
                        if (bugPanel) bugPanel.style.display = status === 'FAIL' ? 'block' : 'none';
                        if (blockPanel) blockPanel.style.display = status === 'BLOCK' ? 'block' : 'none';

                        if (status === 'FAIL' || status === 'BLOCK') {
                            const panel = status === 'FAIL' ? bugPanel : blockPanel;
                            // Auto-scroll removed - user should scroll manually if needed
                        }
                    });
                });

        // Copiar pasos
        container.querySelectorAll('.btn-copy-steps').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tcId = parseInt(btn.dataset.tcId);
                const suite = this.projectSuites.find(s => s.test_cases.some(tc => tc.id === tcId));
                const tc = suite.test_cases.find(t => t.id === tcId);
                const stepsArea = container.querySelector(`.bug-input[data-field="steps_to_reproduce"][data-tc-id="${tcId}"]`);
                if (stepsArea) stepsArea.value = tc.steps || '';
            });
        });

        // Guardar Ejecución Profesional
        container.querySelectorAll('.btn-save-exec-pro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tcId = parseInt(btn.dataset.tcId);
                const statusBtn = container.querySelector(`.btn-status.active[data-tc-id="${tcId}"]`);
                if (!statusBtn) return UI.toast('Selecciona un resultado (PASS/FAIL/BLOCK)', 'warn');
                
                const status = statusBtn.dataset.status;
                const payload = { status };

                if (status === 'BLOCK') {
                    const blockInput = container.querySelector(`.block-input[data-tc-id="${tcId}"]`);
                    payload.observations = blockInput ? blockInput.value : 'Bloqueado sin observaciones.';
                }

                if (status === 'FAIL') {
                    const bugInputs = container.querySelectorAll(`.bug-input[data-tc-id="${tcId}"]`);
                    bugInputs.forEach(input => {
                        payload[`bug_${input.dataset.field}`] = input.value;
                    });
                }

                UI.showLoading();
                const res = await ApiService.updateTestCase(tcId, payload);
                if (res.ok) {
                    const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                    this.projectSuites = resSuites.testSuites || [];
                    this.render(container);
                    UI.toast('Resultado y reporte guardados');
                }
                UI.hideLoading();
            });
        });

        // Evidencias Inline Logic
        container.querySelectorAll('.drop-zone-inline').forEach(zone => {
            const tcId = parseInt(zone.dataset.tcId);
            const fileInput = zone.querySelector('.file-input-inline');

            const uploadFile = async (file) => {
                if (!file) return;
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                    return UI.toast('Solo se permiten imágenes o videos', 'warn');
                }

                UI.showLoading();
                try {
                    const category = container.querySelector(`.evidence-category-inline[data-tc-id="${tcId}"]`).value;
                    const formData = new FormData();
                    formData.append('evidence', file);
                    formData.append('tc_id', tcId);
                    formData.append('category', category);

                    const response = await fetch('/api/evidence', { method: 'POST', body: formData });
                    if (!response.ok) throw new Error('Error al subir evidencia');

                    UI.toast('Evidencia adjuntada');
                    // Recargar suites
                    const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                    this.projectSuites = resSuites.testSuites || [];
                    this.render(container);
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            };

            zone.onclick = () => fileInput.click();
            fileInput.onchange = (e) => uploadFile(e.target.files[0]);

            zone.ondragover = (e) => { e.preventDefault(); zone.style.borderColor = 'var(--brand)'; zone.style.background = 'rgba(59, 130, 246, 0.05)'; };
            zone.ondragleave = () => { zone.style.borderColor = 'var(--border)'; zone.style.background = 'transparent'; };
            zone.ondrop = (e) => { e.preventDefault(); uploadFile(e.dataTransfer.files[0]); };
        });

        // SOPORTE PARA PEGAR GLOBAL (Se activa si hay una card expandida)
        const globalPasteHandler = (e) => {
            if (this.expandedTCId) {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        // Disparar subida para el TC expandido
                        const zone = container.querySelector(`.drop-zone-inline[data-tc-id="${this.expandedTCId}"]`);
                        if (zone) {
                            // Simulamos la subida (ya tenemos tcId)
                            const uploadFn = async (f) => {
                                UI.showLoading();
                                try {
                                    const category = container.querySelector(`.evidence-category-inline[data-tc-id="${this.expandedTCId}"]`).value;
                                    const formData = new FormData();
                                    formData.append('evidence', f);
                                    formData.append('tc_id', this.expandedTCId);
                                    formData.append('category', category);

                                    const response = await fetch('/api/evidence', { method: 'POST', body: formData });
                                    if (response.ok) {
                                        UI.toast('Evidencia pegada');
                                        const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                                        this.projectSuites = resSuites.testSuites || [];
                                        this.render(container);
                                    }
                                } catch (err) { UI.toast(err.message, 'error'); }
                                UI.hideLoading();
                            };
                            uploadFn(file);
                        }
                        break;
                    }
                }
            }
        };
        window.addEventListener('paste', globalPasteHandler);

        // Limpiar el listener viejo si existe
        if (this._lastPasteHandler) window.removeEventListener('paste', this._lastPasteHandler);
        this._lastPasteHandler = globalPasteHandler;

        container.querySelectorAll('.suite-exec-header').forEach(header => {
            header.addEventListener('click', () => {
                const id = parseInt(header.dataset.suiteId);
                this.expandedSuiteId = this.expandedSuiteId === id ? null : id;
                this.render(container);
            });
        });

        // Iniciar Run Inteligente (Wizard)
        container.querySelectorAll('.btn-start-run').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const suiteId = parseInt(btn.dataset.suiteId);
                const suite = this.projectSuites.find(s => s.id === suiteId);
                
                Modals.render('start-run-wizard', {
                    suite,
                    onSuccess: async () => {
                        const res = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                        this.projectSuites = res.testSuites || [];
                        this.render(container);
                    }
                });
            });
        });

        // Finalizar Run
        container.querySelectorAll('.btn-finish-run').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Modals.render('confirm', {
                    title: 'Finalizar Ciclo',
                    msg: '¿Deseas finalizar este ciclo de ejecución? Esto enviará los resultados al histórico.',
                    onConfirm: async () => {
                        const suiteId = btn.dataset.suiteId;
                        UI.showLoading();
                        try {
                            await ApiService.finishRun(suiteId);
                            const res = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                            this.projectSuites = res.testSuites || [];
                            this.render(container);
                            UI.toast('Ciclo finalizado y guardado en histórico');
                        } catch (err) {
                            UI.toast(err.message, 'error');
                        }
                        UI.hideLoading();
                    }
                });
            });
        });

        container.querySelector('#btn-refresh-exec')?.addEventListener('click', async () => {
            UI.showLoading();
            const res = await ApiService.getTestSuites(null, Store.state.activeProjectId);
            this.projectSuites = res.testSuites || [];
            this.lastRefresh = new Date().toLocaleTimeString();
            this.render(container);
            UI.hideLoading();
            UI.toast('Estado sincronizado');
        });

        container.querySelectorAll('.test-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(header.dataset.tcId);
                this.expandedTCId = this.expandedTCId === id ? null : id;
                this.render(container);
            });
        });

        // Borrar evidencia
        container.querySelectorAll('.clear-exec-evidence').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const attId = btn.dataset.attId;
                if (!await modalManager.confirm('¿Eliminar esta evidencia?')) return;

                UI.showLoading();
                const res = await fetch(`/api/evidence/${attId}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                }).then(r => r.json());

                if (res.ok) {
                    const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                    this.projectSuites = resSuites.testSuites || [];
                   await this.render(container);
                }
                UI.hideLoading();
            });
        });

        // Pause Run
        container.querySelectorAll('.btn-pause-run').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const runId = parseInt(btn.dataset.runId);
                UI.showLoading();
                const res = await ApiService.pauseRun(runId);
                if (res.ok) {
                    // Actualizar localmente
                    const suite = this.projectSuites.find(s => s.activeRun?.id === runId);
                    if (suite) {
                        suite.activeRun.status = 'PAUSED';
                        suite.activeRun.accumulated_seconds = res.accumulated_seconds;
                        suite.activeRun.last_resume_at = null;
                    }
                    await this.render(container);
                }
                UI.hideLoading();
            });
        });

        // Resume Run
        container.querySelectorAll('.btn-resume-run').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const runId = parseInt(btn.dataset.runId);
                UI.showLoading();
                const res = await ApiService.resumeRun(runId);
                if (res.ok) {
                    const suite = this.projectSuites.find(s => s.activeRun?.id === runId);
                    if (suite) {
                        suite.activeRun.status = 'RUNNING';
                        suite.activeRun.last_resume_at = new Date().toISOString();
                    }
                    await this.render(container);
                }
                UI.hideLoading();
            });
        });

        // Crear Bug
        container.querySelectorAll('.btn-create-bug').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                await this.handleCreateBug(tcId, container);
            });
        });

        // Marcar Bug como FIXED
        container.querySelectorAll('.btn-mark-fixed').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const bugId = btn.dataset.bugId;
                if (!await modalManager.confirm('¿Marcar este bug como FIXED?')) return;

                UI.showLoading();
                try {
                    const res = await ApiService.updateDefectStatus(bugId, 'FIXED');
                    if (res.ok) {
                        UI.toast('✅ Bug marcado como FIXED');
                        // Recargar suites
                        const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                        this.projectSuites = resSuites.testSuites || [];
                        this.render(container);
                    }
                } catch (err) {
                    UI.toast(err.message, 'error');
                }
                UI.hideLoading();
            });
        });
    }
};
