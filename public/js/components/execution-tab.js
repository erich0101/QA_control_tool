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
    filterStatus: 'all',
    _isListening: false,
    _lastScroll: 0,
    _refreshPending: false,
    // Drafts de bugs en memoria por executionId: array de objetos {title, description, steps_to_reproduce, expected_result, actual_result, frequency, severity, business_impact}
    bugDrafts: new Map(),

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
            <div class="exec-toolbar" style="padding: 12px 24px; background: var(--apple-bg-elevated); border-bottom: 1px solid var(--apple-separator); display: flex; align-items: center; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); letter-spacing: 0.05em; text-transform: uppercase;">EJECUCIÓN</span>
                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);">${activeSuites.length} <span style="color: var(--apple-label-tertiary);">C</span></span>
                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-blue); font-size: 0.62rem; font-weight: 600; color: white;">${totalActiveTests} <span style="opacity: 0.8;">T</span></span>
                </div>
                <div style="width: 1px; height: 20px; background: var(--apple-separator);"></div>
                <select id="cu-exec-filter" style="padding: 6px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none; min-width: 180px;">
                    <option value="">— Seleccionar Caso de Uso —</option>
                    ${Store.state.useCases.map(cu => `<option value="${cu.id}" ${cu.id === this.selectedCUId ? 'selected' : ''}>${UI.escapeHTML(cu.title)}</option>`).join('')}
                </select>
                <button id="btn-exec-cu" class="btn btn-success btn-sm" style="padding: 6px 14px; font-size: 0.72rem; font-weight: 600; border-radius: var(--apple-radius-sm);">▶ Ejecutar CU</button>
                <div style="flex: 1;"></div>
                <select id="exec-filter-status" style="padding: 6px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none;">
                    <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>Todos</option>
                    <option value="PENDING" ${this.filterStatus === 'PENDING' ? 'selected' : ''}>Pendientes</option>
                    <option value="PASS" ${this.filterStatus === 'PASS' ? 'selected' : ''}>Pasados</option>
                    <option value="FAIL" ${this.filterStatus === 'FAIL' ? 'selected' : ''}>Fallidos</option>
                    <option value="BLOCK" ${this.filterStatus === 'BLOCK' ? 'selected' : ''}>Bloqueados</option>
                    <option value="SKIP" ${this.filterStatus === 'SKIP' ? 'selected' : ''}>Saltados</option>
                </select>
                <button id="btn-refresh-exec" style="padding: 6px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: transparent; color: var(--apple-label-secondary); font-size: 0.75rem; font-weight: 500; cursor: pointer;">🔄 Sincronizar</button>
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

    // Cantidad de TCs renderizados por chunk (para mantener el DOM chico
    // en suites con cientos de casos). El resto se muestra con "Cargar más".
    tcChunkSize: 50,
    renderedTcCount: 0,

    renderTCList(tcs, suite, childPrefix) {
        if (tcs.length === 0) {
            return `<div class="tc-empty">Sin casos de prueba</div>`;
        }

        // Si cambió la suite o el filtro visible, reiniciar el chunk.
        const sig = `${suite.id}::${tcs.length}::${this.selectedCUId || ''}::${this.filterStatus}`;
        if (this._tcListSig !== sig) {
            this._tcListSig = sig;
            this.renderedTcCount = 0;
        }
        // Determinar cuántos renderizar (cap por chunk)
        const cap = Math.min(tcs.length, this.renderedTcCount + this.tcChunkSize);
        if (this.renderedTcCount === 0) {
            this.renderedTcCount = Math.min(tcs.length, this.tcChunkSize);
        }

        let html = '';
        const limit = this.renderedTcCount;
        for (let idx = 0; idx < limit; idx++) {
            const tc = tcs[idx];
            const isLast = idx === tcs.length - 1;
            const prefix = isLast ? '└──' : '├──';
            html += this.renderTCRow(tc, suite, childPrefix, prefix, isLast);
        }
        if (limit < tcs.length) {
            const remaining = tcs.length - limit;
            html += `
                <div style="display: flex; justify-content: center; padding: 14px;">
                    <button class="btn btn-ghost btn-sm btn-tc-load-more" data-suite-id="${suite.id}" data-tc-total="${tcs.length}" data-tc-rendered="${limit}" style="font-size: 0.74rem; padding: 6px 18px; border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md);">
                        Cargar ${Math.min(this.tcChunkSize, remaining)} más (${remaining} restantes)
                    </button>
                </div>
            `;
        }
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
                    <button class="tc-tab active" data-tab="steps" data-tc-id="${tc.id}">Pasos &amp; Esperado</button>
                </div>

                <div class="tc-detail-body">
                    ${this.renderDetailContent(tc)}
                </div>

                <div class="bug-report-panel ${status === 'FAIL' ? 'is-open' : ''}" id="bug-panel-${tc.id}">
                    <div class="bug-report-header">
                        <span class="bug-report-title">REPORTE DE DEFECTO (BUG)</span>
                        <span class="help-text-xs">Se creará un nuevo bug por cada tarjeta al guardar</span>
                    </div>
                    <div class="bug-report-body">
                        ${this.renderBugList(tc)}
                    </div>
                </div>

                <div class="block-report-panel ${(status === 'BLOCK' || status === 'SKIP' || status === 'SKIPPED') ? 'is-open' : ''}" id="block-panel-${tc.id}">
                    <label class="block-report-title">${status === 'SKIP' || status === 'SKIPPED' ? 'JUSTIFICACION DEL SALTO' : 'JUSTIFICACION DEL BLOQUEO'}</label>
                    <textarea class="block-input" data-tc-id="${tc.id}" placeholder="${status === 'SKIP' || status === 'SKIPPED' ? 'Indica por qué se salta este test...' : 'Indica por qué no se pudo ejecutar este test...'}" ${isLocked ? 'disabled' : ''}>${UI.escapeHTML(tc.observations || '')}</textarea>
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
        const attachments = tc.attachments || [];
        return `
            <div class="field-group">
                <label class="field-label">Instrucciones / Pasos</label>
                <div class="result-box">${UI.highlightSteps(tc.steps || 'Sin pasos.')}</div>
            </div>
            <div class="field-group">
                <label class="field-label">Resultado Esperado</label>
                <div class="result-box">${UI.escapeHTML(tc.expected_result || 'Sin resultado.')}</div>
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

    emptyBugDraft(tc) {
        return {
            title: '',
            description: '',
            steps_to_reproduce: '',
            expected_result: (tc && tc.expected_result) || '',
            actual_result: '',
            frequency: 'Siempre',
            severity: 'Alta',
            business_impact: ''
        };
    },

    getBugDrafts(executionId, tc) {
        if (!this.bugDrafts.has(executionId)) {
            this.bugDrafts.set(executionId, [this.emptyBugDraft(tc)]);
        }
        return this.bugDrafts.get(executionId);
    },

    setBugDrafts(executionId, drafts) {
        this.bugDrafts.set(executionId, drafts);
    },

    clearBugDrafts(executionId) {
        this.bugDrafts.delete(executionId);
    },

    renderBugCardDraft(tc, index, draft, canRemove) {
        return `
            <div class="bug-card" data-bug-index="${index}" style="background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 0.72rem; font-weight: 800; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">🐞 Nuevo bug #${index + 1}</span>
                    ${canRemove ? `<button class="btn-text btn-remove-bug-draft" data-tc-id="${tc.id}" data-bug-index="${index}" style="font-size: 0.7rem; color: var(--apple-red); padding: 2px 6px;">✕ Quitar</button>` : ''}
                </div>
                <div class="field-group">
                    <label class="field-label">Título del Bug</label>
                    <input type="text" class="bug-input" data-field="title" data-tc-id="${tc.id}" data-bug-index="${index}" placeholder="Resumen conciso del error..." value="${UI.escapeHTML(draft.title)}">
                </div>
                <div class="bug-row-2col">
                    <div class="field-group">
                        <label class="field-label">Descripción General</label>
                        <textarea class="bug-input" data-field="description" data-tc-id="${tc.id}" data-bug-index="${index}" placeholder="Contexto del error...">${UI.escapeHTML(draft.description)}</textarea>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Impacto en el negocio</label>
                        <input type="text" class="bug-input" data-field="business_impact" data-tc-id="${tc.id}" data-bug-index="${index}" placeholder="Ej: Bloquea edición..." value="${UI.escapeHTML(draft.business_impact)}">
                    </div>
                </div>
                <div class="field-group">
                    <div class="flex-between">
                        <label class="field-label">Pasos para reproducir</label>
                        <button class="btn btn-ghost btn-sm btn-copy-steps" data-tc-id="${tc.id}" data-bug-index="${index}" style="font-size: 0.7rem; padding: 2px 8px;">Copiar del TC</button>
                    </div>
                    <textarea class="bug-input" data-field="steps_to_reproduce" data-tc-id="${tc.id}" data-bug-index="${index}" placeholder="1. ...">${UI.escapeHTML(draft.steps_to_reproduce)}</textarea>
                </div>
                <div class="bug-result-compare">
                    <div class="field-group">
                        <div class="result-box-title expected">Resultado Esperado</div>
                        <textarea class="bug-input" data-field="expected_result" data-tc-id="${tc.id}" data-bug-index="${index}">${UI.escapeHTML(draft.expected_result)}</textarea>
                    </div>
                    <div class="field-group">
                        <div class="result-box-title actual">Resultado Actual</div>
                        <textarea class="bug-input" data-field="actual_result" data-tc-id="${tc.id}" data-bug-index="${index}" placeholder="¿Qué pasó realmente?">${UI.escapeHTML(draft.actual_result)}</textarea>
                    </div>
                </div>
                <div class="bug-grid-impact">
                    <div class="field-group">
                        <label class="field-label">Frecuencia</label>
                        <select class="bug-input bug-select-compact" data-field="frequency" data-tc-id="${tc.id}" data-bug-index="${index}">
                            <option value="Siempre" ${draft.frequency === 'Siempre' ? 'selected' : ''}>Siempre</option>
                            <option value="Intermitente" ${draft.frequency === 'Intermitente' ? 'selected' : ''}>Intermitente</option>
                            <option value="Una vez" ${draft.frequency === 'Una vez' ? 'selected' : ''}>Una vez</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Severidad</label>
                        <select class="bug-input bug-select-compact" data-field="severity" data-tc-id="${tc.id}" data-bug-index="${index}">
                            <option value="Crítica" ${draft.severity === 'Crítica' ? 'selected' : ''}>Crítica</option>
                            <option value="Alta" ${draft.severity === 'Alta' ? 'selected' : ''}>Alta</option>
                            <option value="Media" ${draft.severity === 'Media' ? 'selected' : ''}>Media</option>
                            <option value="Baja" ${draft.severity === 'Baja' ? 'selected' : ''}>Baja</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    },

    renderExistingBugCard(bug) {
        const sevBg = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'rgba(255,59,48,0.1)' : 'rgba(255,149,0,0.1)';
        const sevColor = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'var(--apple-red)' : 'var(--apple-orange)';
        const dateStr = bug.created_at ? new Date(bug.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        return `
            <div class="bug-card bug-card-existing" data-bug-id="${bug.id}" style="background: var(--apple-fill-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--apple-label);">🐞 #${bug.id} — ${UI.escapeHTML(bug.title || 'Sin título')}</span>
                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.62rem; font-weight: 700; background: ${sevBg}; color: ${sevColor};">${UI.escapeHTML(bug.severity || 'Media')}</span>
                </div>
                <div style="font-size: 0.68rem; color: var(--apple-label-tertiary);">
                    Reportado el ${UI.escapeHTML(dateStr)}${bug.is_historical ? ' · (ciclo previo)' : ''}
                </div>
            </div>
        `;
    },

    renderBugList(tc) {
        const executionId = tc.execution_id;
        if (!executionId) {
            return `<div style="font-size: 0.75rem; color: var(--text-muted); padding: 8px 0;">Guardá el resultado FAIL para poder reportar defectos.</div>`;
        }
        const existingBugs = tc.defects || [];
        const drafts = this.getBugDrafts(executionId, tc);

        const existingHtml = existingBugs.length > 0
            ? existingBugs.map(b => this.renderExistingBugCard(b)).join('')
            : '';

        const draftsHtml = drafts.map((d, i) => this.renderBugCardDraft(tc, i, d, drafts.length > 1)).join('');

        const counterTotal = existingBugs.length + drafts.length;
        return `
            ${existingBugs.length > 0 ? `<div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Bugs ya reportados (${existingBugs.length})</div>${existingHtml}` : ''}
            <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin: ${existingBugs.length > 0 ? '12px' : '0'} 0 6px;">Nuevos a crear (${drafts.length})</div>
            ${draftsHtml}
            <button class="btn btn-ghost btn-sm btn-add-bug-draft" data-tc-id="${tc.id}" style="width: 100%; margin-top: 4px; padding: 8px 12px; font-size: 0.78rem; border: 1px dashed var(--apple-separator); border-radius: var(--apple-radius-md); color: var(--apple-blue); background: transparent;">+ Crear nuevo Bug</button>
            <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); margin-top: 8px; text-align: right;">Se guardarán <strong>${counterTotal}</strong> bug${counterTotal === 1 ? '' : 's'} en total al pulsar Guardar.</div>
        `;
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
            'PASS': 'var(--apple-green)',
            'OK': 'var(--apple-green)',
            'FAIL': 'var(--apple-red)',
            'BLOCK': 'var(--apple-orange)',
            'BLOCKED': 'var(--apple-orange)',
            'SKIP': 'var(--apple-label-secondary)',
            'SKIPPED': 'var(--apple-label-secondary)',
            'PENDING': 'var(--apple-label-secondary)'
        };
        return colors[status] || 'var(--apple-label-secondary)';
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

        window.addEventListener('realtime-refresh', async (evt) => {
            // Solo procesar si el evento es para esta tab
            if (evt && evt.detail && evt.detail.tabKey && evt.detail.tabKey !== 'execution') return;

            // Si el usuario está editando activamente (input/textarea con foco
            // o TC expandido con inputs llenos), NO re-renderizar: perdería
            // el foco y el contenido en draft. El cambio ya está parcheado
            // in-place en Store.state; el próximo render natural lo reflejará.
            const container = document.getElementById('tab-content');
            if (!container || Store.state.activeTab !== 'execution') return;

            const active = document.activeElement;
            const isUserEditing = active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT'
            ) && this.expandedTCId !== null;

            if (isUserEditing) {
                console.log('⚠️ Realtime refresh diferido: usuario editando TC expandido.');
                // Invalidar cache y marcar para refrescar en el próximo "blur" o
                // cuando el usuario cambie de tab y vuelva
                this._refreshPending = true;
                return;
            }

            this.projectSuites = [];
            console.log('⚡ Realtime: Execution cache invalidated.');

            await this.render(container);
            this.lastRefresh = new Date().toLocaleTimeString();
            this._refreshPending = false;
        });
        this._isListening = true;
    },

    bindEvents(container) {
        container.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });

        // "Cargar más TCs" del chunked-render
        container.querySelectorAll('.btn-tc-load-more').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rendered = parseInt(btn.dataset.tcRendered) || 0;
                this.renderedTcCount = rendered + this.tcChunkSize;
                // Re-render solo la suite-tree (no el full render, para preservar scroll)
                const tree = container.querySelector('.exec-tree-container');
                if (tree) {
                    const activeSuites = this.projectSuites.filter(s => s.activeRun);
                    tree.innerHTML = this.renderSuiteTree(activeSuites);
                    this.bindEvents(container);
                }
            });
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
                if (blockPanel) {
                    const needsJustification = (status === 'BLOCK' || status === 'SKIP');
                    blockPanel.classList.toggle('is-open', needsJustification);
                    if (needsJustification) {
                        const titleEl = blockPanel.querySelector('.block-report-title');
                        const textarea = blockPanel.querySelector('.block-input');
                        if (status === 'SKIP') {
                            if (titleEl) titleEl.textContent = 'JUSTIFICACION DEL SALTO';
                            if (textarea) textarea.placeholder = 'Indica por qué se salta este test...';
                        } else {
                            if (titleEl) titleEl.textContent = 'JUSTIFICACION DEL BLOQUEO';
                            if (textarea) textarea.placeholder = 'Indica por qué no se pudo ejecutar este test...';
                        }
                    }
                }
            });
        });

        // Inicializar eventos del panel de bugs para el TC expandido actualmente
        if (this.expandedTCId) {
            this._bindBugPanelEvents(container, this.expandedTCId);
        }

        container.querySelectorAll('.exec-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId);
                const statusBtn = container.querySelector(`.btn-status.active[data-tc-id="${tcId}"]`);
                if (!statusBtn) return UI.toast('Selecciona un resultado (PASS/FAIL/BLOCK)', 'warn');

                const status = statusBtn.dataset.status;
                const payload = { status };

                if (status === 'BLOCK' || status === 'SKIP') {
                    const blockInput = container.querySelector(`.block-input[data-tc-id="${tcId}"]`);
                    const observations = (blockInput ? blockInput.value : '').trim();
                    if (!observations) {
                        const label = status === 'SKIP' ? 'salto' : 'bloqueo';
                        if (blockInput) blockInput.focus();
                        return UI.toast(`La justificación del ${label} es obligatoria`, 'warn');
                    }
                    payload.observations = observations;
                }

                if (status === 'FAIL') {
                    const tc = this._findTC(tcId);
                    if (tc && tc.execution_id) {
                        const drafts = this.getBugDrafts(tc.execution_id, tc);
                        // Solo enviar drafts con título no vacío
                        payload.bugs = drafts
                            .filter(d => (d.title || '').trim() !== '')
                            .map(d => ({
                                title: d.title,
                                description: d.description,
                                severity: d.severity,
                                steps_to_reproduce: d.steps_to_reproduce,
                                expected_result: d.expected_result,
                                actual_result: d.actual_result,
                                frequency: d.frequency,
                                business_impact: d.business_impact
                            }));
                    }
                }

                UI.showLoading();
                const res = await ApiService.updateTestCase(tcId, payload);
                if (res.ok) {
                    const tc = this._findTC(tcId);
                    if (tc && tc.execution_id) {
                        this.clearBugDrafts(tc.execution_id);
                    }
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
                    if (!response.ok) throw new Error('Error al subir evidencia');

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

            zone.ondragover = (e) => { e.preventDefault(); zone.style.borderColor = 'var(--apple-blue)'; zone.style.background = 'var(--apple-blue-soft)'; };
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

    _findTC(tcId) {
        for (const suite of this.projectSuites) {
            const tc = (suite.test_cases || []).find(t => t.id === tcId);
            if (tc) return tc;
        }
        return null;
    },

    _rerenderBugPanel(container, tcId) {
        const panel = container.querySelector(`#bug-panel-${tcId}`);
        if (!panel) return;
        const tc = this._findTC(tcId);
        if (!tc) return;
        const body = panel.querySelector('.bug-report-body');
        if (body) body.innerHTML = this.renderBugList(tc);
        // Re-bind events del nuevo HTML
        this._bindBugPanelEvents(container, tcId);
    },

    _bindBugPanelEvents(container, tcId) {
        const panel = container.querySelector(`#bug-panel-${tcId}`);
        if (!panel) return;

        panel.querySelectorAll('.btn-copy-steps').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const bugIndex = parseInt(btn.dataset.bugIndex);
                const tc = this._findTC(tcId);
                if (!tc) return;
                const stepsArea = panel.querySelector(`.bug-input[data-field="steps_to_reproduce"][data-bug-index="${bugIndex}"]`);
                if (stepsArea) stepsArea.value = tc.steps || '';
            });
        });

        panel.querySelectorAll('.btn-add-bug-draft').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tc = this._findTC(tcId);
                if (!tc || !tc.execution_id) return;
                const drafts = this.getBugDrafts(tc.execution_id, tc);
                drafts.push(this.emptyBugDraft(tc));
                this.setBugDrafts(tc.execution_id, drafts);
                this._rerenderBugPanel(container, tcId);
            });
        });

        panel.querySelectorAll('.btn-remove-bug-draft').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const bugIndex = parseInt(btn.dataset.bugIndex);
                const tc = this._findTC(tcId);
                if (!tc || !tc.execution_id) return;
                const drafts = this.getBugDrafts(tc.execution_id, tc);
                if (drafts.length <= 1) {
                    return UI.toast('Debe quedar al menos un bug en la lista', 'warn');
                }
                drafts.splice(bugIndex, 1);
                this.setBugDrafts(tc.execution_id, drafts);
                this._rerenderBugPanel(container, tcId);
            });
        });

        panel.querySelectorAll('.bug-input[data-bug-index]').forEach(input => {
            const handler = () => {
                const bugIndex = parseInt(input.dataset.bugIndex);
                const field = input.dataset.field;
                const tc = this._findTC(tcId);
                if (!tc || !tc.execution_id) return;
                const drafts = this.getBugDrafts(tc.execution_id, tc);
                if (!drafts[bugIndex]) return;
                drafts[bugIndex][field] = input.value;
            };
            input.addEventListener('input', handler);
            input.addEventListener('change', handler);
        });

        // Auto-resize textareas
        panel.querySelectorAll('textarea').forEach(tx => {
            UI.autoResizeTextarea(tx);
            tx.addEventListener('input', () => UI.autoResizeTextarea(tx));
        });
    }
};

window.ExecutionTab = ExecutionTab;