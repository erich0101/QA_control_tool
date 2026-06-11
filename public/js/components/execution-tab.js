import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { Modals } from './modals.js';
import { modalManager } from '../utils/modal-manager.js';

window.ExecutionTab = null;

export const ExecutionTab = {
    expandedSuiteId: null,
    expandedTCId: null,
    detailTab: 'steps',
    lastRefresh: null,
    projectSuites: [],
    timerInterval: null,
    selectedCUId: localStorage.getItem('execSelectedCU') ? parseInt(localStorage.getItem('execSelectedCU')) : null,
    searchQuery: '',
    filterStatus: 'all',
    _isListening: false,
    _lastScroll: 0,

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

        if (this.projectSuites.length === 0 || this.currentProjectId !== activeProjectId) {
            this.currentProjectId = activeProjectId;
            UI.showLoading();
            const res = await ApiService.getTestSuites(null, activeProjectId);
            this.projectSuites = res.testSuites || [];
            UI.hideLoading();
        }

        const activeSuites = this.projectSuites.filter(s => s.activeRun);
        const totalActiveTests = activeSuites.reduce((acc, s) => acc + (s.test_cases || []).length, 0);

        if (activeSuites.length > 0 && !this.expandedSuiteId) {
            this.expandedSuiteId = activeSuites[0].id;
        }

        container.innerHTML = `
            <div class="exec-flat-layout">
                ${this.renderToolbar(activeSuites, totalActiveTests)}
                <div class="exec-tree-container">
                    ${this.renderSuiteTree(activeSuites)}
                </div>
            </div>
        `;

        this.bindEvents(container);

        const newContainer = container.querySelector('.exec-tree-container');
        if (newContainer && scrollPos > 0) {
            newContainer.scrollTop = scrollPos;
        }

        this.startTimers();
    },

    renderToolbar(activeSuites, totalActiveTests) {
        return `
            <div class="exec-toolbar">
                <div class="exec-toolbar-left">
                    <span class="exec-toolbar-title">EJECUCIÓN</span>
                    <span class="tab-badge" title="Ciclos Activos">${activeSuites.length}</span>
                    <span class="tab-badge tab-badge-brand" title="Total de Pruebas">${totalActiveTests}</span>
                </div>
                <div class="exec-toolbar-center">
                    <select id="cu-exec-filter" class="exec-filter-select">
                        <option value="">— Seleccionar Caso de Uso —</option>
                        ${Store.state.useCases.map(cu => `<option value="${cu.id}" ${cu.id === this.selectedCUId ? 'selected' : ''}>${UI.escapeHTML(cu.title)}</option>`).join('')}
                    </select>
                    <button id="btn-exec-cu" class="btn btn-primary btn-sm" title="Ejecutar todas las suites de este Caso de Uso">▶ Ejecutar CU</button>
                </div>
                <div class="exec-toolbar-right">
                    <input type="text" id="exec-search" placeholder="🔍 Buscar..." value="${UI.escapeHTML(this.searchQuery)}" class="exec-search-input" />
                    <select id="exec-filter-status" class="exec-filter-select">
                        <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>Todos</option>
                        <option value="PENDING" ${this.filterStatus === 'PENDING' ? 'selected' : ''}>Pendientes</option>
                        <option value="PASS" ${this.filterStatus === 'PASS' ? 'selected' : ''}>Pasados</option>
                        <option value="FAIL" ${this.filterStatus === 'FAIL' ? 'selected' : ''}>Fallidos</option>
                        <option value="BLOCK" ${this.filterStatus === 'BLOCK' ? 'selected' : ''}>Bloqueados</option>
                        <option value="SKIP" ${this.filterStatus === 'SKIP' ? 'selected' : ''}>Saltados</option>
                    </select>
                    <button id="btn-refresh-exec" class="btn btn-ghost btn-sm" title="Sincronizar">Sincronizar</button>
                </div>
            </div>
        `;
    },

    renderSuiteTree(suites) {
        if (suites.length === 0) {
            return `<div class="exec-empty">No hay ciclos activos</div>`;
        }

        let html = '';
        suites.forEach((suite, idx) => {
            const isLastSuite = idx === suites.length - 1;
            const prefix = isLastSuite ? '└─' : '├─';
            const childPrefix = isLastSuite ? '   ' : '│  ';
            html += this.renderSuiteRow(suite, prefix, childPrefix);
        });
        return html;
    },

    renderSuiteRow(suite, prefix, childPrefix) {
        const isExpanded = this.expandedSuiteId === suite.id;
        const tcs = suite.test_cases || [];
        const executedCount = tcs.filter(t => t.status && t.status !== 'PENDING' && t.status !== '').length;
        const totalCount = tcs.length;
        const progress = totalCount > 0 ? Math.round((executedCount / totalCount) * 100) : 0;
        const statusClass = suite.activeRun.status === 'RUNNING' ? 'running' : 'paused';
        const statusLabel = suite.activeRun.status === 'RUNNING' ? 'EJECUTANDO' : 'PAUSADO';

        let filteredTcs = tcs;
        if (this.selectedCUId) {
            const us = Store.state.userStories.find(u => u.use_case_id === this.selectedCUId);
            if (us) {
                filteredTcs = filteredTcs.filter(tc => tc.us_id === us.id);
            }
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filteredTcs = filteredTcs.filter(tc =>
                (tc.title || '').toLowerCase().includes(q) ||
                (tc.key_id || '').toLowerCase().includes(q)
            );
        }
        if (this.filterStatus !== 'all') {
            filteredTcs = filteredTcs.filter(tc => tc.status === this.filterStatus);
        }

        const tcHtml = isExpanded ? this.renderTCList(filteredTcs, suite, childPrefix) : '';

        return `
            <div class="exec-suite-row" data-suite-id="${suite.id}">
                <div class="suite-row-main ${isExpanded ? 'expanded' : ''}" onclick="ExecutionTab.toggleSuite(${suite.id})">
                    <span class="tree-prefix">${prefix}</span>
                    <span class="suite-arrow">${isExpanded ? '▼' : '▶'}</span>
                    <span class="suite-line">━━━━━━━━</span>
                    <span class="suite-label">SUITE #${suite.id}</span>
                    <span class="suite-title">${UI.escapeHTML(suite.title)}</span>
                    <span class="status-pill ${statusClass}">${statusLabel}</span>
                    <span class="suite-timer exec-suite-timer" data-run-id="${suite.activeRun.id}">00:00:00</span>
                    <span class="suite-progress">${progress}% (${executedCount}/${totalCount})</span>
                    <div class="suite-actions">
                        ${suite.activeRun.status === 'RUNNING' ? `
                            <button class="btn-text btn-pause-run" data-run-id="${suite.activeRun.id}">Pausar</button>
                        ` : `
                            <button class="btn-text btn-resume-run" data-run-id="${suite.activeRun.id}">Reanudar</button>
                        `}
                        <button class="btn-text btn-finish-run" data-suite-id="${suite.id}">Finalizar</button>
                    </div>
                </div>
                <div class="suite-children ${isExpanded ? 'visible' : ''}">
                    ${tcHtml}
                </div>
            </div>
        `;
    },

    renderTCList(tcs, suite, childPrefix) {
        if (tcs.length === 0) {
            return `<div class="tc-empty">Sin casos de prueba</div>`;
        }

        let html = '';
        tcs.forEach((tc, idx) => {
            const isLast = idx === tcs.length - 1;
            const prefix = isLast ? '└──' : '├──';
            html += this.renderTCRow(tc, suite, childPrefix, prefix, isLast);
        });
        return html;
    },

    renderTCRow(tc, suite, childPrefix, prefix, isLast) {
        const statusClass = (tc.status || 'pending').toLowerCase();
        const isExpanded = this.expandedTCId === tc.id;
        const status = tc.status || 'PENDING';
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);

        let scenarioLabel = '';
        if (tc.scenario_id) {
            const us = Store.state.userStories.find(u => u.id === tc.us_id);
            if (us && us.scenarios) {
                const idx = us.scenarios.findIndex(s => s.id === tc.scenario_id);
                if (idx !== -1) scenarioLabel = `E${idx + 1}`;
            }
        }

        let scenarioBadge = scenarioLabel ? `<span class="tc-scenario-badge">${scenarioLabel}</span>` : '';

        return `
            <div class="exec-tc-row ${isExpanded ? 'expanded' : ''}" data-tc-id="${tc.id}">
                <div class="tc-row-main" onclick="ExecutionTab.toggleTC(${tc.id}, event)">
                    <span class="tree-prefix">${childPrefix}${prefix}</span>
                    <span class="tc-status-dot status-${statusClass}" style="background: ${this.getStatusColor(status)};"></span>
                    <span class="tc-key">${UI.escapeHTML(tc.key_id || 'TC')}</span>
                    ${scenarioBadge}
                    <span class="tc-title">${UI.escapeHTML(tc.title)}</span>
                    <span class="tc-status-label status-${statusClass}">${status}</span>
                    <span class="tc-arrow">${isExpanded ? '▼' : '▶'}</span>
                    ${assignee ? `<span class="tc-assignee">${UI.escapeHTML(assignee.name.split(' ')[0])}</span>` : ''}
                    <div class="tc-actions">
                        ${status === 'PENDING' ? `
                            <button class="btn-text btn-run-tc" data-tc-id="${tc.id}">Ejecutar</button>
                        ` : ''}
                        <button class="btn-text btn-create-bug" data-tc-id="${tc.id}">Crear Bug</button>
                    </div>
                </div>
                <div class="tc-expanded ${isExpanded ? 'visible' : ''}">
                    ${isExpanded ? this.renderExpandedDetail(tc, suite) : ''}
                </div>
            </div>
        `;
    },

    renderExpandedDetail(tc, suite) {
        const status = tc.status || 'PENDING';
        const isLocked = status !== 'PENDING' && status !== '';
        const assignee = (Store.state.team || []).find(u => u.id === tc.assigned_to);

        return `
            <div class="tc-detail">
                ${assignee ? `<div class="tc-detail-assignee">Asignado: ${UI.escapeHTML(assignee.name)}</div>` : ''}
                <div class="tc-detail-tabs">
                    <button class="tc-tab ${this.detailTab === 'steps' ? 'active' : ''}" data-tab="steps" data-tc-id="${tc.id}">Pasos</button>
                    <button class="tc-tab ${this.detailTab === 'expected' ? 'active' : ''}" data-tab="expected" data-tc-id="${tc.id}">Esperado</button>
                </div>

                <div class="tc-detail-body">
                    ${this.renderDetailContent(tc)}
                </div>

                <div class="bug-report-panel ${status === 'FAIL' ? 'is-open' : ''}" id="bug-panel-${tc.id}">
                    <div class="bug-report-header">
                        <span class="bug-report-title">REPORTE DE DEFECTO (BUG)</span>
                        <span class="help-text-xs">Se creara un ticket automaticamente al guardar</span>
                    </div>
                    <div class="bug-report-body">
                        <div class="field-group">
                            <label class="field-label">Título del Bug</label>
                            <input type="text" class="bug-input" data-field="title" data-tc-id="${tc.id}" placeholder="Resumen conciso del error..." value="Error en: ${UI.escapeHTML(tc.title)}" ${isLocked ? 'disabled' : ''}>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Descripción General</label>
                            <textarea class="bug-input" data-field="description" data-tc-id="${tc.id}" placeholder="Contexto del error..." ${isLocked ? 'disabled' : ''}></textarea>
                        </div>
                        <div class="field-group">
                            <div class="flex-between">
                                <label class="field-label">Pasos para reproducir</label>
                                ${!isLocked ? `<button class="btn btn-ghost btn-sm btn-copy-steps" data-tc-id="${tc.id}" style="font-size: 0.7rem; padding: 2px 8px;">Copiar del TC</button>` : ''}
                            </div>
                            <textarea class="bug-input" data-field="steps_to_reproduce" data-tc-id="${tc.id}" placeholder="1. ..." ${isLocked ? 'disabled' : ''}></textarea>
                        </div>
                        <div class="bug-result-compare">
                            <div class="field-group">
                                <div class="result-box-title expected">Resultado Esperado</div>
                                <textarea class="bug-input" data-field="expected_result" data-tc-id="${tc.id}" ${isLocked ? 'disabled' : ''}>${UI.escapeHTML(tc.expected_result || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <div class="result-box-title actual">Resultado Actual</div>
                                <textarea class="bug-input" data-field="actual_result" data-tc-id="${tc.id}" placeholder="¿Qué pasó realmente?" ${isLocked ? 'disabled' : ''}></textarea>
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

                <div class="block-report-panel ${status === 'BLOCK' ? 'is-open' : ''}" id="block-panel-${tc.id}">
                    <label class="block-report-title">JUSTIFICACION DEL BLOQUEO</label>
                    <textarea class="block-input" data-tc-id="${tc.id}" placeholder="Indica por qué no se pudo ejecutar este test..." ${isLocked ? 'disabled' : ''}>${UI.escapeHTML(tc.observations || '')}</textarea>
                </div>

                <div class="tc-detail-footer">
                    ${isLocked ? `
                        <div class="exec-locked-badge">
                            <span>BLOQUEADO</span>
                        </div>
                        <div class="execution-status-group">
                            <button class="btn-status pass ${status === 'PASS' || status === 'OK' ? 'active' : ''}" disabled>PASS</button>
                            <button class="btn-status fail ${status === 'FAIL' ? 'active' : ''}" disabled>FAIL</button>
                            <button class="btn-status block ${status === 'BLOCK' ? 'active' : ''}" disabled>BLOCK</button>
                            <button class="btn-status skipped ${status === 'SKIPPED' || status === 'SKIP' ? 'active' : ''}" disabled>SKIP</button>
                        </div>
                    ` : `
                        <div class="execution-status-group">
                            <button class="btn-status pass ${status === 'PASS' || status === 'OK' ? 'active' : ''}" data-status="PASS" data-tc-id="${tc.id}">PASS</button>
                            <button class="btn-status fail ${status === 'FAIL' ? 'active' : ''}" data-status="FAIL" data-tc-id="${tc.id}">FAIL</button>
                            <button class="btn-status block ${status === 'BLOCK' ? 'active' : ''}" data-status="BLOCK" data-tc-id="${tc.id}">BLOCK</button>
                            <button class="btn-status skipped ${status === 'SKIPPED' || status === 'SKIP' ? 'active' : ''}" data-status="SKIP" data-tc-id="${tc.id}">SKIP</button>
                        </div>
                        <button class="btn btn-primary exec-save-btn" data-tc-id="${tc.id}">Guardar</button>
                    `}
                </div>
            </div>
        `;
    },

    renderDetailContent(tc) {
        switch (this.detailTab) {
            case 'steps':
                const attachments = tc.attachments || [];
                return `
                    <div class="field-group">
                        <label class="field-label">Instrucciones / Pasos</label>
                        <div class="result-box">${UI.highlightSteps(tc.steps || 'Sin pasos.')}</div>
                    </div>
                    <div class="exec-evidence-section">
                        <div class="exec-evidence-header">
                            <label class="field-label">EVIDENCIAS (${attachments.length})</label>
                            <div class="flex-center-gap-8">
                                <span class="label-muted-xs">Categoría:</span>
                                <select class="exec-category-select" data-tc-id="${tc.id}">
                                    <option value="GENERAL">General</option>
                                    <option value="FIGMA">Figma</option>
                                    <option value="DEV">Sistema</option>
                                    <option value="BUG">Error</option>
                                </select>
                            </div>
                        </div>
                        <div class="exec-drop-zone" data-tc-id="${tc.id}">
                            <input type="file" class="file-input-inline" data-tc-id="${tc.id}" accept="image/*,video/*">
                            <div class="exec-drop-zone-text">Pega (Ctrl+V), arrastra o haz clic para adjuntar evidencia</div>
                        </div>
                        <div class="evidence-grid-mini">
                            ${this.renderAttachments(tc)}
                        </div>
                    </div>
                `;
            case 'expected':
                return `
                    <div class="field-group">
                        <label class="field-label">Resultado Esperado</label>
                        <div class="result-box">${UI.escapeHTML(tc.expected_result || 'Sin resultado.')}</div>
                    </div>
                `;
            default:
                return '';
        }
    },

    renderAttachments(tc) {
        const atts = tc.attachments || [];
        if (atts.length === 0) {
            return `<div style="text-align: center; padding: 20px; opacity: 0.4; color: var(--text-muted); font-size: 0.8rem;">Sin evidencias adjuntas</div>`;
        }
        return atts.map(att => {
            const label = att.category || 'GENERAL';
            const badgeClass = label === 'FIGMA' ? 'figma' : (label === 'DEV' ? 'dev' : (label === 'BUG' ? 'bug' : 'general'));

            return `
                <div class="evidence-item">
                    <img src="/${att.src}" onclick="UI.showImageZoom('/${att.src}')">
                    <span class="evidence-badge ${badgeClass}">${label}</span>
                    <button class="clear-evidence-btn" data-tc-id="${tc.id}" data-att-id="${att.id}">X</button>
                </div>
            `;
        }).join('');
    },

    toggleSuite(suiteId) {
        this.expandedSuiteId = this.expandedSuiteId === suiteId ? null : suiteId;
        this.expandedTCId = null;
        const container = document.getElementById('tab-content');
        if (container) this.render(container);
    },

    toggleTC(tcId, event) {
        if (event) event.stopPropagation();
        this.expandedTCId = this.expandedTCId === tcId ? null : tcId;
        this.detailTab = 'steps';
        const container = document.getElementById('tab-content');
        if (container) this.render(container);
    },

    getStatusColor(status) {
        const colors = {
            'PASS': '#22c55e',
            'OK': '#22c55e',
            'FAIL': '#ef4444',
            'BLOCK': '#f59e0b',
            'BLOCKED': '#f59e0b',
            'SKIP': '#6b7280',
            'SKIPPED': '#6b7280',
            'PENDING': '#6b7280'
        };
        return colors[status] || '#6b7280';
    },

    startTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const timerElements = document.querySelectorAll('.exec-suite-timer');
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

    setupRealtimeListener() {
        if (this._isListening) return;

        window.addEventListener('realtime-refresh', async () => {
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

    bindEvents(container) {
        container.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });

        container.querySelectorAll('.btn-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                const status = btn.dataset.status;

                btn.parentElement.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const bugPanel = container.querySelector(`#bug-panel-${tcId}`);
                const blockPanel = container.querySelector(`#block-panel-${tcId}`);

                if (bugPanel) bugPanel.classList.toggle('is-open', status === 'FAIL');
                if (blockPanel) blockPanel.classList.toggle('is-open', status === 'BLOCK');
            });
        });

        container.querySelectorAll('.btn-copy-steps').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                const suite = this.projectSuites.find(s => s.test_cases.some(tc => tc.id === tcId));
                const tc = suite.test_cases.find(t => t.id === tcId);
                const stepsArea = container.querySelector(`.bug-input[data-field="steps_to_reproduce"][data-tc-id="${tcId}"]`);
                if (stepsArea) stepsArea.value = tc.steps || '';
            });
        });

        container.querySelectorAll('.exec-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
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

        container.querySelectorAll('.exec-drop-zone').forEach(zone => {
            const tcId = parseInt(zone.dataset.tcId);
            const fileInput = zone.querySelector('.file-input-inline');

            const uploadFile = async (file) => {
                if (!file) return;
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                    return UI.toast('Solo se permiten imágenes o videos', 'warn');
                }

                UI.showLoading();
                try {
                    const category = container.querySelector(`.exec-category-select[data-tc-id="${tcId}"]`).value;
                    const formData = new FormData();
                    formData.append('evidence', file);
                    formData.append('tc_id', tcId);
                    formData.append('category', category);

                    const response = await fetch('/api/evidence', { method: 'POST', body: formData });
                    if (!response.ok) {
                        const errBody = await response.json().catch(() => ({}));
                        const errMsg = errBody.error || `Error al subir evidencia (HTTP ${response.status})`;
                        const errCode = errBody.code ? ` [${errBody.code}]` : '';
                        throw new Error(`${errMsg}${errCode}`);
                    }

                    UI.toast('Evidencia adjuntada');
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

        const globalPasteHandler = (e) => {
            if (this.expandedTCId) {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        const zone = container.querySelector(`.exec-drop-zone[data-tc-id="${this.expandedTCId}"]`);
                        if (zone) {
                            const uploadFn = async (f) => {
                                UI.showLoading();
                                try {
                                    const category = container.querySelector(`.exec-category-select[data-tc-id="${this.expandedTCId}"]`).value;
                                    const formData = new FormData();
                                    formData.append('evidence', f);
                                    formData.append('tc_id', this.expandedTCId);
                                    formData.append('category', category);

                                    const response = await fetch('/api/evidence', { method: 'POST', body: formData });
                                    if (!response.ok) {
                                        const errBody = await response.json().catch(() => ({}));
                                        const errMsg = errBody.error || `Error al subir evidencia (HTTP ${response.status})`;
                                        const errCode = errBody.code ? ` [${errBody.code}]` : '';
                                        UI.toast(`${errMsg}${errCode}`, 'error');
                                        return;
                                    }
                                    UI.toast('Evidencia pegada');
                                    const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                                    this.projectSuites = resSuites.testSuites || [];
                                    this.render(container);
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
        if (this._lastPasteHandler) window.removeEventListener('paste', this._lastPasteHandler);
        this._lastPasteHandler = globalPasteHandler;

        container.querySelector('#btn-exec-cu')?.addEventListener('click', () => {
            const cuId = this.selectedCUId;
            if (!cuId) return UI.toast('Selecciona un Caso de Uso en el filtro', 'warn');

            Modals.render('confirm', {
                title: 'Ejecutar Caso de Uso',
                msg: '¿Iniciar la ejecución de todas las suites de este Caso de Uso? Se ejecutarán solo los tests de regresión asignados a ti.',
                onConfirm: async () => {
                    UI.showLoading();
                    try {
                        const res = await ApiService.startAllCU(cuId);
                        if (res.ok) {
                            UI.toast(`Caso de Uso iniciado: ${res.executedSuites} suites, ${res.totalTests} tests`);
                            const resSuites = await ApiService.getTestSuites(null, Store.state.activeProjectId);
                            this.projectSuites = resSuites.testSuites || [];
                            this.render(container);
                        }
                    } catch (err) {
                        UI.toast(err.message, 'error');
                    }
                    UI.hideLoading();
                }
            });
        });

        container.querySelector('#cu-exec-filter')?.addEventListener('change', (e) => {
            this.selectedCUId = parseInt(e.target.value) || null;
            localStorage.setItem('execSelectedCU', this.selectedCUId || '');
            this.render(container);
        });

        container.querySelector('#exec-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.render(container);
        });

        container.querySelector('#exec-filter-status')?.addEventListener('change', (e) => {
            this.filterStatus = e.target.value;
            this.render(container);
        });

        container.querySelectorAll('.tc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.detailTab = tab.dataset.tab;
                this.render(container);
            });
        });

        container.querySelectorAll('.btn-pause-run').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const runId = parseInt(btn.dataset.runId);
                UI.showLoading();
                const res = await ApiService.pauseRun(runId);
                if (res.ok) {
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

        container.querySelectorAll('.btn-create-bug').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                if (!tcId) {
                    UI.toast('Selecciona un test case primero', 'warn');
                    return;
                }
                await this.handleCreateBug(tcId, container);
            });
        });

        container.querySelectorAll('.clear-evidence-btn').forEach(btn => {
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

        container.querySelector('#btn-refresh-exec')?.addEventListener('click', async () => {
            UI.showLoading();
            const res = await ApiService.getTestSuites(null, Store.state.activeProjectId);
            this.projectSuites = res.testSuites || [];
            this.lastRefresh = new Date().toLocaleTimeString();
            this.render(container);
            UI.hideLoading();
            UI.toast('Estado sincronizado');
        });
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
    }
};

window.ExecutionTab = ExecutionTab;