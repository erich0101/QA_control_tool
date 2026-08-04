import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { getCachedTab, setCachedTab, invalidateTabCache } from '../store/state.js';

/**
 * EXPLORATORIA-TAB.JS — Testing Exploratorio.
 *
 * Modelo:
 *  - Sesión = qa_test_runs (run_type='EXPLORATORY') con charter + timebox.
 *  - Flujo  = qa_test_case (is_exploratory=true) en la suite sintética "🧪 Exploratoria".
 *  - Test   = qa_execution del run, opcionalmente con qa_defects (FAIL).
 *
 * Reuso:
 *  - POST /api/evidence (file picker / drag / paste).
 *  - POST /api/hallazgos/:id/convert-to-tc (promover a TC).
 */

const STATUSES = [
    { value: 'OK',       label: 'OK',       cls: 'ok' },
    { value: 'FAIL',     label: 'FAIL',     cls: 'fail' },
    { value: 'WARNING',  label: 'WARN',     cls: 'warning' },
    { value: 'BLOCK',    label: 'BLOCK',    cls: 'block' },
    { value: 'SKIP',     label: 'SKIP',     cls: 'skipped' }
];

const SEVERITIES = ['Baja', 'Media', 'Alta', 'Crítica'];

function escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const ExploratoriaTab = {
    // ─── State ───
    loadedProjectId: null,
    subTab: 'active',                // 'active' | 'history'
    selectedRunId: null,             // sesión expandida
    sessionDetail: null,             // { run, flows, executions, defects, attachments }
    flowDrafts: new Map(),           // runId -> { [tcId]: {status, observations, bug:{...}, evidencePending: []} }
    _pendingEvidence: new Map(),     // execId -> [files]
    _isListening: false,
    selectedUseCaseId: null,         // UC filter (sidebar)
    sessionSearch: '',               // local search (sidebar)
    openFlowId: null,                // currently expanded flow in the table
    _hasRenderedOnce: false,         // true tras la primera carga real: evita skeleton-flash en re-renders

    // ─── Entry point ───
    async render(container) {
        const projectId = Store.state.activeProjectId;
        if (!projectId) {
            container.innerHTML = `<div class="expl-empty-state">Selecciona un proyecto activo para ver sesiones exploratorias.</div>`;
            return;
        }

        if (this.loadedProjectId !== projectId) {
            this.loadedProjectId = projectId;
            this.selectedRunId = null;
            this.sessionDetail = null;
            this.flowDrafts.clear();
            this.openFlowId = null;
            this.selectedUseCaseId = null;
            this.sessionSearch = '';
            // Cambio de proyecto: resetear el flag de "ya renderizó" para mostrar
            // skeleton en la primera carga.
            this._hasRenderedOnce = false;
        }

        // Solo mostrar el skeleton en la primera carga de la tab (o tras un cambio
        // de proyecto). En re-renders por acciones del usuario (cambiar status,
        // finalizar, abrir modal, toggle de flow, etc.) los datos ya están en memoria
        // o en cache — pintar el skeleton causa un "flash" visible que rompe el flujo.
        if (!this._hasRenderedOnce) {
            container.innerHTML = UI.skeletonHTML(4, 3);
        }

        try {
            if (this.selectedRunId) {
                await this.renderDetail(container);
            } else {
                await this.renderList(container);
            }
            this._hasRenderedOnce = true;
        } catch (err) {
            console.error('Error en ExploratoriaTab:', err);
            container.innerHTML = `<div class="expl-empty-state" style="color: var(--apple-red);">Error: ${UI.escapeHTML(err.message)}</div>`;
        }

        this.bindRealtimeListener();
    },

    // ─── List view (sidebar+main shell) ───
    async renderList(container) {
        const projectId = Store.state.activeProjectId;
        const status = this.subTab === 'active' ? 'RUNNING' : 'FINISHED';

        let cached = getCachedTab('exploratoria::' + this.subTab, projectId);
        let sessions;
        if (cached) {
            sessions = cached.data;
        } else {
            const res = await ApiService.listExploratorySessions(projectId, status);
            sessions = res.sessions || [];
            setCachedTab('exploratoria::' + this.subTab, projectId, sessions);
        }

        const filteredSessions = this._filterSessions(sessions);

        container.innerHTML = `
            <div class="ts-layout">
                <div class="ts-sidebar">
                    <div class="ts-sidebar-header" style="padding: 16px; background: var(--apple-bg-elevated); border-bottom: 1px solid var(--apple-separator);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">Exploratoria</span>
                            <div style="display: flex; gap: 6px;">
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);" title="Total de Sesiones">${sessions.length} <span style="color: var(--apple-label-tertiary);">S</span></span>
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-blue); font-size: 0.62rem; font-weight: 600; color: white;" title="Total de Flujos">${sessions.reduce((a, s) => a + (s.flow_count || 0), 0)} <span style="opacity: 0.8;">F</span></span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="expl-uc-filter" class="w-full" style="font-size: 0.78rem; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label);">
                                <option value="">Todos los Casos de Uso</option>
                                ${(Store.state.useCases || []).map(uc => `
                                    <option value="${uc.id}" ${Number(uc.id) === Number(this.selectedUseCaseId) ? 'selected' : ''}>${UI.escapeHTML(uc.key_id || 'CU')} - ${UI.escapeHTML(uc.title)}</option>
                                `).join('')}
                            </select>
                            <div style="position: relative;">
                                <input type="text" id="expl-session-search" placeholder="🔍 Buscar sesión..." value="${UI.escapeHTML(this.sessionSearch)}"
                                    style="width: 100%; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none; box-sizing: border-box; transition: border-color 0.15s;"
                                    onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'" />
                            </div>
                            <div class="expl-subtabs" style="margin-top: 2px;">
                                <div class="expl-subtab ${this.subTab === 'active' ? 'active' : ''}" data-subtab="active">Activas</div>
                                <div class="expl-subtab ${this.subTab === 'history' ? 'active' : ''}" data-subtab="history">Finalizadas</div>
                            </div>
                            <button class="btn btn-primary btn-sm" id="expl-btn-new-session" style="width: 100%; padding: 8px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--apple-radius-md);">+ Nueva sesión</button>
                        </div>
                    </div>
                    <div class="ts-sidebar-list" id="expl-session-list">
                        ${filteredSessions.length === 0 ? this.renderSidebarEmpty() : filteredSessions.map(s => this.renderSessionRow(s)).join('')}
                    </div>
                </div>
                <div class="ts-main-content">
                    ${this.renderMainEmptyState()}
                </div>
            </div>
        `;

        this.bindListEvents(container);
    },

    _filterSessions(sessions) {
        let filtered = sessions;
        if (this.sessionSearch) {
            const q = this.sessionSearch.toLowerCase();
            filtered = filtered.filter(s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.charter || '').toLowerCase().includes(q) ||
                (`${s.id}` || '').includes(q)
            );
        }
        return filtered;
    },

    renderSidebarEmpty() {
        const msg = this.subTab === 'active'
            ? 'No hay sesiones activas. Iniciá una para empezar a explorar.'
            : 'Aún no finalizaste ninguna sesión.';
        return `<div style="padding: 20px; text-align: center; opacity: 0.5; font-size: 0.8rem;">${UI.escapeHTML(msg)}</div>`;
    },

    renderMainEmptyState() {
        return `
            <div class="empty-state" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center; opacity: 0.5;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">🧭</div>
                    <h3 style="font-weight: 700;">Selecciona una sesión</h3>
                    <p>Hacé clic en una sesión de la izquierda para gestionarla.</p>
                </div>
            </div>
        `;
    },

    renderSessionRow(s) {
        const isActive = this.selectedRunId === s.id;
        const statusCls = (s.status || '').toLowerCase();
        const charter = s.charter ? `<span class="expl-charter-pill">📜 ${UI.escapeHTML(s.charter)}</span>` : '';
        const timebox = s.timebox_minutes ? `<span class="expl-timebox-pill">⏱️ ${s.timebox_minutes} min</span>` : '';
        const creator = UI.escapeHTML(s.creator_name || '—');
        const startedAt = s.started_at ? new Date(s.started_at).toLocaleString() : '';

        const selectedStyle = isActive ? `
            background: var(--apple-indigo-soft);
            border-left: 3px solid var(--apple-blue);
            padding-left: 12px;
        ` : `
            border-left: 3px solid transparent;
            padding-left: 12px;
        `;

        return `
            <div class="ts-suite-row ${isActive ? 'selected' : ''}" data-id="${s.id}"
                style="border-radius: var(--apple-radius-md); padding: 10px 12px; cursor: pointer; transition: all 0.15s ease; ${selectedStyle}"
                onmouseover="if(!this.classList.contains('selected')) this.style.background='var(--apple-fill)'"
                onmouseout="if(!this.classList.contains('selected')) this.style.background='transparent'">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); letter-spacing: 0.03em;">SESIÓN #${s.id}</span>
                    <span class="expl-status-badge ${statusCls}">${UI.escapeHTML(s.status || '—')}</span>
                </div>
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--apple-label); margin-bottom: 4px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(s.name || `Sesión #${s.id}`)}</div>
                <div style="font-size: 0.7rem; color: var(--apple-label-tertiary); display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    ${charter}${timebox}
                    <span style="color: var(--apple-label-tertiary);">·</span>
                    <span>👤 ${creator}</span>
                    <span style="color: var(--apple-label-tertiary);">·</span>
                    <span style="color: var(--apple-blue);">🧪</span> ${s.flow_count || 0} flujos${(s.fail_count || 0) > 0 ? ` <span style="color: var(--apple-label-tertiary);">·</span> <span style="color: var(--apple-red); font-weight:700;">${s.fail_count} FAIL</span>` : ''}
                </div>
            </div>
        `;
    },

    bindListEvents(container) {
        container.querySelectorAll('.expl-subtab').forEach(el => {
            el.addEventListener('click', () => {
                this.subTab = el.dataset.subtab;
                this.render(container);
            });
        });

        container.querySelector('#expl-btn-new-session')?.addEventListener('click', () => {
            this.showStartSessionModal(container);
        });

        container.querySelectorAll('.ts-suite-row').forEach(row => {
            row.addEventListener('click', () => {
                this.selectedRunId = parseInt(row.dataset.id, 10);
                this.render(container);
            });
        });

        const searchInput = container.querySelector('#expl-session-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.sessionSearch = searchInput.value;
                const list = container.querySelector('#expl-session-list');
                if (!list) return;
                const projectId = Store.state.activeProjectId;
                const status = this.subTab === 'active' ? 'RUNNING' : 'FINISHED';
                let cached = getCachedTab('exploratoria::' + this.subTab, projectId);
                const sessions = cached ? cached.data : [];
                const filtered = this._filterSessions(sessions);
                list.innerHTML = filtered.length === 0
                    ? this.renderSidebarEmpty()
                    : filtered.map(s => this.renderSessionRow(s)).join('');
                this.bindSidebarRowClicks(container);
            });
        }

        const ucFilter = container.querySelector('#expl-uc-filter');
        if (ucFilter) {
            ucFilter.addEventListener('change', () => {
                this.selectedUseCaseId = ucFilter.value ? parseInt(ucFilter.value, 10) : null;
                this.render(container);
            });
        }
    },

    bindSidebarRowClicks(container) {
        container.querySelectorAll('.ts-suite-row').forEach(row => {
            row.addEventListener('click', () => {
                this.selectedRunId = parseInt(row.dataset.id, 10);
                this.render(container);
            });
        });
    },

    // ─── Detail view (sidebar+main shell) ───
    async renderDetail(container) {
        const projectId = Store.state.activeProjectId;
        // Cache por projectId: solo se cachea la sesión actualmente expandida.
        // Cualquier cambio de selectedRunId o de proyecto invalida naturalmente.
        let cached = getCachedTab('exploratoria::detail', projectId);
        let detail;
        if (cached && cached.data && cached.data._runId === this.selectedRunId) {
            detail = cached.data.data;
        } else {
            const res = await ApiService.getExploratorySession(this.selectedRunId);
            detail = res;
            setCachedTab('exploratoria::detail', projectId, { _runId: this.selectedRunId, data: detail });
        }
        this.sessionDetail = detail;
        const { run, flows, executions, defects, attachments } = detail;

        // Pre-index por [C11]
        const execByTc = new Map();
        for (const e of (executions || [])) execByTc.set(e.tc_id, e);
        const defectsByExec = new Map();
        for (const d of (defects || [])) {
            if (!defectsByExec.has(d.execution_id)) defectsByExec.set(d.execution_id, []);
            defectsByExec.get(d.execution_id).push(d);
        }
        const attByExec = new Map();
        const attByDef = new Map();
        for (const a of (attachments || [])) {
            if (a.execution_id) {
                if (!attByExec.has(a.execution_id)) attByExec.set(a.execution_id, []);
                attByExec.get(a.execution_id).push(a);
            }
            if (a.defect_id) {
                if (!attByDef.has(a.defect_id)) attByDef.set(a.defect_id, []);
                attByDef.get(a.defect_id).push(a);
            }
        }

        // Asegurar draft por flujo
        if (!this.flowDrafts.has(this.selectedRunId)) this.flowDrafts.set(this.selectedRunId, {});
        const drafts = this.flowDrafts.get(this.selectedRunId);

        const isFinished = run.status === 'FINISHED';
        const statusCls = (run.status || '').toLowerCase();
        const charter = run.charter ? `<span class="expl-charter-pill">📜 ${UI.escapeHTML(run.charter)}</span>` : '';
        const timebox = run.timebox_minutes ? `<span class="expl-timebox-pill">⏱️ ${run.timebox_minutes} min</span>` : '';
        const creator = UI.escapeHTML(run.creator_name || '—');
        const startedAt = run.started_at ? new Date(run.started_at).toLocaleString() : '—';
        const finishedAt = run.finished_at ? new Date(run.finished_at).toLocaleString() : '—';

        // Cargar la lista de sesiones para el sidebar (necesaria para mantener la
        // navegación persistente mientras el usuario navega de detalle en detalle).
        const statusFilter = this.subTab === 'active' ? 'RUNNING' : 'FINISHED';
        let cachedList = getCachedTab('exploratoria::' + this.subTab, projectId);
        let sessions;
        if (cachedList) {
            sessions = cachedList.data;
        } else {
            const resList = await ApiService.listExploratorySessions(projectId, statusFilter);
            sessions = resList.sessions || [];
            setCachedTab('exploratoria::' + this.subTab, projectId, sessions);
        }
        const filteredSessions = this._filterSessions(sessions);
        const totalFlows = sessions.reduce((a, s) => a + (s.flow_count || 0), 0);

        container.innerHTML = `
            <div class="ts-layout">
                <div class="ts-sidebar">
                    <div class="ts-sidebar-header" style="padding: 16px; background: var(--apple-bg-elevated); border-bottom: 1px solid var(--apple-separator);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                            <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.08em;">Exploratoria</span>
                            <div style="display: flex; gap: 6px;">
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);" title="Total de Sesiones">${sessions.length} <span style="color: var(--apple-label-tertiary);">S</span></span>
                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-blue); font-size: 0.62rem; font-weight: 600; color: white;" title="Total de Flujos">${totalFlows} <span style="opacity: 0.8;">F</span></span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <select id="expl-uc-filter" class="w-full" style="font-size: 0.78rem; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label);">
                                <option value="">Todos los Casos de Uso</option>
                                ${(Store.state.useCases || []).map(uc => `
                                    <option value="${uc.id}" ${Number(uc.id) === Number(this.selectedUseCaseId) ? 'selected' : ''}>${UI.escapeHTML(uc.key_id || 'CU')} - ${UI.escapeHTML(uc.title)}</option>
                                `).join('')}
                            </select>
                            <div style="position: relative;">
                                <input type="text" id="expl-session-search" placeholder="🔍 Buscar sesión..." value="${UI.escapeHTML(this.sessionSearch)}"
                                    style="width: 100%; padding: 8px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; outline: none; box-sizing: border-box; transition: border-color 0.15s;"
                                    onfocus="this.style.borderColor='var(--apple-blue)'" onblur="this.style.borderColor='var(--apple-separator)'" />
                            </div>
                            <div class="expl-subtabs" style="margin-top: 2px;">
                                <div class="expl-subtab ${this.subTab === 'active' ? 'active' : ''}" data-subtab="active">Activas</div>
                                <div class="expl-subtab ${this.subTab === 'history' ? 'active' : ''}" data-subtab="history">Finalizadas</div>
                            </div>
                            <button class="btn btn-primary btn-sm" id="expl-btn-new-session" style="width: 100%; padding: 8px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--apple-radius-md);">+ Nueva sesión</button>
                        </div>
                    </div>
                    <div class="ts-sidebar-list" id="expl-session-list">
                        ${filteredSessions.length === 0 ? this.renderSidebarEmpty() : filteredSessions.map(s => this.renderSessionRow(s)).join('')}
                    </div>
                </div>
                <div class="ts-main-content">
                    <div class="ts-detail-header" style="padding: 12px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated); flex-shrink: 0;">
                        <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;">
                            <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap;">EXPLORATORIA <span style="color: var(--apple-label-tertiary);">›</span> <span style="color: var(--apple-blue);">#${run.id}</span></span>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--apple-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; flex: 1; min-width: 0;">${UI.escapeHTML(run.name || `Sesión #${run.id}`)}</h2>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span class="expl-status-badge ${statusCls}">${UI.escapeHTML(run.status)}</span>
                            ${charter}
                            ${timebox}
                            <span style="font-size: 0.7rem; color: var(--apple-label-tertiary);">👤 ${creator}</span>
                            <span style="font-size: 0.7rem; color: var(--apple-label-tertiary);">🟢 ${UI.escapeHTML(startedAt)}</span>
                            ${isFinished ? `<span style="font-size: 0.7rem; color: var(--apple-label-tertiary);">🏁 ${UI.escapeHTML(finishedAt)}</span>` : ''}
                            <div style="flex: 1;"></div>
                            ${isFinished ? `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; background: var(--apple-green-soft); color: var(--apple-green); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;">✅ Sesión finalizada</span>` : ''}
                            <button class="btn btn-ghost btn-sm" id="expl-btn-back" style="padding: 5px 12px; font-size: 0.72rem; font-weight: 500; border-radius: var(--apple-radius-sm);">← Sesiones</button>
                            ${!isFinished ? `<button class="btn btn-primary btn-sm" id="expl-btn-add-flow" style="padding: 5px 12px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">+ Agregar flujo</button>` : ''}
                            ${!isFinished ? `<button class="btn btn-danger btn-sm" id="expl-btn-finish" style="padding: 5px 12px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">🏁 Finalizar sesión</button>` : ''}
                        </div>
                    </div>
                    <div id="expl-flow-list" style="flex: 1; overflow-y: auto; padding: 20px 24px;">
                        ${flows.length === 0 ? `
                            <div class="expl-empty-state">
                                <span class="expl-empty-state-icon">🧪</span>
                                <div>Esta sesión aún no tiene flujos. Agregá el primero.</div>
                            </div>
                        ` : this.renderFlowsTable(flows, execByTc, defectsByExec, attByExec, attByDef, drafts, isFinished)}
                    </div>
                </div>
            </div>
        `;

        this.bindListEvents(container);
        this.bindDetailEvents(container, flows, execByTc, defectsByExec, attByExec, attByDef, isFinished);
    },

    // Renderiza los flujos como una tabla .ts-grid-table (peer de la tabla de TCs
    // en Test Suites). Click en una fila abre/cierra la fila expandida con tabs
    // Pasos / Esperado / Metadata. La fila expandida reutiliza el HTML de
    // renderFlowCard dentro de .ts-expanded-body.
    renderFlowsTable(flows, execByTc, defectsByExec, attByExec, attByDef, drafts, isFinished) {
        const rows = flows.map(f => this._renderFlowRow(f, execByTc, defectsByExec, attByExec, attByDef, drafts, isFinished)).join('');
        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <table class="ts-grid-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: var(--apple-fill); border-bottom: 1px solid var(--apple-separator);">
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 90px;">Key</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary);">Flujo</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 280px;">Status</th>
                            <th style="padding: 10px 16px; text-align: left; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 130px;">Última Ejecución</th>
                            <th style="padding: 10px 16px; text-align: center; font-weight: 600; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apple-label-tertiary); width: 80px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    },

    _renderFlowRow(flow, execByTc, defectsByExec, attByExec, attByDef, drafts, isFinished) {
        const exec = execByTc.get(flow.id);
        const draft = drafts[flow.id] || {};
        if (exec && !draft.status) draft.status = exec.status || 'PENDING';
        if (exec && !draft._loaded) {
            draft.observations = exec.observations || '';
            draft.obtained_result = exec.obtained_result || '';
            draft._loaded = true;
        }
        const execDefects = exec ? (defectsByExec.get(exec.id) || []) : [];
        const isOpen = this.openFlowId === flow.id;
        const isSelected = isOpen;

        const statusButtons = STATUSES.map(s => `
            <button class="btn-status ${s.cls} ${(draft.status || exec?.status || 'PENDING').toUpperCase() === s.value ? 'active' : ''}"
                    data-status="${s.value}" data-tc-id="${flow.id}" ${isFinished ? 'disabled' : ''}>${s.label}</button>
        `).join('');

        const defectChip = execDefects.length > 0
            ? `<span class="expl-defect-chip" style="margin-left: 6px;">🐛 ${execDefects.length}</span>`
            : '';

        const lastExec = exec?.executed_at ? this._formatDate(exec.executed_at) : '—';

        const rowStyle = isSelected ? `
            background: var(--apple-indigo-soft);
            border-left: 3px solid var(--apple-blue);
        ` : `
            border-left: 3px solid transparent;
        `;

        const row = `
            <tr class="ts-grid-row ${isSelected ? 'selected' : ''} expl-flow-row" data-tc-id="${flow.id}"
                style="border-bottom: 1px solid var(--apple-separator); cursor: pointer; transition: all 0.15s ease; ${rowStyle}"
                onmouseover="if(!this.classList.contains('selected')) this.style.background='var(--apple-fill)'"
                onmouseout="if(!this.classList.contains('selected')) this.style.background='transparent'">
                <td style="padding: 12px 16px; font-weight: 700; color: var(--apple-blue); font-size: 0.75rem; width: 90px; white-space: nowrap; font-family: var(--apple-font-mono);">${UI.escapeHTML(flow.key_id || `TC-${flow.id}`)}</td>
                <td style="padding: 12px 16px; color: var(--apple-label); font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem;">${UI.escapeHTML(flow.title || `Flujo #${flow.id}`)}</span>
                        ${defectChip}
                    </div>
                </td>
                <td style="padding: 12px 16px; width: 280px;">
                    <div class="expl-status-group" data-tc-id="${flow.id}" style="display: inline-flex; gap: 4px;">
                        ${statusButtons}
                    </div>
                </td>
                <td style="padding: 12px 16px; font-size: 0.75rem; color: var(--apple-label-tertiary); width: 130px; white-space: nowrap;">${UI.escapeHTML(lastExec)}</td>
                <td style="padding: 12px 16px; text-align: center; width: 80px;">
                    <button class="btn btn-ghost btn-sm expl-btn-toggle-flow" data-tc-id="${flow.id}" title="${isOpen ? 'Cerrar' : 'Abrir'}" style="padding: 4px 10px; font-size: 0.7rem; font-weight: 600; border-radius: var(--apple-radius-sm);">${isOpen ? '▲' : '▼'}</button>
                </td>
            </tr>
        `;

        if (!isOpen) return row;

        // Fila expandida: vista lineal vertical. El test es un flujo natural:
        // leés los pasos, ves el resultado esperado, escribís el resultado real,
        // y si hay un bug lo reportás y adjuntás evidencia — todo en un scroll
        // continuo, sin tabs.
        const currentStatus = (draft.status || exec?.status || 'PENDING').toUpperCase();
        const isBlockOrSkip = currentStatus === 'BLOCK' || currentStatus === 'SKIP';
        const showBugDraft = currentStatus === 'FAIL' || currentStatus === 'WARNING';

        // Header de la fila expandida: key_id a la izquierda, metadatos básicos a la derecha.
        const execAt = exec?.executed_at ? new Date(exec.executed_at).toLocaleString() : '—';
        const tester = exec?.tester || '—';

        // Cuerpo principal: concatenamos los renderers existentes en orden natural.
        const body = this._renderFlowExpandedBody({
            flow, exec, execDefects, draft, attByExec, attByDef, isFinished, currentStatus,
            isBlockOrSkip, showBugDraft
        });

        const expanded = `
            <tr class="ts-expanded-row" data-tc-id="${flow.id}" style="border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated);">
                <td colspan="5" style="padding: 0;">
                    <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;">
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--apple-separator);">
                            <span style="font-size: 0.72rem; font-weight: 800; color: var(--apple-blue); letter-spacing: 0.03em; font-family: var(--apple-font-mono, monospace);">${UI.escapeHTML(flow.key_id || `TC-${flow.id}`)}</span>
                            <span style="font-size: 0.78rem; color: var(--apple-label-secondary); font-weight: 600;">${UI.escapeHTML(flow.title || `Flujo #${flow.id}`)}</span>
                            <div style="margin-left: auto; display: flex; gap: 14px; font-size: 0.7rem; color: var(--apple-label-tertiary);">
                                <span>👤 <strong style="color: var(--apple-label-secondary);">${UI.escapeHTML(tester)}</strong></span>
                                <span>🕐 <strong style="color: var(--apple-label-secondary);">${UI.escapeHTML(execAt)}</strong></span>
                            </div>
                        </div>
                        <div class="ts-expanded-body" style="display: flex; flex-direction: column; gap: 14px;">
                            ${body}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        return row + expanded;
    },

    // Renderiza el cuerpo de la fila expandida como una vista lineal vertical
    // (sin tabs). El flujo del test es: Pasos → Resultado esperado → Resultado
    // real → Justificación (si BLOCK/SKIP) → Reportar bug (si FAIL/WARN) → Evidencias.
    _renderFlowExpandedBody({ flow, exec, execDefects, draft, attByExec, attByDef, isFinished, currentStatus, isBlockOrSkip, showBugDraft }) {
        // 1) Pasos
        const stepsHtml = flow.steps
            ? `<div class="expl-flow-section">
                <div class="expl-flow-section-title">Pasos</div>
                <div class="expl-flow-context" data-tc-id="${flow.id}">
                    <div class="expl-flow-value">${UI.highlightSteps(flow.steps)}</div>
                </div>
               </div>`
            : `<div class="expl-flow-section">
                <div class="expl-flow-section-title">Pasos</div>
                <div class="expl-flow-value" style="color: var(--apple-label-tertiary); font-style: italic; padding: 4px 0;">Sin pasos registrados.</div>
               </div>`;

        // 2) Resultado esperado
        const expectedHtml = `<div class="expl-flow-section">
            <div class="expl-flow-section-title">Resultado esperado</div>
            ${flow.expected_result
                ? `<div class="expl-flow-context" data-tc-id="${flow.id}">
                    <div class="expl-flow-value">${UI.escapeHTML(flow.expected_result)}</div>
                   </div>`
                : `<div class="expl-flow-value" style="color: var(--apple-label-tertiary); font-style: italic; padding: 4px 0;">Sin resultado esperado registrado.</div>`}
        </div>`;

        // 3) Resultado real (textarea editable) — siempre visible
        const obtainedHtml = `<div class="expl-flow-section">
            ${this.renderObtainedResult(flow, draft, exec, isFinished)}
        </div>`;

        // 4) Justificación de bloqueo/salto (si aplica)
        const blockHtml = isBlockOrSkip
            ? `<div class="expl-flow-section">${this.renderBlockJustification(flow, draft, isFinished)}</div>`
            : '';

        // 5) Reportar bug (si FAIL o WARNING)
        const bugHtml = showBugDraft
            ? `<div class="expl-flow-section">${this.renderBugDraft(flow, exec, execDefects, draft, attByDef, isFinished)}</div>`
            : '';

        // 6) Bugs ya reportados (si hay defects persistidos y el draft está vacío)
        const persistedDefectsHtml = (!showBugDraft && execDefects && execDefects.length > 0)
            ? this._renderPersistedDefects(flow, execDefects, attByDef, isFinished)
            : '';

        // 7) Evidencias
        const evidenceHtml = `<div class="expl-flow-section">${this.renderEvidenceSection(flow, exec, execDefects, attByExec, attByDef, isFinished)}</div>`;

        return stepsHtml + expectedHtml + obtainedHtml + blockHtml + bugHtml + persistedDefectsHtml + evidenceHtml;
    },

    // Renderiza los defects ya persistidos como una lista colapsable (cuando no
    // estamos en modo draft — es decir, cuando el status ya no es FAIL/WARNING
    // pero los defects siguen asociados a la ejecución).
    _renderPersistedDefects(flow, execDefects, attByDef, isFinished) {
        const defectItems = execDefects.map(d => {
            const hasAttachments = (attByDef.get(d.id) || []).length > 0;
            return `
                <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-sm); padding: 10px 12px; margin-top: 6px; border: 1px solid var(--apple-separator); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; color: var(--apple-label); font-size: 0.85rem;">${UI.escapeHTML(d.title)}</div>
                        <div style="font-size: 0.7rem; color: var(--apple-label-secondary); margin-top: 2px;">
                            Severidad: <strong>${UI.escapeHTML(d.severity || 'Media')}</strong>${hasAttachments ? ' · 📎 Evidencias adjuntas' : ''}
                        </div>
                    </div>
                    <button class="btn btn-secondary expl-btn-convert-tc" data-defect-id="${d.id}" style="font-size: 0.72rem; padding: 4px 10px;">Enviar a TC</button>
                </div>
            `;
        }).join('');
        return `
            <div class="expl-flow-section">
                <div class="expl-flow-section-title">🐛 Bugs reportados</div>
                ${defectItems}
            </div>
        `;
    },

    _formatDate(d) {
        try {
            return new Date(d).toLocaleString();
        } catch (_e) {
            return '—';
        }
    },

    renderFlowCard(flow, exec, execDefects, attByExec, attByDef, draft, isFinished) {
        const currentStatus = (draft.status || exec?.status || 'PENDING').toUpperCase();
        const isPending = currentStatus === 'PENDING';
        const statusButtons = STATUSES.map(s => `
            <button class="btn-status ${s.cls} ${currentStatus === s.value ? 'active' : ''}"
                    data-status="${s.value}" data-tc-id="${flow.id}" ${isFinished ? 'disabled' : ''}>${s.label}</button>
        `).join('');

        const showBugDraft = currentStatus === 'FAIL' || currentStatus === 'WARNING';
        const bugDraftHtml = showBugDraft ? this.renderBugDraft(flow, exec, execDefects, draft, attByDef, isFinished) : '';
        const observationsHtml = (currentStatus === 'BLOCK' || currentStatus === 'SKIP') ? this.renderBlockJustification(flow, draft, isFinished) : '';
        const obtainedResultHtml = this.renderObtainedResult(flow, draft, exec, isFinished);
        const evidenceHtml = this.renderEvidenceSection(flow, exec, execDefects, attByExec, attByDef, isFinished);

        const defectChip = execDefects.length > 0
            ? `<span class="expl-defect-chip">🐛 ${execDefects.length} bug${execDefects.length > 1 ? 's' : ''}</span>`
            : '';

        return `
            <div class="expl-flow-card" data-tc-id="${flow.id}">
                <div class="expl-flow-header">
                    <div class="expl-flow-title">
                        <span class="expl-flow-key">${UI.escapeHTML(flow.key_id || `TC-${flow.id}`)}</span>
                        ${UI.escapeHTML(flow.title || `Flujo #${flow.id}`)}
                        ${defectChip}
                    </div>
                    <div class="expl-status-group" data-tc-id="${flow.id}">
                        ${statusButtons}
                    </div>
                </div>
                ${(flow.steps || flow.expected_result) ? `
                    <div class="expl-flow-context" data-tc-id="${flow.id}">
                        ${flow.steps ? `<div class="expl-flow-field"><span class="expl-flow-label">Pasos</span><div class="expl-flow-value">${UI.highlightSteps(flow.steps)}</div></div>` : ''}
                        ${flow.expected_result ? `<div class="expl-flow-field"><span class="expl-flow-label">Resultado esperado</span><div class="expl-flow-value">${UI.escapeHTML(flow.expected_result)}</div></div>` : ''}
                    </div>
                ` : ''}
                ${observationsHtml}
                ${obtainedResultHtml}
                ${bugDraftHtml}
                ${evidenceHtml}
            </div>
        `;
    },

    // Muestra el "Resultado Real" del flow: textarea editable si la sesión
    // está RUNNING, o solo-lectura si ya está finalizada. En cualquier caso,
    // se persiste en qa_executions.obtained_result al guardar.
    renderObtainedResult(flow, draft, exec, isFinished) {
        const value = draft.obtained_result || (exec && exec.obtained_result) || '';
        const isPersisted = !!(exec && exec.obtained_result);
        return `
            <div class="expl-flow-field expl-obtained-result" data-tc-id="${flow.id}">
                <span class="expl-flow-label">📝 Resultado Real${isPersisted ? ' <span style="color: var(--apple-green); font-size: 0.6rem;">✓ guardado</span>' : ''}</span>
                <textarea class="expl-flow-obtained-input" data-tc-id="${flow.id}"
                          placeholder="Describí brevemente el resultado real observado (aparecerá en el reporte HTML)."
                          style="width:100%; min-height:50px; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem; font-family: inherit; resize: vertical;"
                          ${isFinished ? 'disabled' : ''}>${UI.escapeHTML(value)}</textarea>
            </div>
        `;
    },

    renderBlockJustification(flow, draft, isFinished) {
        return `
            <div class="expl-bug-draft" style="grid-column: 1 / -1;">
                <label style="font-size:0.72rem; font-weight:700; color: var(--apple-label-secondary); text-transform: uppercase;">
                    ${currentStatusIsSkip(draft) ? 'Justificación del salto' : 'Justificación del bloqueo'}
                </label>
                <textarea class="expl-block-input" data-tc-id="${flow.id}" placeholder="Indica por qué..."
                          style="width:100%; min-height:60px; margin-top:6px; padding:8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-family: inherit; font-size: 0.82rem; resize: vertical;"
                          ${isFinished ? 'disabled' : ''}>${UI.escapeHTML(draft.observations || '')}</textarea>
            </div>
        `;
    },

    renderBugDraft(flow, exec, execDefects, draft, attByDef, isFinished) {
        // Si ya hay defectos persistidos, mostrarlos como resumen
        if (execDefects.length > 0 && !draft.bug) {
            const defectItems = execDefects.map(d => {
                const hasAttachments = (attByDef.get(d.id) || []).length > 0;
                return `
                    <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-sm); padding: 10px; margin-top: 6px; border: 1px solid var(--apple-separator);">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; color: var(--apple-label); font-size: 0.85rem;">${UI.escapeHTML(d.title)}</div>
                                <div style="font-size:0.72rem; color: var(--apple-label-secondary); margin-top: 2px;">
                                    Severidad: <strong>${UI.escapeHTML(d.severity || 'Media')}</strong>
                                    ${hasAttachments ? ' · 📎 Evidencias adjuntas' : ''}
                                </div>
                            </div>
                            <button class="btn btn-secondary expl-btn-convert-tc" data-defect-id="${d.id}" style="font-size:0.72rem; padding: 4px 10px;">Enviar a TC</button>
                        </div>
                    </div>
                `;
            }).join('');
            return `
                <div class="expl-bug-draft">
                    <div style="font-size:0.72rem; font-weight:700; color: var(--apple-label-secondary); text-transform: uppercase;">🐛 Bugs reportados</div>
                    ${defectItems}
                </div>
            `;
        }

        // Draft nuevo (aún no guardado)
        const bug = draft.bug || {};
        return `
            <div class="expl-bug-draft">
                <div style="font-size:0.72rem; font-weight:700; color: var(--apple-label-secondary); text-transform: uppercase;">🐛 Reportar nuevo bug</div>
                <div class="expl-bug-draft-grid">
                    <div style="grid-column: 1 / -1;">
                        <input class="expl-bug-title" data-tc-id="${flow.id}" placeholder="Título del bug" value="${escapeAttr(bug.title || '')}"
                               style="width:100%; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem;"
                               ${isFinished ? 'disabled' : ''}/>
                    </div>
                    <div>
                        <select class="expl-bug-severity" data-tc-id="${flow.id}" style="width:100%; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem;" ${isFinished ? 'disabled' : ''}>
                            ${SEVERITIES.map(s => `<option value="${s}" ${(bug.severity || 'Media') === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <input class="expl-bug-frequency" data-tc-id="${flow.id}" placeholder="Frecuencia (ej. Siempre)" value="${escapeAttr(bug.frequency || 'Siempre')}"
                               style="width:100%; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem;"
                               ${isFinished ? 'disabled' : ''}/>
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <textarea class="expl-bug-steps" data-tc-id="${flow.id}" placeholder="Pasos para reproducir"
                                  style="width:100%; min-height:50px; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem; font-family: inherit; resize: vertical;"
                                  ${isFinished ? 'disabled' : ''}>${UI.escapeHTML(bug.steps_to_reproduce || '')}</textarea>
                    </div>
                    <div>
                        <textarea class="expl-bug-expected" data-tc-id="${flow.id}" placeholder="Resultado esperado"
                                  style="width:100%; min-height:50px; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem; font-family: inherit; resize: vertical;"
                                  ${isFinished ? 'disabled' : ''}>${UI.escapeHTML(bug.expected_result || '')}</textarea>
                    </div>
                    <div>
                        <textarea class="expl-bug-actual" data-tc-id="${flow.id}" placeholder="Resultado actual"
                                  style="width:100%; min-height:50px; padding: 8px; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label); font-size: 0.82rem; font-family: inherit; resize: vertical;"
                                  ${isFinished ? 'disabled' : ''}>${UI.escapeHTML(bug.actual_result || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    },

    renderEvidenceSection(flow, exec, execDefects, attByExec, attByDef, isFinished) {
        const execAtts = exec ? (attByExec.get(exec.id) || []) : [];
        const defAtts = execDefects.flatMap(d => attByDef.get(d.id) || []);
        const allAtts = [...execAtts, ...defAtts];
        // Clave por flow.id → la evidencia queda atada al flujo (trazabilidad por TC),
        // no a una ejecución concreta. Se sube al execution_id que se cree al guardar.
        const pending = this._pendingEvidence.get(flow.id) || [];
        const controlsEnabled = !isFinished;

        return `
            <div class="expl-evidence-section">
                <div class="expl-evidence-header">
                    <div style="font-size:0.72rem; font-weight:700; color: var(--apple-label-secondary); text-transform: uppercase;">
                        📎 Evidencias de este flujo (${allAtts.length + pending.length})
                    </div>
                    ${controlsEnabled ? `
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="file" class="expl-evidence-input" data-tc-id="${flow.id}" accept="image/*" multiple style="display:none;"/>
                            <button class="btn btn-secondary expl-btn-add-evidence" data-tc-id="${flow.id}" style="font-size:0.72rem; padding: 4px 10px;">+ Adjuntar</button>
                            <select class="expl-evidence-category" data-tc-id="${flow.id}" style="padding: 4px 6px; font-size:0.72rem; border-radius: var(--apple-radius-sm); border:1px solid var(--apple-separator); background: var(--apple-bg); color: var(--apple-label);">
                                <option value="GENERAL">GENERAL</option>
                                <option value="BUG">BUG</option>
                                <option value="DEV">DEV</option>
                                <option value="FIGMA">FIGMA</option>
                            </select>
                        </div>
                    ` : ''}
                </div>
                <div class="expl-evidence-grid" data-tc-id="${flow.id}">
                    ${allAtts.map(a => `
                        <div class="expl-evidence-item" data-attachment-id="${a.id}">
                            <img src="/api/evidence/${a.id}" alt="${UI.escapeHTML(a.file_name)}" loading="lazy"/>
                            <span style="position:absolute; bottom:2px; left:2px; background: rgba(0,0,0,0.6); color: white; padding: 1px 4px; border-radius: 3px; font-size: 0.6rem;">${UI.escapeHTML(a.evidence_category || 'GENERAL')}</span>
                            <button class="expl-evidence-item-remove" data-attachment-id="${a.id}" data-tc-id="${flow.id}" title="Eliminar">✕</button>
                        </div>
                    `).join('')}
                    ${pending.map((p, idx) => `
                        <div class="expl-evidence-item" data-pending-idx="${idx}">
                            <img src="${p.dataUrl}" alt="${UI.escapeHTML(p.file.name)}"/>
                            <button class="expl-evidence-item-remove" data-pending-idx="${idx}" data-tc-id="${flow.id}">✕</button>
                        </div>
                    `).join('')}
                    ${(controlsEnabled && allAtts.length + pending.length === 0) ? `
                        <div class="expl-evidence-empty expl-evidence-drop-here" data-tc-id="${flow.id}">
                            📎 Solo para este flujo: pegá con <kbd>Ctrl</kbd>+<kbd>V</kbd>, arrastrá imágenes, o usá Adjuntar
                        </div>
                    ` : ''}
                    ${(!controlsEnabled && allAtts.length + pending.length === 0) ? `
                        <div class="expl-evidence-empty" style="cursor:default;">Sin evidencias.</div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // ─── Detail events ───
    bindDetailEvents(container, flows, execByTc, defectsByExec, attByExec, attByDef, isFinished) {
        container.querySelector('#expl-btn-back')?.addEventListener('click', () => {
            this.selectedRunId = null;
            this.sessionDetail = null;
            this.flowDrafts.clear();
            this._pendingEvidence.clear();
            invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
            this.render(container);
        });

        container.querySelector('#expl-btn-add-flow')?.addEventListener('click', () => {
            this.showAddFlowModal(container);
        });

        container.querySelector('#expl-btn-finish')?.addEventListener('click', async () => {
            const ok = await this.openLocalConfirm(
                'Finalizar sesión',
                'Una vez finalizada, no podrás agregar más flujos ni cambiar resultados. ¿Continuar?'
            );
            if (!ok) return;
            try {
                UI.showLoading();
                // 1) Persistir primero todos los drafts pendientes (status, obtained_result,
                //    observaciones, bugs) y subir las evidencias. Sin esto, los inputs
                //    editados se perderían al finalizar.
                const drafts = this.flowDrafts.get(this.selectedRunId) || {};
                const hasPending = Object.values(drafts).some(d => d && (d.status || d.obtained_result || d.observations || d.bug));
                if (hasPending) {
                    await this.saveAllFlows(container, flows, execByTc);
                }
                // 2) Subir cualquier evidencia pendiente que haya quedado sin subir
                for (const [flowId, files] of this._pendingEvidence.entries()) {
                    // Buscar el exec_id del flow (puede existir o no)
                    const exec = execByTc.get(flowId);
                    if (exec && files.length > 0) {
                        await this.uploadPendingEvidence(exec.id, files);
                    }
                }
                this._pendingEvidence.clear();

                // 3) Ahora sí, finalizar la sesión
                await ApiService.finishExploratorySession(this.selectedRunId);
                invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
                invalidateTabCache('exploratoria::active', Store.state.activeProjectId);
                invalidateTabCache('exploratoria::history', Store.state.activeProjectId);
                UI.toast('✅ Sesión finalizada');
                this.subTab = 'history';
                this.selectedRunId = null;
                this.sessionDetail = null;
                await this.render(container);
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoading();
            }
        });

        // Status buttons
        container.querySelectorAll('.expl-status-group .btn-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const tcId = parseInt(btn.dataset.tcId, 10);
                const status = btn.dataset.status;
                const drafts = this.flowDrafts.get(this.selectedRunId);
                if (!drafts[tcId]) drafts[tcId] = { _loaded: true };
                drafts[tcId].status = status;
                this.render(container);
            });
        });

        // Flow row click → toggle expanded row
        container.querySelectorAll('.expl-flow-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // No toggle si el click fue dentro de un status group
                if (e.target.closest('.expl-status-group')) return;
                const tcId = parseInt(row.dataset.tcId, 10);
                this.openFlowId = this.openFlowId === tcId ? null : tcId;
                this.render(container);
            });
        });

        // Botón explícito de toggle (▼/▲)
        container.querySelectorAll('.expl-btn-toggle-flow').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tcId = parseInt(btn.dataset.tcId, 10);
                this.openFlowId = this.openFlowId === tcId ? null : tcId;
                this.render(container);
            });
        });

        // Bug draft fields — bind change/blur
        container.querySelectorAll('.expl-bug-title, .expl-bug-severity, .expl-bug-frequency, .expl-bug-steps, .expl-bug-expected, .expl-bug-actual').forEach(input => {
            const handler = () => {
                const tcId = parseInt(input.dataset.tcId, 10);
                const drafts = this.flowDrafts.get(this.selectedRunId);
                if (!drafts[tcId]) drafts[tcId] = { _loaded: true };
                if (!drafts[tcId].bug) drafts[tcId].bug = {};
                if (input.classList.contains('expl-bug-title'))       drafts[tcId].bug.title = input.value;
                if (input.classList.contains('expl-bug-severity'))    drafts[tcId].bug.severity = input.value;
                if (input.classList.contains('expl-bug-frequency'))   drafts[tcId].bug.frequency = input.value;
                if (input.classList.contains('expl-bug-steps'))       drafts[tcId].bug.steps_to_reproduce = input.value;
                if (input.classList.contains('expl-bug-expected'))    drafts[tcId].bug.expected_result = input.value;
                if (input.classList.contains('expl-bug-actual'))      drafts[tcId].bug.actual_result = input.value;
            };
            input.addEventListener('input', handler);
            input.addEventListener('change', handler);
        });

        // Block input
        container.querySelectorAll('.expl-block-input').forEach(input => {
            input.addEventListener('input', () => {
                const tcId = parseInt(input.dataset.tcId, 10);
                const drafts = this.flowDrafts.get(this.selectedRunId);
                if (!drafts[tcId]) drafts[tcId] = { _loaded: true };
                drafts[tcId].observations = input.value;
            });
        });

        // Input "Resultado Real" — persiste en el draft para enviarse en el payload
        container.querySelectorAll('.expl-flow-obtained-input').forEach(input => {
            input.addEventListener('input', () => {
                const tcId = parseInt(input.dataset.tcId, 10);
                const drafts = this.flowDrafts.get(this.selectedRunId);
                if (!drafts[tcId]) drafts[tcId] = { _loaded: true };
                drafts[tcId].obtained_result = input.value;
            });
        });

        // Save buttons (one per flow card)
        flows.forEach(flow => {
            const exec = execByTc.get(flow.id);
            // El contenido del flujo vive dentro de la fila expandida (.ts-expanded-row)
            // o, si no está expandido, en la fila del table (.ts-grid-row). Usamos la
            // primera coincidencia de cualquiera de los dos contenedores.
            const card = container.querySelector(`.expl-flow-card[data-tc-id="${flow.id}"]`)
                || container.querySelector(`.expl-flow-row[data-tc-id="${flow.id}"]`)
                || container.querySelector(`.ts-expanded-row[data-tc-id="${flow.id}"]`);
            if (!card) return;
            // Re-bind status buttons after the card is in the DOM (already done above).
            // Add a save button dynamically? For now: auto-save on status change
            // via a save indicator at the right of the card. For simplicity, save
            // is triggered when the user clicks "Guardar" at the bottom of the bug draft,
            // or we save on every status change. Here we go for the "save on status change" model.

            // Convert-to-TC button (per defect)
            card.querySelectorAll('.expl-btn-convert-tc').forEach(btn => {
                btn.addEventListener('click', () => this.showConvertToTCModal(parseInt(btn.dataset.defectId, 10)));
            });

            // Evidence events
            this.bindEvidenceEvents(flow, exec, card);
        });

        // Save bar at bottom of detail (catches the OK/FAIL/WARN/BLOCK/SKIP save
        // for all flows in this session, including those without a bug draft).
        if (!isFinished) {
            this.renderSaveBar(container, flows, execByTc, defectsByExec);
        }
    },

    renderSaveBar(container, flows, execByTc, defectsByExec) {
        const bar = document.createElement('div');
        bar.style.cssText = 'position: sticky; bottom: 0; left: 0; right: 0; background: var(--apple-bg-elevated); border-top: 1px solid var(--apple-separator); padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; z-index: 5;';
        bar.innerHTML = `
            <div style="font-size: 0.78rem; color: var(--apple-label-secondary);">
                💾 Guardá los resultados de cada flujo para registrar la ejecución.
            </div>
            <button class="btn btn-primary" id="expl-btn-save-all" style="font-weight:700;">Guardar todo</button>
        `;
        // Insertar dentro del contenedor de la lista de flujos (no del .ts-main-content
        // entero, porque allí se perdería el sticky). Lo agregamos al #expl-flow-list
        // para que se mantenga pegado al fondo del área scrolleable.
        const list = container.querySelector('#expl-flow-list') || container.querySelector('.ts-main-content');
        if (list) list.appendChild(bar);

        bar.querySelector('#expl-btn-save-all')?.addEventListener('click', async () => {
            await this.saveAllFlows(container, flows, execByTc);
        });
    },

    async saveAllFlows(container, flows, execByTc) {
        const drafts = this.flowDrafts.get(this.selectedRunId);
        let saved = 0;
        let failed = 0;
        const allPendingEvidence = new Map(); // execId -> [files]
        const createdDefectIds = [];          // para subir evidencia luego

        UI.showLoading();
        try {
            for (const flow of flows) {
                const draft = drafts[flow.id];
                if (!draft || !draft.status || draft.status === 'PENDING') continue;

                // Build bug(s) array
                const bugs = [];
                if ((draft.status === 'FAIL' || draft.status === 'WARNING') && draft.bug && draft.bug.title) {
                    bugs.push(draft.bug);
                }

                const payload = {
                    run_id: this.selectedRunId,
                    status: draft.status,
                    observations: draft.observations || '',
                    obtained_result: draft.obtained_result || '',
                    bugs
                };

                try {
                    const res = await ApiService.executeExploratoryFlow(flow.id, payload);
                    if (res.execution_id) {
                        // Clave por flow.id → evidencia queda atada al flujo. Al guardar,
                        // movemos los pending al execution_id recién creado.
                        const pending = this._pendingEvidence.get(flow.id) || [];
                        if (pending.length > 0) allPendingEvidence.set(res.execution_id, pending);
                        if (res.defect_ids && res.defect_ids.length > 0) {
                            createdDefectIds.push(...res.defect_ids);
                        }
                    }
                    saved++;
                } catch (err) {
                    console.error('Error guardando flujo', flow.id, err);
                    failed++;
                }
            }

            // Subir evidencia pendiente al execution_id correspondiente
            for (const [execId, files] of allPendingEvidence.entries()) {
                await this.uploadPendingEvidence(execId, files);
            }
            this._pendingEvidence.clear();

            invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
            invalidateTabCache('exploratoria::active', Store.state.activeProjectId);
            invalidateTabCache('exploratoria::history', Store.state.activeProjectId);

            UI.toast(`✅ ${saved} flujo(s) guardado(s)${failed > 0 ? `, ${failed} con error` : ''}`);
            this.sessionDetail = null;
            await this.render(container);
        } catch (err) {
            UI.toast(err.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async uploadPendingEvidence(execId, files) {
        const errors = [];
        for (const f of files) {
            const formData = new FormData();
            formData.append('evidence', f.file);
            formData.append('execution_id', execId);
            formData.append('category', f.category || 'GENERAL');
            try {
                const res = await fetch('/api/evidence', { method: 'POST', body: formData });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    errors.push(`${f.file.name}: ${err.error || res.statusText}`);
                }
            } catch (err) {
                console.error('Error subiendo evidencia:', err);
                errors.push(`${f.file.name}: ${err.message}`);
            }
        }
        if (errors.length > 0) {
            UI.toast(`⚠️ ${errors.length} evidencia(s) con error: ${errors[0]}`, 'warn');
        }
    },

    // ─── Evidence binding (per flow card) ───
    bindEvidenceEvents(flow, exec, card) {
        // La sección de evidencia se muestra para CADA flow (trazabilidad por TC),
        // incluso antes de tener una ejecución guardada. Las imágenes pendientes
        // se acopian por flow.id; al guardar, se suben al execution_id resultante.
        const input = card.querySelector('.expl-evidence-input');
        const addBtn = card.querySelector('.expl-btn-add-evidence');
        const catSel = card.querySelector('.expl-evidence-category');
        const grid = card.querySelector('.expl-evidence-grid');
        const section = card.querySelector('.expl-evidence-section');

        if (!addBtn) return;

        const stageFile = (file) => {
            if (!file || !file.type || !file.type.startsWith('image/')) return;
            if (!this._pendingEvidence.has(flow.id)) this._pendingEvidence.set(flow.id, []);
            const category = catSel?.value || 'GENERAL';
            const reader = new FileReader();
            reader.onload = (e) => {
                const pending = this._pendingEvidence.get(flow.id);
                pending.push({ file, category, dataUrl: e.target.result });
                this.render(document.getElementById('tab-content'));
            };
            reader.readAsDataURL(file);
        };

        if (addBtn && input) {
            addBtn.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                const files = Array.from(input.files);
                files.forEach(stageFile);
                input.value = '';
            });
        }

        if (section) {
            section.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                let handled = false;
                for (const item of items) {
                    if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                        const blob = item.getAsFile();
                        if (!blob) continue;
                        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                        const file = new File([blob], `paste-${ts}.${ext}`, { type: blob.type });
                        stageFile(file);
                        handled = true;
                    }
                }
                if (handled) e.preventDefault();
            });
        }

        if (grid) {
            const dragHighlight = () => { grid.style.outline = '2px dashed var(--apple-blue)'; grid.style.outlineOffset = '4px'; };
            const dragUnhighlight = () => { grid.style.outline = ''; grid.style.outlineOffset = ''; };
            grid.addEventListener('dragover', (e) => { e.preventDefault(); dragHighlight(); });
            grid.addEventListener('dragleave', (e) => { if (e.target === grid) dragUnhighlight(); });
            grid.addEventListener('drop', (e) => {
                e.preventDefault();
                dragUnhighlight();
                const files = Array.from(e.dataTransfer?.files || []);
                files.forEach(stageFile);
            });
        }

        // ── Eliminar evidencia pendiente (clic en ✕ dentro de la miniatura) ──
        card.querySelectorAll('.expl-evidence-item-remove[data-pending-idx]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.pendingIdx, 10);
                const list = this._pendingEvidence.get(flow.id) || [];
                if (idx >= 0 && idx < list.length) {
                    list.splice(idx, 1);
                    if (list.length === 0) this._pendingEvidence.delete(flow.id);
                }
                this.render(document.getElementById('tab-content'));
            });
        });

        // ── Eliminar evidencia persistida (clic en ✕ sobre adjuntos ya subidos) ──
        card.querySelectorAll('.expl-evidence-item-remove[data-attachment-id]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('¿Eliminar esta evidencia?')) return;
                const attId = parseInt(btn.dataset.attachmentId, 10);
                try {
                    await ApiService.deleteEvidence(attId);
                    UI.toast('✅ Evidencia eliminada');
                    invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
                    this.sessionDetail = null;
                    this.render(document.getElementById('tab-content'));
                } catch (err) {
                    UI.toast(err.message || 'Error al eliminar', 'error');
                }
            });
        });
    },

    // ─── Modals ───
    // Modales locales — el sistema Modals no tiene un tipo genérico "prompt-multi",
    // así que se arman a mano con el mismo estilo que el resto (dialog.modal-native).
    openLocalConfirm(title, message) {
        return new Promise((resolve) => {
            const old = document.querySelector('dialog.expl-modal');
            if (old) old.remove();
            const dialog = document.createElement('dialog');
            dialog.className = 'modal-native expl-modal';
            dialog.innerHTML = `
                <div class="modal-content" style="width: 420px; padding: 28px; background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: 20px; box-shadow: var(--shadow-md);">
                    <h3 style="margin: 0 0 10px 0; font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; color: var(--apple-label);">${UI.escapeHTML(title)}</h3>
                    <p style="margin: 0 0 20px 0; color: var(--apple-label-tertiary); font-size: 0.88rem;">${UI.escapeHTML(message)}</p>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-sm expl-confirm-no">No</button>
                        <button class="btn btn-danger btn-sm expl-confirm-yes">Sí, finalizar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            dialog.showModal();
            const cleanup = (val) => { dialog.close(); dialog.remove(); resolve(val); };
            dialog.querySelector('.expl-confirm-no').addEventListener('click', () => cleanup(false));
            dialog.querySelector('.expl-confirm-yes').addEventListener('click', () => cleanup(true));
        });
    },

    openLocalModal(title, bodyHtml, onSubmit) {
        const old = document.querySelector('dialog.expl-modal');
        if (old) old.remove();
        const dialog = document.createElement('dialog');
        dialog.className = 'modal-native expl-modal';
        dialog.innerHTML = `
            <div class="modal-content" style="width: 500px; max-height: 90vh; overflow-y: auto; padding: 28px; background: var(--apple-bg-elevated); border: 1px solid var(--apple-separator); border-radius: 20px; box-shadow: var(--shadow-md);">
                <h3 style="margin: 0 0 6px 0; font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; color: var(--apple-label);">${UI.escapeHTML(title)}</h3>
                ${bodyHtml}
                <div style="display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end;">
                    <button class="btn btn-ghost btn-sm expl-modal-cancel">Cancelar</button>
                    <button class="btn btn-primary btn-sm expl-modal-confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();
        dialog.querySelector('.expl-modal-cancel').addEventListener('click', () => { dialog.close(); dialog.remove(); });
        dialog.querySelector('.expl-modal-confirm').addEventListener('click', async () => {
            const ok = await onSubmit(dialog);
            if (ok !== false) { dialog.close(); dialog.remove(); }
        });
        return dialog;
    },

    showStartSessionModal(container) {
        const projectId = Store.state.activeProjectId;
        this.openLocalModal('Nueva sesión de testing exploratorio', `
            <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 14px;">
                <div class="field-group">
                    <label class="field-label">Nombre de la sesión *</label>
                    <input type="text" id="expl-ms-name" placeholder="Ej. Smoke checkout" style="width: 100%;" />
                </div>
                <div class="field-group">
                    <label class="field-label">Charter / misión</label>
                    <textarea id="expl-ms-charter" placeholder="¿Qué vas a explorar?" style="width: 100%; min-height: 70px;"></textarea>
                </div>
                <div class="field-group">
                    <label class="field-label">Timebox (minutos)</label>
                    <input type="number" id="expl-ms-timebox" placeholder="Opcional" min="1" style="width: 100%;" />
                </div>
            </div>
        `, async (dialog) => {
            const name = dialog.querySelector('#expl-ms-name').value.trim();
            const charter = dialog.querySelector('#expl-ms-charter').value.trim();
            const timeboxRaw = dialog.querySelector('#expl-ms-timebox').value.trim();
            if (!name) { UI.toast('⚠️ Ingresá un nombre', 'error'); return false; }
            try {
                UI.showLoading();
                const res = await ApiService.startExploratorySession({
                    project_id: projectId,
                    name,
                    charter,
                    timebox_minutes: timeboxRaw ? parseInt(timeboxRaw, 10) : null
                });
                invalidateTabCache('exploratoria::active', projectId);
                invalidateTabCache('exploratoria::detail', projectId);
                UI.toast('✅ Sesión creada');
                this.selectedRunId = res.run_id;
                this.sessionDetail = null;
                this.flowDrafts.clear();
                await this.render(container);
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoading();
            }
            return true;
        });
    },

    showAddFlowModal(container) {
        this.openLocalModal('Agregar flujo', `
            <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 14px;">
                <div class="field-group">
                    <label class="field-label">Título del flujo *</label>
                    <input type="text" id="expl-af-title" placeholder="Ej. Login con email vacío" style="width: 100%;" />
                </div>
                <div class="field-group">
                    <label class="field-label">Pasos (opcional)</label>
                    <textarea id="expl-af-steps" placeholder="Pasos generales del flujo" style="width: 100%; min-height: 70px;"></textarea>
                </div>
                <div class="field-group">
                    <label class="field-label">Resultado esperado (opcional)</label>
                    <textarea id="expl-af-expected" placeholder="Qué esperás que pase" style="width: 100%; min-height: 50px;"></textarea>
                </div>
            </div>
        `, async (dialog) => {
            const title = dialog.querySelector('#expl-af-title').value.trim();
            const steps = dialog.querySelector('#expl-af-steps').value.trim();
            const expected = dialog.querySelector('#expl-af-expected').value.trim();
            if (!title) { UI.toast('⚠️ Ingresá un título', 'error'); return false; }
            try {
                UI.showLoading();
                await ApiService.addExploratoryFlow(this.selectedRunId, { title, steps, expected_result: expected });
                invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
                UI.toast('✅ Flujo agregado');
                await this.render(container);
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoading();
            }
            return true;
        });
    },

    async showConvertToTCModal(defectId) {
        const projectId = Store.state.activeProjectId;
        let suites = [];
        try {
            const res = await ApiService.getTestSuites(null, projectId);
            suites = res.test_suites || res.suites || res || [];
        } catch (err) {
            UI.toast(err.message, 'error');
            return;
        }
        this.openLocalModal('Promover bug a Test Case', `
            <div style="margin-top: 14px;">
                <div class="field-group">
                    <label class="field-label">Suite destino</label>
                    <select id="expl-conv-suite" style="width: 100%;">
                        <option value="">— Seleccioná una suite —</option>
                        ${suites.map(s => `<option value="${s.id}">${UI.escapeHTML(s.key_id || '')} · ${UI.escapeHTML(s.title)}</option>`).join('')}
                    </select>
                </div>
            </div>
        `, async (dialog) => {
            const suiteId = dialog.querySelector('#expl-conv-suite').value;
            if (!suiteId) { UI.toast('⚠️ Seleccioná una suite', 'error'); return false; }
            try {
                UI.showLoading();
                const res = await ApiService.convertHallazgoToTC(defectId, parseInt(suiteId, 10));
                UI.toast(`✅ TC creado: ${res.key_id || 'TC#' + res.tc_id}`);
                invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
                await this.render(document.getElementById('tab-content'));
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoading();
            }
            return true;
        });
    },

    // ─── Realtime ───
    bindRealtimeListener() {
        if (this._isListening) return;
        window.addEventListener('realtime-refresh', async () => {
            // Si la tab activa es exploratoria, refrescar
            if (Store.state.activeTab === 'exploratoria') {
                invalidateTabCache('exploratoria::detail', Store.state.activeProjectId);
                invalidateTabCache('exploratoria::active', Store.state.activeProjectId);
                invalidateTabCache('exploratoria::history', Store.state.activeProjectId);
                const container = document.getElementById('tab-content');
                if (container) await this.render(container);
            }
        });
        this._isListening = true;
    }
};

function currentStatusIsSkip(draft) {
    return (draft?.status || '').toUpperCase() === 'SKIP';
}
