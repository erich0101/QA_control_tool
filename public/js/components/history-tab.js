import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { ExecutionTab } from './execution-tab.js';
import { Modals } from './modals.js';
import { modalManager } from '../utils/modal-manager.js';

export const HistoryTab = {
    runs: [],
    bugs: [],
    currentTab: 'runs', // 'runs' | 'bugs'
    selectedRunIds: new Set(),
    selectedBugIds: new Set(),
    dateFrom: '',
    dateTo: '',
    bugsDateFrom: '',
    bugsDateTo: '',
    expandedGroups: new Set(), // ids de grupos expandidos (year, month, day) — runs
    expandedBugGroups: new Set(), // ids de grupos expandidos (year, month, day) — bugs

    async render(container) {
        const scrollPos = container.scrollTop;
        const { activeProjectId } = Store.state;
        if (!activeProjectId) {
            container.innerHTML = '<div class="empty-state"><h3>Historial de Ejecución</h3><p>Selecciona un proyecto para ver el historial.</p></div>';
            return;
        }

        UI.showLoading();
        try {
            if (this.currentTab === 'runs') {
                const res = await ApiService.getHistory(activeProjectId);
                this.runs = res.runs || [];
            } else {
                const res = await ApiService.getProjectDefects(activeProjectId);
                this.bugs = res.defects || [];

                const jiraRes = await ApiService.getDefectsJiraStatus(activeProjectId);
                const jiraStatuses = jiraRes.statuses || {};
                for (const bug of this.bugs) {
                    if (bug.jira_key && jiraStatuses[bug.jira_key]) {
                        bug.jira_status = jiraStatuses[bug.jira_key].status;
                        bug.jira_statusCategory = jiraStatuses[bug.jira_key].statusCategory;
                    }
                }
            }
        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        container.innerHTML = `
            <div style="padding: 20px 24px; border-bottom: 1px solid var(--apple-separator); background: var(--apple-bg-elevated);">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 0.85rem; font-weight: 700; color: var(--apple-label);">${this.currentTab === 'runs' ? '📋 Ciclos de Ejecución' : '🐞 Historial de Defectos'}</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);">${this.currentTab === 'runs' ? this.runs.length + ' ciclos' : this.bugs.length + ' bugs'}</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${this.currentTab === 'runs' && this.selectedRunIds.size >= 2 ? `
                            <button class="btn btn-primary btn-sm" id="btn-consolidated-report" style="padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 600;">
                                📊 Reporte Consolidado (${this.selectedRunIds.size})
                            </button>
                        ` : ''}
                        ${this.currentTab === 'bugs' && this.selectedBugIds.size >= 1 ? `
                            <button class="btn btn-primary btn-sm" id="btn-batch-jira" style="padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 600; background: var(--apple-blue); border: none; color: white;">
                                🚀 Crear tickets en Jira (${this.selectedBugIds.size})
                            </button>
                        ` : ''}
                        <button class="btn btn-ghost btn-sm" id="btn-refresh-history" style="padding: 6px 12px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🔄 Recargar</button>
                    </div>
                </div>

                <div style="display: flex; gap: 4px; background: var(--apple-fill); padding: 3px; border-radius: 20px;">
                    <button class="sub-tab-btn ${this.currentTab === 'runs' ? 'active' : ''}" data-tab="runs" style="padding: 6px 16px; border-radius: 18px; border: none; background: ${this.currentTab === 'runs' ? 'var(--apple-blue)' : 'transparent'}; color: ${this.currentTab === 'runs' ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">
                        📋 Ejecuciones
                    </button>
                    <button class="sub-tab-btn ${this.currentTab === 'bugs' ? 'active' : ''}" data-tab="bugs" style="padding: 6px 16px; border-radius: 18px; border: none; background: ${this.currentTab === 'bugs' ? 'var(--apple-blue)' : 'transparent'}; color: ${this.currentTab === 'bugs' ? 'white' : 'var(--apple-label-secondary)'}; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">
                        🐞 Bugs & Defectos
                    </button>
                </div>
            </div>

            <div class="tt-container" style="padding: 16px 24px;">
                ${this.currentTab === 'runs' ? this.renderRunsView() : this.renderBugsView()}
            </div>
        `;

        this.bindEvents(container);
        container.scrollTop = scrollPos;
    },

    renderRunsView() {
        const filtered = this.getFilteredRuns();
        const tree = this.buildRunsTree(filtered);

        if (this.runs.length === 0) {
            return `<div style="text-align: center; padding: 60px; color: var(--apple-label-tertiary); background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">No hay ejecuciones finalizadas aún.</div>`;
        }
        if (filtered.length === 0) {
            return `<div style="text-align: center; padding: 40px; color: var(--apple-label-tertiary); background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">Sin ejecuciones en el rango seleccionado (${this.runs.length} totales).</div>`;
        }

        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--apple-fill); border-bottom: 1px solid var(--apple-separator); flex-wrap: wrap;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">📅 Periodo</span>
                    <input type="date" id="runs-date-from" value="${UI.escapeHTML(this.dateFrom)}" style="padding: 5px 8px; border-radius: var(--apple-radius-sm); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.75rem;" title="Fecha desde">
                    <span style="color: var(--apple-label-tertiary); font-size: 0.75rem;">→</span>
                    <input type="date" id="runs-date-to" value="${UI.escapeHTML(this.dateTo)}" style="padding: 5px 8px; border-radius: var(--apple-radius-sm); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.75rem;" title="Fecha hasta">
                    <button class="btn btn-ghost btn-sm" id="runs-clear-dates" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">Limpiar</button>
                    <span style="margin-left: auto; font-size: 0.72rem; color: var(--apple-label-tertiary);">${filtered.length} de ${this.runs.length} ejecuciones</span>
                </div>
                <div style="padding: 8px 0;">
                    ${tree}
                </div>
            </div>
        `;
    },

    getFilteredRuns() {
        return this.runs.filter(run => {
            if (!this.dateFrom && !this.dateTo) return true;
            const end = new Date(run.finished_at);
            if (this.dateFrom) {
                const from = new Date(this.dateFrom + 'T00:00:00');
                if (end < from) return false;
            }
            if (this.dateTo) {
                const to = new Date(this.dateTo + 'T23:59:59');
                if (end > to) return false;
            }
            return true;
        });
    },

    buildRunsTree(runs) {
        const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        // Agrupar por año > mes > día
        const byYear = {};
        runs.forEach(run => {
            const d = new Date(run.finished_at);
            const y = d.getFullYear();
            const m = d.getMonth();
            const day = d.getDate();
            if (!byYear[y]) byYear[y] = {};
            if (!byYear[y][m]) byYear[y][m] = {};
            if (!byYear[y][m][day]) byYear[y][m][day] = [];
            byYear[y][m][day].push(run);
        });

        const years = Object.keys(byYear).sort((a, b) => b - a);
        if (years.length === 0) return '';

        return years.map(y => {
            const yKey = `y-${y}`;
            const yExpanded = this.expandedGroups.has(yKey) || this.expandedGroups.size === 0;
            const yRuns = years.reduce((acc, _y) => acc.concat(...Object.values(byYear[_y] || {}).flatMap(m => Object.values(m).flat()), []), []).filter(r => new Date(r.finished_at).getFullYear() === Number(y));
            // Más simple: contar runs del año
            const yCount = Object.values(byYear[y]).reduce((acc, m) => acc + Object.values(m).reduce((a, d) => a + d.length, 0), 0);
            const yPass = yRuns.reduce((a, r) => a + (r.stats?.pass || 0), 0);
            const yTotal = yRuns.reduce((a, r) => a + (r.stats?.total || 0), 0);

            return `
                <div data-group="${yKey}">
                    <div class="runs-group-row" data-group-key="${yKey}" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--apple-bg-elevated); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                        <span style="font-size: 0.78rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${yExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                        <span style="font-size: 0.85rem; font-weight: 800; color: var(--apple-label);">📅 ${y}</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.65rem; font-weight: 600; color: var(--apple-label-secondary);">${yCount} ejecuciones</span>
                        ${yTotal > 0 ? `<span style="font-size: 0.7rem; color: var(--apple-green); font-weight: 600;">${Math.round((yPass / yTotal) * 100)}% OK</span>` : ''}
                    </div>
                    ${yExpanded ? Object.keys(byYear[y]).sort((a, b) => b - a).map(m => {
                        const mKey = `m-${y}-${m}`;
                        const mExpanded = this.expandedGroups.has(mKey) || this.expandedGroups.size === 0;
                        const mRuns = Object.values(byYear[y][m]).flat();
                        const mCount = mRuns.length;
                        const mPass = mRuns.reduce((a, r) => a + (r.stats?.pass || 0), 0);
                        const mTotal = mRuns.reduce((a, r) => a + (r.stats?.total || 0), 0);
                        return `
                            <div data-group="${mKey}">
                                <div class="runs-group-row" data-group-key="${mKey}" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px 8px 36px; background: var(--apple-fill-tertiary); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                                    <span style="font-size: 0.72rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${mExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--apple-label);">${MONTHS[Number(m)]}</span>
                                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-bg-elevated); font-size: 0.65rem; font-weight: 600; color: var(--apple-label-secondary);">${mCount} ejecuciones</span>
                                    ${mTotal > 0 ? `<span style="font-size: 0.68rem; color: var(--apple-green); font-weight: 600;">${Math.round((mPass / mTotal) * 100)}% OK</span>` : ''}
                                </div>
                                ${mExpanded ? Object.keys(byYear[y][m]).sort((a, b) => b - a).map(day => {
                                    const dayKey = `d-${y}-${m}-${day}`;
                                    const dayExpanded = this.expandedGroups.has(dayKey) || this.expandedGroups.size === 0;
                                    const dayRuns = byYear[y][m][day];
                                    const dayCount = dayRuns.length;
                                    const dayPass = dayRuns.reduce((a, r) => a + (r.stats?.pass || 0), 0);
                                    const dayTotal = dayRuns.reduce((a, r) => a + (r.stats?.total || 0), 0);
                                    const dayDate = new Date(Number(y), Number(m), Number(day));
                                    const dayLabel = dayDate.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
                                    return `
                                        <div data-group="${dayKey}">
                                            <div class="runs-group-row" data-group-key="${dayKey}" style="display: flex; align-items: center; gap: 8px; padding: 7px 16px 7px 60px; background: var(--apple-bg-primary); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                                                <span style="font-size: 0.7rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${dayExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                                                <span style="font-size: 0.78rem; font-weight: 600; color: var(--apple-label);">${dayLabel}</span>
                                                <span style="font-size: 0.65rem; color: var(--apple-label-tertiary);">${dayRuns[0] ? new Date(dayRuns[0].finished_at).toLocaleDateString('es-AR') : ''}</span>
                                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);">${dayCount} ejecuciones</span>
                                                ${dayTotal > 0 ? `<span style="font-size: 0.65rem; color: var(--apple-green); font-weight: 600;">${Math.round((dayPass / dayTotal) * 100)}% OK</span>` : ''}
                                            </div>
                                            ${dayExpanded ? dayRuns.map(run => this.renderRunRowCompact(run)).join('') : ''}
                                        </div>
                                    `;
                                }).join('') : ''}
                            </div>
                        `;
                    }).join('') : ''}
                </div>
            `;
        }).join('');
    },

    renderRunRowCompact(run) {
        const start = new Date(run.started_at);
        const end = new Date(run.finished_at);
        const duration = this.formatDuration(start, end);
        const { pass, fail, warn, block, skip, total } = run.stats;
        const passPct = (pass/total)*100;
        const failPct = (fail/total)*100;
        const warnPct = (warn/total)*100;
        const blockPct = (block/total)*100;
        const skipPct = (skip/total)*100;
        const isSelected = this.selectedRunIds.has(run.id);

        return `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 16px 10px 84px; border-bottom: 1px solid var(--apple-separator); background: ${isSelected ? 'var(--apple-blue-soft)' : 'transparent'};">
                <input type="checkbox" class="run-checkbox" data-id="${run.id}" ${isSelected ? 'checked' : ''} style="flex-shrink: 0;">
                <span style="font-size: 0.7rem; color: var(--apple-label-tertiary); min-width: 36px;">#${run.id}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--apple-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(run.suite_title)}</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 20px; font-size: 0.58rem; font-weight: 600; background: var(--apple-fill); color: var(--apple-label-secondary);">
                            ${run.run_type === 'SMOKE' ? '💨' : ''}${run.run_type === 'REGRESSION' ? '🔄' : ''}${run.run_type === 'INTEGRATION' ? '🔗' : ''}${run.run_type === 'EXPLORATORY' ? '🔍' : ''}${run.run_type === 'RETEST' ? '🔁' : ''} ${UI.escapeHTML(run.run_type)}
                        </span>
                    </div>
                    <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); margin-top: 2px;">
                        🕐 ${start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ⏱ ${duration} · 👤 ${UI.escapeHTML(run.tester_name || '—')}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; min-width: 120px;">
                    <div style="width: 80px; height: 4px; border-radius: 2px; overflow: hidden; background: var(--apple-fill); display: flex;">
                        <div title="PASS: ${pass}" style="width: ${passPct}%; background: var(--apple-green);"></div>
                        <div title="FAIL: ${fail}" style="width: ${failPct}%; background: var(--apple-red);"></div>
                        <div title="BLOCK: ${block}" style="width: ${blockPct}%; background: var(--apple-orange);"></div>
                        <div title="SKIP: ${skip}" style="width: ${skipPct}%; background: var(--apple-label-tertiary);"></div>
                    </div>
                    <span style="font-size: 0.65rem; color: var(--apple-green); font-weight: 600; min-width: 32px;">${pass}</span>
                    <span style="font-size: 0.65rem; color: var(--apple-red); font-weight: 600; min-width: 28px;">${fail}</span>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button class="btn btn-ghost btn-sm btn-view-report" data-id="${run.id}" title="Ver Reporte" style="padding: 3px 8px; border-radius: var(--apple-radius-sm); font-size: 0.7rem;">📄</button>
                    <button class="btn btn-ghost btn-sm btn-view-bugs" data-id="${run.id}" title="Ver Defectos" ${fail === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} style="padding: 3px 8px; border-radius: var(--apple-radius-sm); font-size: 0.7rem;">🐛</button>
                    <button class="btn btn-sm btn-retest" data-id="${run.id}" title="Retesting" style="padding: 3px 8px; border-radius: var(--apple-radius-sm); font-size: 0.7rem;">🔁</button>
                </div>
            </div>
        `;
    },

    renderBugsView() {
        const filtered = this.getFilteredBugs();
        const tree = this.buildBugsTree(filtered);

        if (this.bugs.length === 0) {
            return `<div style="text-align: center; padding: 60px; color: var(--apple-label-tertiary); background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">No hay bugs registrados en este proyecto.</div>`;
        }
        if (filtered.length === 0) {
            return `<div style="text-align: center; padding: 40px; color: var(--apple-label-tertiary); background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator);">Sin bugs en el rango seleccionado (${this.bugs.length} totales).</div>`;
        }

        return `
            <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--apple-fill); border-bottom: 1px solid var(--apple-separator); flex-wrap: wrap;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">📅 Periodo</span>
                    <input type="date" id="bugs-date-from" value="${UI.escapeHTML(this.bugsDateFrom)}" style="padding: 5px 8px; border-radius: var(--apple-radius-sm); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.75rem;" title="Fecha desde">
                    <span style="color: var(--apple-label-tertiary); font-size: 0.75rem;">→</span>
                    <input type="date" id="bugs-date-to" value="${UI.escapeHTML(this.bugsDateTo)}" style="padding: 5px 8px; border-radius: var(--apple-radius-sm); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.75rem;" title="Fecha hasta">
                    <button class="btn btn-ghost btn-sm" id="bugs-clear-dates" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">Limpiar</button>
                    <span style="margin-left: auto; font-size: 0.72rem; color: var(--apple-label-tertiary);">${filtered.length} de ${this.bugs.length} bugs</span>
                </div>
                <div style="padding: 8px 0;">
                    ${tree}
                </div>
            </div>
        `;
    },

    getFilteredBugs() {
        return this.bugs.filter(bug => {
            if (!this.bugsDateFrom && !this.bugsDateTo) return true;
            const created = new Date(bug.created_at);
            if (this.bugsDateFrom) {
                const from = new Date(this.bugsDateFrom + 'T00:00:00');
                if (created < from) return false;
            }
            if (this.bugsDateTo) {
                const to = new Date(this.bugsDateTo + 'T23:59:59');
                if (created > to) return false;
            }
            return true;
        });
    },

    buildBugsTree(bugs) {
        const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const byYear = {};
        bugs.forEach(bug => {
            const d = new Date(bug.created_at);
            const y = d.getFullYear();
            const m = d.getMonth();
            const day = d.getDate();
            if (!byYear[y]) byYear[y] = {};
            if (!byYear[y][m]) byYear[y][m] = {};
            if (!byYear[y][m][day]) byYear[y][m][day] = [];
            byYear[y][m][day].push(bug);
        });

        const years = Object.keys(byYear).sort((a, b) => b - a);
        if (years.length === 0) return '';

        return years.map(y => {
            const yKey = `by-${y}`;
            const yExpanded = this.expandedBugGroups.has(yKey) || this.expandedBugGroups.size === 0;
            const yBugs = years.reduce((acc, _y) => acc.concat(...Object.values(byYear[_y] || {}).flatMap(m => Object.values(m).flat())), []).filter(b => new Date(b.created_at).getFullYear() === Number(y));
            const yCount = Object.values(byYear[y]).reduce((acc, m) => acc + Object.values(m).reduce((a, d) => a + d.length, 0), 0);
            const yCritical = yBugs.filter(b => b.severity === 'Crítica' || b.severity === 'Alta').length;

            return `
                <div data-group="${yKey}">
                    <div class="bugs-group-row" data-group-key="${yKey}" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--apple-bg-elevated); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                        <span style="font-size: 0.78rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${yExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                        <span style="font-size: 0.85rem; font-weight: 800; color: var(--apple-label);">📅 ${y}</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.65rem; font-weight: 600; color: var(--apple-label-secondary);">${yCount} bugs</span>
                        ${yCritical > 0 ? `<span style="font-size: 0.68rem; color: var(--apple-red); font-weight: 700;">⚠ ${yCritical} críticos</span>` : ''}
                    </div>
                    ${yExpanded ? Object.keys(byYear[y]).sort((a, b) => b - a).map(m => {
                        const mKey = `bm-${y}-${m}`;
                        const mExpanded = this.expandedBugGroups.has(mKey) || this.expandedBugGroups.size === 0;
                        const mBugs = Object.values(byYear[y][m]).flat();
                        const mCount = mBugs.length;
                        const mCritical = mBugs.filter(b => b.severity === 'Crítica' || b.severity === 'Alta').length;
                        return `
                            <div data-group="${mKey}">
                                <div class="bugs-group-row" data-group-key="${mKey}" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px 8px 36px; background: var(--apple-fill-tertiary); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                                    <span style="font-size: 0.72rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${mExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--apple-label);">${MONTHS[Number(m)]}</span>
                                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-bg-elevated); font-size: 0.65rem; font-weight: 600; color: var(--apple-label-secondary);">${mCount} bugs</span>
                                    ${mCritical > 0 ? `<span style="font-size: 0.65rem; color: var(--apple-red); font-weight: 600;">⚠ ${mCritical} críticos</span>` : ''}
                                </div>
                                ${mExpanded ? Object.keys(byYear[y][m]).sort((a, b) => b - a).map(day => {
                                    const dayKey = `bd-${y}-${m}-${day}`;
                                    const dayExpanded = this.expandedBugGroups.has(dayKey) || this.expandedBugGroups.size === 0;
                                    const dayBugs = byYear[y][m][day];
                                    const dayCount = dayBugs.length;
                                    const dayCritical = dayBugs.filter(b => b.severity === 'Crítica' || b.severity === 'Alta').length;
                                    const dayDate = new Date(Number(y), Number(m), Number(day));
                                    const dayLabel = dayDate.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
                                    return `
                                        <div data-group="${dayKey}">
                                            <div class="bugs-group-row" data-group-key="${dayKey}" style="display: flex; align-items: center; gap: 8px; padding: 7px 16px 7px 60px; background: var(--apple-bg-primary); cursor: pointer; border-bottom: 1px solid var(--apple-separator); user-select: none;">
                                                <span style="font-size: 0.7rem; color: var(--apple-label-tertiary); transition: transform 0.15s; transform: ${dayExpanded ? 'rotate(90deg)' : 'rotate(0)'};">▶</span>
                                                <span style="font-size: 0.78rem; font-weight: 600; color: var(--apple-label);">${dayLabel}</span>
                                                <span style="font-size: 0.65rem; color: var(--apple-label-tertiary);">${dayBugs[0] ? new Date(dayBugs[0].created_at).toLocaleDateString('es-AR') : ''}</span>
                                                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: var(--apple-fill); font-size: 0.62rem; font-weight: 600; color: var(--apple-label-secondary);">${dayCount} bugs</span>
                                                ${dayCritical > 0 ? `<span style="font-size: 0.65rem; color: var(--apple-red); font-weight: 600;">⚠ ${dayCritical}</span>` : ''}
                                            </div>
                                            ${dayExpanded ? dayBugs.map(bug => this.renderBugRowCompact(bug)).join('') : ''}
                                        </div>
                                    `;
                                }).join('') : ''}
                            </div>
                        `;
                    }).join('') : ''}
                </div>
            `;
        }).join('');
    },

    renderBugRowCompact(bug) {
        const canSelect = !bug.jira_key;
        const isSelected = this.selectedBugIds.has(bug.id);
        const sevBg = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'rgba(255,59,48,0.1)' : 'rgba(255,149,0,0.1)';
        const sevColor = (bug.severity === 'Crítica' || bug.severity === 'Alta') ? 'var(--apple-red)' : 'var(--apple-orange)';
        const dateStr = new Date(bug.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

        return `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 16px 10px 84px; border-bottom: 1px solid var(--apple-separator); background: ${isSelected ? 'var(--apple-blue-soft)' : 'transparent'};">
                <input type="checkbox" class="bug-checkbox" data-id="${bug.id}" ${isSelected ? 'checked' : ''} ${canSelect ? '' : 'disabled'} style="cursor: ${canSelect ? 'pointer' : 'not-allowed'}; flex-shrink: 0;">
                <span style="font-size: 0.7rem; color: var(--apple-label-tertiary); min-width: 36px;">#${bug.id}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.8rem; font-weight: 600; color: var(--apple-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(bug.title || 'Sin título')}</div>
                    <div style="font-size: 0.65rem; color: var(--apple-label-tertiary); margin-top: 2px;">
                        🏷 ${UI.escapeHTML(bug.tc_key || '—')} · 👤 ${UI.escapeHTML(bug.tester_name || '—')}
                    </div>
                </div>
                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; background: ${sevBg}; color: ${sevColor};">
                    ${UI.escapeHTML(bug.severity || 'Media')}
                </span>
                <div style="display: flex; align-items: center; gap: 6px; min-width: 100px;">
                    ${bug.jira_key
                        ? `<a href="${UI.escapeHTML(bug.jira_url)}" target="_blank" rel="noopener" style="font-size: 0.7rem; font-weight: 600; color: var(--apple-blue); text-decoration: none;" title="Abrir en JIRA">${UI.escapeHTML(bug.jira_key)} ↗</a>`
                        : `<span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.62rem; font-weight: 600; background: ${bug.status === 'FIXED' ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.status === 'FIXED' ? 'var(--apple-green)' : 'var(--apple-orange)'};">${UI.escapeHTML(bug.status)}</span>`
                    }
                </div>
                <span style="font-size: 0.65rem; color: var(--apple-label-tertiary); min-width: 50px; text-align: right;">${dateStr}</span>
                <button class="btn btn-ghost btn-sm btn-view-bug-details" data-id="${bug.id}" title="Ver Detalle" style="padding: 3px 8px; border-radius: var(--apple-radius-sm); font-size: 0.7rem; flex-shrink: 0;">🔍</button>
            </div>
        `;
    },

    renderRunRow(run) {
        const start = new Date(run.started_at);
        const end = new Date(run.finished_at);
        const duration = this.formatDuration(start, end);
        const { pass, fail, warn, block, skip, total } = run.stats;
        const passPct = (pass/total)*100;
        const failPct = (fail/total)*100;
        const warnPct = (warn/total)*100;
        const blockPct = (block/total)*100;
        const skipPct = (skip/total)*100;

        return `
            <tr style="border-bottom: 1px solid var(--apple-separator);">
                <td style="padding: 12px; text-align: center;"><input type="checkbox" class="run-checkbox" data-id="${run.id}" ${this.selectedRunIds.has(run.id) ? 'checked' : ''}></td>
                <td style="padding: 12px; font-size: 0.75rem; color: var(--apple-label-tertiary);">#${run.id}</td>
                <td style="padding: 12px;">
                    <div style="font-weight: 600; color: var(--apple-label); font-size: 0.85rem;">${UI.escapeHTML(run.suite_title)}</div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; font-size: 0.6rem; font-weight: 600; background: var(--apple-fill); color: var(--apple-label-secondary);">
                            ${run.run_type === 'SMOKE' ? '💨' : ''}${run.run_type === 'REGRESSION' ? '🔄' : ''}${run.run_type === 'INTEGRATION' ? '🔗' : ''}${run.run_type === 'EXPLORATORY' ? '🔍' : ''}${run.run_type === 'RETEST' ? '🔁' : ''} ${UI.escapeHTML(run.run_type)}
                        </span>
                    </div>
                </td>
                <td style="padding: 12px; font-size: 0.78rem; color: var(--apple-label-secondary);">${start.toLocaleString()}</td>
                <td style="padding: 12px; font-size: 0.78rem; color: var(--apple-label-secondary);">${end.toLocaleString()}</td>
                <td style="padding: 12px;"><span style="display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; background: var(--apple-fill); color: var(--apple-label-secondary);">${duration}</span></td>
                <td style="padding: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, var(--apple-blue), var(--apple-indigo)); display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: white;">${run.tester_name ? UI.escapeHTML(run.tester_name.charAt(0)) : '?'}</span>
                        <span style="font-size: 0.78rem; color: var(--apple-label);">${UI.escapeHTML(run.tester_name || 'Desconocido')}</span>
                    </div>
                </td>
                <td style="padding: 12px;">
                    <div style="width: 100%; display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--apple-fill);">
                        <div title="PASS: ${pass}" style="width: ${passPct}%; background: var(--apple-green);"></div>
                        <div title="FAIL: ${fail}" style="width: ${failPct}%; background: var(--apple-red);"></div>
                        <div title="BLOCK: ${block}" style="width: ${blockPct}%; background: var(--apple-orange);"></div>
                        <div title="SKIP: ${skip}" style="width: ${skipPct}%; background: var(--apple-label-tertiary);"></div>
                    </div>
                    <div style="display: flex; justify-content: center; gap: 8px; margin-top: 6px; font-size: 0.6rem; font-weight: 600; flex-wrap: wrap;">
                        <span style="color: var(--apple-green);">${pass} OK</span>
                        <span style="color: var(--apple-red);">${fail} FAIL</span>
                        <span style="color: var(--apple-orange);">${block} BLK</span>
                        <span style="color: var(--apple-label-tertiary);">${skip} SKP</span>
                    </div>
                </td>
                <td style="padding: 12px; text-align: right;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-sm btn-view-report" data-id="${run.id}" title="Ver Reporte" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">📄</button>
                        <button class="btn btn-ghost btn-sm btn-view-bugs" data-id="${run.id}" title="Ver Defectos" ${fail === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🐛</button>
                        <button class="btn btn-sm btn-retest" data-id="${run.id}" title="Retesting" style="padding: 4px 10px; border-radius: var(--apple-radius-sm); font-size: 0.72rem;">🔁 Retest</button>
                    </div>
                </td>
            </tr>
        `;
    },

    formatDuration(start, end) {
        const diff = end - start;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    },

    updateConsolidatedButton(container) {
        const toolbarRight = container.querySelector('.tab-toolbar-right');
        if (!toolbarRight) return;

        const existingBtn = toolbarRight.querySelector('#btn-consolidated-report');
        if (this.selectedRunIds.size >= 2) {
            if (!existingBtn) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-sm';
                btn.id = 'btn-consolidated-report';
                btn.innerHTML = `📊 Reporte Consolidado (${this.selectedRunIds.size})`;
                btn.addEventListener('click', () => {
                    const ids = [...this.selectedRunIds].join(',');
                    window.open(`/api/reports/multi?ids=${ids}`, '_blank');
                });
                toolbarRight.insertBefore(btn, toolbarRight.firstChild);
            } else {
                existingBtn.innerHTML = `📊 Reporte Consolidado (${this.selectedRunIds.size})`;
            }
        } else if (existingBtn) {
            existingBtn.remove();
        }
    },

    rerenderRunsView(container) {
        const tree = container.querySelector('.tt-container');
        if (tree) {
            tree.innerHTML = this.currentTab === 'runs' ? this.renderRunsView() : this.renderBugsView();
            this.bindEvents(container);
        }
    },

    bindEvents(container) {
        container.querySelector('#btn-refresh-history')?.addEventListener('click', () => this.render(container));

        container.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTab = btn.dataset.tab;
                this.render(container);
            });
        });

        if (this.currentTab === 'runs') {
            container.querySelectorAll('.btn-retest').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    if (!await modalManager.confirm('¿Deseas iniciar un nuevo ciclo de retesting para esta suite? Se activará en la pestaña de Ejecución.')) return;
                    
                    UI.showLoading();
                    try {
                        const res = await ApiService.retestRun(id);
                        UI.toast('Ciclo de retesting iniciado. Ve a la pestaña Ejecución.');
                        ExecutionTab.projectSuites = [];
                        ExecutionTab.expandedSuiteId = parseInt(res.suite_id || 0);
                        window.dispatchEvent(new CustomEvent('change-tab', { detail: 'execution' }));
                    } catch (err) {
                        UI.toast(err.message, 'error');
                    }
                    UI.hideLoading();
                });
            });

            container.querySelectorAll('.btn-view-report').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    window.open(`/api/reports/${id}`, '_blank');
                });
            });

            container.querySelectorAll('.btn-view-bugs').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    UI.showLoading();
                    try {
                        const res = await ApiService.getRunBugs(id);
                        Modals.render('view-bugs', { runId: id, bugs: res.bugs || [] });
                    } catch (err) {
                        UI.toast(err.message, 'error');
                    }
                    UI.hideLoading();
                });
            });

            // Checkbox handlers para selección múltiple
            container.querySelectorAll('.run-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    const id = parseInt(cb.dataset.id);
                    if (cb.checked) {
                        this.selectedRunIds.add(id);
                    } else {
                        this.selectedRunIds.delete(id);
                    }
                    this.updateConsolidatedButton(container);
                });
            });

            const selectAll = container.querySelector('#select-all-runs');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    const filtered = this.getFilteredRuns();
                    if (selectAll.checked) {
                        filtered.forEach(r => this.selectedRunIds.add(r.id));
                    } else {
                        filtered.forEach(r => this.selectedRunIds.delete(r.id));
                    }
                    container.querySelectorAll('.run-checkbox').forEach(cb => {
                        cb.checked = selectAll.checked;
                    });
                    this.updateConsolidatedButton(container);
                });
            }

            // Filtro de fechas
            const dateFromInput = container.querySelector('#runs-date-from');
            const dateToInput = container.querySelector('#runs-date-to');
            if (dateFromInput) {
                dateFromInput.addEventListener('change', (e) => {
                    this.dateFrom = e.target.value;
                    this.rerenderRunsView(container);
                });
            }
            if (dateToInput) {
                dateToInput.addEventListener('change', (e) => {
                    this.dateTo = e.target.value;
                    this.rerenderRunsView(container);
                });
            }
            const clearDatesBtn = container.querySelector('#runs-clear-dates');
            if (clearDatesBtn) {
                clearDatesBtn.addEventListener('click', () => {
                    this.dateFrom = '';
                    this.dateTo = '';
                    this.expandedGroups.clear();
                    this.rerenderRunsView(container);
                });
            }

            // Toggles de grupo (colapsar/expandir)
            container.querySelectorAll('.runs-group-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('input,button,select,label')) return;
                    const key = row.dataset.groupKey;
                    if (this.expandedGroups.has(key)) {
                        this.expandedGroups.delete(key);
                    } else {
                        this.expandedGroups.add(key);
                    }
                    this.rerenderRunsView(container);
                });
            });

            const consolidatedBtn = container.querySelector('#btn-consolidated-report');
            if (consolidatedBtn) {
                consolidatedBtn.addEventListener('click', () => {
                    const ids = [...this.selectedRunIds].join(',');
                    window.open(`/api/reports/multi?ids=${ids}`, '_blank');
                });
            }
        } else {
            // Eventos de la pestaña de BUGS
            container.querySelectorAll('.btn-view-bug-details').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = parseInt(btn.dataset.id);
                    const bug = this.bugs.find(b => b.id === id);
                    if (bug) {
                        const content = this.getBugDetailsHtml(bug);
                        UI.showSidePanel('DETALLE TÉCNICO DE DEFECTO', content);
                        this.initJiraIntegration(bug);
                    }
                });
            });

            // Checkbox individual de bug
            container.querySelectorAll('.bug-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    const id = parseInt(cb.dataset.id);
                    if (cb.checked) {
                        this.selectedBugIds.add(id);
                    } else {
                        this.selectedBugIds.delete(id);
                    }
                    this.updateBatchJiraToolbar(container);
                    this.updateBugRowHighlight(cb, container);
                });
            });

            // Filtro de fechas para bugs
            const bugsDateFromInput = container.querySelector('#bugs-date-from');
            const bugsDateToInput = container.querySelector('#bugs-date-to');
            if (bugsDateFromInput) {
                bugsDateFromInput.addEventListener('change', (e) => {
                    this.bugsDateFrom = e.target.value;
                    this.rerenderBugsView(container);
                });
            }
            if (bugsDateToInput) {
                bugsDateToInput.addEventListener('change', (e) => {
                    this.bugsDateTo = e.target.value;
                    this.rerenderBugsView(container);
                });
            }
            const clearBugsDatesBtn = container.querySelector('#bugs-clear-dates');
            if (clearBugsDatesBtn) {
                clearBugsDatesBtn.addEventListener('click', () => {
                    this.bugsDateFrom = '';
                    this.bugsDateTo = '';
                    this.expandedBugGroups.clear();
                    this.rerenderBugsView(container);
                });
            }

            // Toggles de grupo del árbol de bugs
            container.querySelectorAll('.bugs-group-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('input,button,select,label,a')) return;
                    const key = row.dataset.groupKey;
                    if (this.expandedBugGroups.has(key)) {
                        this.expandedBugGroups.delete(key);
                    } else {
                        this.expandedBugGroups.add(key);
                    }
                    this.rerenderBugsView(container);
                });
            });

            // Botón "Crear tickets en Jira (N)"
            const batchBtn = container.querySelector('#btn-batch-jira');
            if (batchBtn) {
                batchBtn.addEventListener('click', () => {
                    const selectedBugs = this.bugs.filter(b => this.selectedBugIds.has(b.id));
                    if (selectedBugs.length === 0) return;
                    Modals.render('batch-jira-tickets', {
                        bugs: selectedBugs,
                        onComplete: async () => {
                            this.selectedBugIds.clear();
                            await this.render(container);
                        }
                    });
                });
            }
        }
    },

    rerenderBugsView(container) {
        const tree = container.querySelector('.tt-container');
        if (tree) {
            tree.innerHTML = this.currentTab === 'bugs' ? this.renderBugsView() : this.renderRunsView();
            this.bindEvents(container);
        }
    },

    updateBugRowHighlight(checkbox, container) {
        // Resalta o desresalta la fila del bug sin re-renderizar nada.
        // Las filas pueden ser <tr> (vista clásica) o <div> (vista compacta de árbol).
        const row = checkbox.closest('tr') || checkbox.closest('[data-bug-id], div[style*="padding-left: 84px"]') || checkbox.parentElement;
        if (!row) return;
        if (checkbox.checked) {
            row.style.background = 'var(--apple-blue-soft)';
        } else {
            row.style.background = '';
        }
    },

    updateBatchJiraToolbar(container) {
        // Actualiza solo el botón "Crear tickets en Jira (N)" del toolbar sin re-renderizar la lista
        const headerRight = container.querySelector('.tt-container')?.previousElementSibling?.querySelector('div[style*="justify-content: flex-end"]') ||
                            container.querySelector('div[style*="display: flex; gap: 8px; align-items: center;"]');
        if (!headerRight) return;

        const count = this.selectedBugIds.size;
        const existingBtn = headerRight.querySelector('#btn-batch-jira');
        if (count >= 1) {
            if (existingBtn) {
                existingBtn.innerHTML = `🚀 Crear tickets en Jira (${count})`;
            } else {
                const btn = document.createElement('button');
                btn.id = 'btn-batch-jira';
                btn.className = 'btn btn-primary btn-sm';
                btn.style.cssText = 'padding: 6px 14px; border-radius: var(--apple-radius-sm); font-size: 0.72rem; font-weight: 600; background: var(--apple-blue); border: none; color: white;';
                btn.innerHTML = `🚀 Crear tickets en Jira (${count})`;
                btn.addEventListener('click', () => {
                    const selectedBugs = this.bugs.filter(b => this.selectedBugIds.has(b.id));
                    if (selectedBugs.length === 0) return;
                    Modals.render('batch-jira-tickets', {
                        bugs: selectedBugs,
                        onComplete: async () => {
                            this.selectedBugIds.clear();
                            await this.render(container);
                        }
                    });
                });
                // Insertar antes del botón "Recargar"
                const refreshBtn = headerRight.querySelector('#btn-refresh-history');
                if (refreshBtn) {
                    headerRight.insertBefore(btn, refreshBtn);
                } else {
                    headerRight.appendChild(btn);
                }
            }
        } else if (existingBtn) {
            existingBtn.remove();
        }
    },

    async initJiraIntegration(bug) {
        if (bug.jira_key) return;

        const container = document.getElementById('jira-integration-container');
        const epicSelect = document.getElementById('jira-epic-select');
        const assigneeSelect = document.getElementById('jira-assignee-select');
        const prioritySelect = document.getElementById('jira-priority-select');
        const btnCreate = document.getElementById('btn-create-jira');
        const successContainer = document.getElementById('jira-success-container');
        const ticketLink = document.getElementById('jira-ticket-link');

        try {
            const projectId = Store.state.activeProjectId || bug.project_id;
            if (!projectId) return;

            container.style.display = 'block';
            
            // 1. Cargar Contexto Completo
            const { epics, users, priorities, customFields, error } = await ApiService.getJiraContext(projectId);
            
            if (error) {
                UI.toast(error, 'warn');
                epicSelect.innerHTML = '<option value="">— ' + (error.includes('token') ? 'Configura tu token' : error) + ' —</option>';
                assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>';
                prioritySelect.innerHTML = '<option value="">Media</option>';
            } else {
                if (epics && epics.length > 0) {
                    epicSelect.innerHTML = '<option value="">— Sin Épica (General) —</option>' + 
                        epics.map(e => `<option value="${e.id}">${UI.escapeHTML(e.key)} | ${UI.escapeHTML(e.summary)}</option>`).join('');
                } else {
                    epicSelect.innerHTML = '<option value="">— Sin Épicas disponibles —</option>';
                }

                assigneeSelect.innerHTML = '<option value="">— Sin asignar —</option>' + 
                    (users || []).map(u => `<option value="${u.accountId}">${UI.escapeHTML(u.displayName)}</option>`).join('');

                prioritySelect.innerHTML = (priorities || []).map(p => 
                    `<option value="${p.id}" ${p.name === 'Medium' ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>`
                ).join('');
            }

            const customFieldsContainer = document.getElementById('jira-custom-fields-container');
            if (customFields && customFields.length > 0) {
                let html = '';
                for (const field of customFields) {
                    html += `<div class="field-group" style="margin-bottom: 16px;">
                        <label class="field-label" style="font-size: 0.68rem;">${UI.escapeHTML(field.name)}${field.required ? ' *' : ''}</label>`;
                    if (field.options && field.options.length > 0) {
                        html += `<select id="jira-cf-${field.fieldId}" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                            <option value="">— Seleccionar —</option>`;
                        for (const opt of field.options) {
                            html += `<option value="${opt.id}">${UI.escapeHTML(opt.name)}</option>`;
                        }
                        html += `</select>`;
                    } else {
                        html += `<input type="text" id="jira-cf-${field.fieldId}" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);" placeholder="Ingresar valor...">`;
                    }
                    html += `</div>`;
                }
                customFieldsContainer.innerHTML = html;
                customFieldsContainer.style.display = 'block';
            } else {
                customFieldsContainer.style.display = 'none';
            }

            btnCreate.onclick = async () => {
                const epicId = epicSelect.value;
                const assigneeId = assigneeSelect.value;
                const priorityId = prioritySelect.value;

                const customFieldValues = {};
                if (customFields && customFields.length > 0) {
                    for (const field of customFields) {
                        const el = document.getElementById(`jira-cf-${field.fieldId}`);
                        if (el && el.value) {
                            const val = el.value;
                            customFieldValues[field.fieldId] = field.options?.length > 0 ? { id: val } : val;
                        }
                    }
                }

                btnCreate.disabled = true;
                btnCreate.innerText = '⌛ CREANDO TICKET...';

                try {
                    const result = await ApiService.createJiraBug(bug.id, epicId, assigneeId, priorityId, customFieldValues);
                    bug.jira_key = result.jira.key;
                    bug.jira_url = result.jira.browser_url;
                    container.style.display = 'none';
                    successContainer.style.display = 'block';
                    
                    ticketLink.innerText = result.jira.key;
                    ticketLink.href = result.jira.browser_url;
                    
                    let toastMsg = 'Ticket de Jira creado exitosamente';
                    if (result.attachment_count > 0) {
                        toastMsg += ` — ${result.attachment_count} evidencia(s) adjuntada(s)`;
                    }
                    if (result.attachment_errors && result.attachment_errors.length > 0) {
                        toastMsg += ` (${result.attachment_errors.length} error(es) al adjuntar)`;
                        console.warn('Errores al adjuntar evidencias:', result.attachment_errors);
                    }
                    UI.toast(toastMsg);
                } catch (err) {
                    UI.toast(err.message, 'error');
                    btnCreate.disabled = false;
                    btnCreate.innerText = '🚀 CREAR TICKET EN JIRA';
                }
            };

        } catch (err) {
            console.log('Jira no configurado o error al cargar:', err.message);
        }
    },

    getBugDetailsHtml(bug) {
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h4 style="margin: 0; color: var(--apple-red); font-size: 0.92rem; font-weight: 700;">ID: #${bug.id}</h4>
                    <p style="color: var(--apple-label-tertiary); margin-top: 4px; font-size: 0.72rem;">Reportado en: ${new Date(bug.created_at).toLocaleString()}</p>
                </div>
                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 4px 12px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; background: ${bug.status === 'FIXED' ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color: ${bug.status === 'FIXED' ? 'var(--apple-green)' : 'var(--apple-orange)'};">
                    ${bug.status}
                </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">TÍTULO DEL BUG</label>
                    <div style="padding: 10px 12px; background: var(--apple-fill); border-radius: var(--apple-radius-md); font-weight: 600; font-size: 0.88rem; color: var(--apple-label);">
                        ${UI.escapeHTML(bug.title)}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">TEST CASE ORIGEN</label>
                    <div style="padding: 10px 12px; background: var(--apple-fill); border-radius: var(--apple-radius-md); color: var(--apple-blue); font-weight: 600; font-size: 0.82rem;">
                        ${UI.escapeHTML(bug.tc_key)} - ${UI.escapeHTML(bug.tc_title)}
                    </div>
                </div>

                ${bug.description ? `
                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">DESCRIPCIÓN GENERAL</label>
                    <div style="padding: 12px; background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); white-space: pre-wrap; font-size: 0.85rem; line-height: 1.6; color: var(--apple-label);">
                        ${UI.escapeHTML(bug.description)}
                    </div>
                </div>
                ` : ''}

                <div class="field-group">
                    <label class="field-label" style="font-size: 0.68rem;">PASOS PARA REPRODUCIR</label>
                    <div style="padding: 12px; background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); border-radius: var(--apple-radius-md); white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; line-height: 1.6; color: var(--apple-label-secondary);">
                        ${UI.escapeHTML(bug.steps_to_reproduce || 'No se proporcionaron pasos.')}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="field-group">
                        <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-green); text-transform: uppercase; margin-bottom: 6px;">✔️ Resultado Esperado</div>
                        <div style="padding: 10px 12px; background: rgba(52,199,89,0.06); border: 1px solid rgba(52,199,89,0.12); border-radius: var(--apple-radius-md); min-height: 70px; font-size: 0.85rem; color: var(--apple-label);">
                            ${UI.escapeHTML(bug.expected_result || '—')}
                        </div>
                    </div>
                    <div class="field-group">
                        <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-red); text-transform: uppercase; margin-bottom: 6px;">❌ Resultado Actual</div>
                        <div style="padding: 10px 12px; background: rgba(255,59,48,0.06); border: 1px solid rgba(255,59,48,0.12); border-radius: var(--apple-radius-md); min-height: 70px; font-size: 0.85rem; color: var(--apple-label);">
                            ${UI.escapeHTML(bug.actual_result || '—')}
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--apple-bg-elevated); padding: 14px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator);">
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.65rem;">SEVERIDAD</label>
                        <span style="font-weight: 700; color: var(--apple-red); font-size: 0.85rem;">${UI.escapeHTML(bug.severity)}</span>
                    </div>
                    <div class="field-group">
                        <label class="field-label" style="font-size: 0.65rem;">FRECUENCIA</label>
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--apple-label);">${UI.escapeHTML(bug.frequency || 'Siempre')}</span>
                    </div>
                    <div class="field-group" style="grid-column: span 2;">
                        <label class="field-label" style="font-size: 0.65rem;">IMPACTO EN EL NEGOCIO</label>
                        <span style="font-size: 0.82rem; color: var(--apple-label-secondary);">${UI.escapeHTML(bug.business_impact || 'No especificado')}</span>
                    </div>
                </div>

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--apple-separator); display: flex; flex-direction: column; gap: 10px;">
                    <div style="font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase;">Metadatos de Reporte</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
                        <span style="color: var(--apple-label-secondary);">Reportado por:</span>
                        <span style="font-weight: 600; color: var(--apple-label);">${UI.escapeHTML(bug.tester_name || 'Desconocido')}</span>
                    </div>
                </div>

                <div id="jira-custom-fields-container" style="margin-top: 16px; display: none;"></div>

                <div id="jira-integration-container" style="margin-top: 20px; padding: 18px; background: var(--apple-blue-soft); border: 1px solid rgba(0,122,255,0.15); border-radius: var(--apple-radius-lg); display: ${bug.jira_key ? 'none' : 'block'};">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
                        <img src="https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png" style="width: 16px; height: 16px;">
                        <span style="font-size: 0.72rem; font-weight: 700; color: var(--apple-blue); text-transform: uppercase; letter-spacing: 0.04em;">Integración con Jira</span>
                    </div>
                    
                    <div class="field-group" style="margin-bottom: 14px;">
                        <label class="field-label" style="font-size: 0.68rem;">ÉPICA DESTINO</label>
                        <select id="jira-epic-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                            <option value="">Cargando...</option>
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.68rem;">ASIGNADO A</label>
                            <select id="jira-assignee-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label class="field-label" style="font-size: 0.68rem;">PRIORIDAD</label>
                            <select id="jira-priority-select" style="width: 100%; font-size: 0.82rem; padding: 8px 12px; border-radius: var(--apple-radius-md); background: var(--apple-bg-tertiary); border: 1px solid var(--apple-separator); color: var(--apple-label);">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                    </div>

                    <button id="btn-create-jira" class="btn btn-primary" style="width: 100%; background: var(--apple-blue); border: none; font-weight: 600; font-size: 0.82rem; padding: 10px; border-radius: var(--apple-radius-md); color: white; cursor: pointer;">
                        🚀 Crear Ticket en Jira
                    </button>
                </div>

                <div id="jira-success-container" style="margin-top: 20px; padding: 14px; background: rgba(52,199,89,0.06); border: 1px solid rgba(52,199,89,0.15); border-radius: var(--apple-radius-lg); display: ${bug.jira_key ? 'block' : 'none'}; text-align: center;">
                    <div style="font-size: 0.82rem; font-weight: 600; color: var(--apple-green); margin-bottom: 6px;">✅ Ticket de Jira vinculado</div>
                    <a id="jira-ticket-link" href="${bug.jira_url || '#'}" target="_blank" style="font-size: 0.88rem; font-weight: 700; color: var(--apple-blue); text-decoration: none;">
                        ${bug.jira_key || 'BUG-XXX'}
                    </a>
                </div>
            </div>
        `;
    }
};
