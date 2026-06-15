import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const DashboardJiraTeam = {
    async render(container) {
        const { activeProjectId } = Store.state;
        if (!activeProjectId) return;

        UI.showLoading();
        try {
            const teamData = await ApiService.getJiraTeamProductivity(activeProjectId);
            this.renderLeaderboard(container, teamData);
        } catch (err) {
            UI.toast(err.message, 'error');
            container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
        }
        UI.hideLoading();
    },

    renderLeaderboard(container, teamData) {
        if (!teamData || teamData.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 60px;"><h3>Sin actividad en Jira</h3></div>`;
            return;
        }

        container.innerHTML = `
            <div style="padding: 32px;">
                <div style="margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 style="font-size: 1.4rem; font-weight: 900; color: var(--text-main);">Productividad de Equipo</h2>
                        <p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">Balance de carga total y eficiencia de resolución en Jira.</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 24px;">
                    ${teamData.map((user, index) => this.renderUserCard(user, index)).join('')}
                </div>
            </div>
        `;
    },

    renderUserCard(user, index) {
        const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
        const scoreColor = user.score > 80 ? '#36B37E' : (user.score > 50 ? '#FFAB00' : '#FF5630');
        const resolutionPct = user.totalWork > 0 ? Math.round((user.resolved / user.totalWork) * 100) : 0;

        return `
            <div class="team-card" style="background: var(--bg-surface); border-radius: 24px; border: 1px solid var(--border); padding: 24px; box-shadow: var(--shadow-sm); transition: transform 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="position: relative;">
                            ${user.avatar ? `<img src="${user.avatar}" style="width: 52px; height: 52px; border-radius: 14px;">` : `<div style="width: 52px; height: 52px; border-radius: 14px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; font-weight: 900;">${user.name[0]}</div>`}
                            <div style="position: absolute; -top: 8px; -left: 8px; font-size: 1.2rem;">${medal}</div>
                        </div>
                        <div>
                            <div style="font-size: 1rem; font-weight: 900; color: var(--text-main);">${user.name}</div>
                            <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Capacidad: ${user.totalWork} Bugs Totales</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.6rem; font-weight: 900; color: ${scoreColor}; line-height: 1;">${user.score}%</div>
                        <div style="font-size: 0.6rem; font-weight: 800; color: var(--text-muted); margin-top: 4px;">EFICIENCIA</div>
                    </div>
                </div>

                <!-- MÉTRICAS DE CARGA (macOS Cards) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                    <div style="background: var(--apple-fill-tertiary); padding: 16px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator);">
                        <div style="font-size: 0.6rem; font-weight: 800; color: var(--apple-label-secondary); margin-bottom: 6px; text-transform: uppercase;">Resueltos</div>
                        <div style="font-size: 1.2rem; font-weight: 900; color: var(--apple-green);">${user.resolved} <span style="font-size: 0.7rem; opacity: 0.7;">✔</span></div>
                        <div style="font-size: 0.55rem; color: var(--apple-label-tertiary); font-weight: 600;">En 30 días</div>
                    </div>
                    <div style="background: var(--apple-fill-tertiary); padding: 16px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator);">
                        <div style="font-size: 0.6rem; font-weight: 800; color: var(--apple-label-secondary); margin-bottom: 6px; text-transform: uppercase;">Ciclo Medio</div>
                        <div style="font-size: 1.2rem; font-weight: 900; color: var(--apple-label);">${user.avgDays} <span style="font-size: 0.7rem; opacity: 0.7;">d</span></div>
                        <div style="font-size: 0.55rem; color: var(--apple-label-tertiary); font-weight: 600;">Velocidad cierre</div>
                    </div>
                    <div style="background: ${user.avgOpenAge > 14 ? 'var(--apple-red-soft)' : 'var(--apple-fill-tertiary)'}; padding: 16px; border-radius: var(--apple-radius-md); border: 1px solid ${user.avgOpenAge > 14 ? 'var(--apple-red-soft)' : 'var(--apple-separator)'};">
                        <div style="font-size: 0.6rem; font-weight: 800; color: var(--apple-label-secondary); margin-bottom: 6px; text-transform: uppercase;">Aging Pend.</div>
                        <div style="font-size: 1.2rem; font-weight: 900; color: ${user.avgOpenAge > 14 ? 'var(--apple-red)' : 'var(--apple-label)'};">
                            ${user.avgOpenAge} <span style="font-size: 0.7rem; opacity: 0.7;">d</span>
                            ${user.avgOpenAge > 14 ? ' ⚠️' : ''}
                        </div>
                        <div style="font-size: 0.55rem; color: var(--apple-label-tertiary); font-weight: 600;">Tiempo espera</div>
                    </div>
                </div>

                <!-- RATIO DE RESOLUCIÓN (macOS Progress Bar) -->
                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; color: var(--apple-label-secondary); margin-bottom: 10px;">
                        <span>RATIO DE FINALIZACIÓN</span>
                        <span>${resolutionPct}%</span>
                    </div>
                    <div style="height: 8px; background: var(--apple-fill); border-radius: var(--apple-radius-full); overflow: hidden; display: flex;">
                        <div style="width: ${resolutionPct}%; background: var(--apple-green); height: 100%;"></div>
                        <div style="width: ${100 - resolutionPct}%; background: var(--apple-orange); height: 100%; opacity: 0.3;"></div>
                    </div>
                </div>
            </div>
        `;
    }
};
