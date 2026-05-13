import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const DashboardJiraDaily = {
    lastStats: null,

    async render(container) {
        const { activeProjectId } = Store.state;
        if (!activeProjectId) return;

        UI.showLoading();
        try {
            this.lastStats = await ApiService.getJiraDailyStats(activeProjectId);
            this.renderDesign(container, this.lastStats);
        } catch (err) {
            UI.toast(err.message, 'error');
            container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
        }
        UI.hideLoading();
    },

    renderDesign(container, stats) {
        if (!stats || stats.error) {
            container.innerHTML = `<div style="text-align: center; padding: 60px;"><h3>Configuración pendiente</h3></div>`;
            return;
        }

        const urgentTickets = stats.issues
            .filter(i => i.statusCategory !== 'done')
            .sort((a, b) => {
                const priorityOrder = { 'Highest': 0, 'Crítica': 0, 'High': 1, 'Alta': 1, 'Medium': 2, 'Media': 2 };
                const pA = priorityOrder[a.priority] ?? 5;
                const pB = priorityOrder[b.priority] ?? 5;
                if (pA !== pB) return pA - pB;
                return new Date(a.created) - new Date(b.created);
            })
            .slice(0, 8);

        container.innerHTML = `
            <div style="padding: 24px; background: #0b0e14; min-height: 100%; color: #e1e1e1; font-family: 'Inter', sans-serif;">
                
                <!-- TOP KPIs -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px;">
                    ${this.renderTopCard('LEAD TIME', stats.avgResolutionDays + ' días', '🕒', '#2e3c54', 'LEAD')}
                    ${this.renderTopCard('BUGS ABIERTOS', stats.openCount, '🐞', '#3d2024', 'OPEN')}
                    ${this.renderTopCard('CERRADOS HOY', stats.closedToday, '✅', '#1e3a2f', 'CLOSED_TODAY')}
                    ${this.renderTopCard('ANTIGÜEDAD CRÍTICA', stats.issues.filter(i => (new Date() - new Date(i.created)) / (1000*60*60*24) > 7 && i.statusCategory !== 'done').length, '⚠️', '#3d341a', 'CRITICAL_AGE')}
                </div>
                       <!-- TEAM WORKLOAD SECTION (Horizontal) -->
                <div style="margin-bottom: 32px; animation: fadeIn 0.8s ease-out;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-left: 4px;">
                        <span style="font-size: 1.2rem;">👥</span>
                        <h3 style="margin: 0; font-size: 0.9rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Carga por Responsable</h3>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
                        ${Object.entries(stats.assigneeCounts).sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([name, count]) => {
                            const userIssue = stats.issues.find(i => i.assignee === name);
                            const pct = Math.min(100, (count / 12) * 100);
                            const color = count > 8 ? '#ff4d4f' : (count > 4 ? '#ffab00' : '#4285f4');
                            return `
                                <div class="user-avatar-trigger" data-user="${name}" style="background: #14181f; border-radius: 16px; border: 1px solid #232933; padding: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;" onmouseover="this.style.borderColor='${color}'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.borderColor='#232933'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                        <div style="position: relative;">
                                            ${userIssue?.avatar ? `<img src="${userIssue.avatar}" style="width: 40px; height: 40px; border-radius: 12px; border: 2px solid #1c222b;">` : `<div style="width: 40px; height: 40px; border-radius: 12px; background: #1c222b; display: flex; align-items: center; justify-content: center; font-size: 1rem; color: #fff;">${name[0]}</div>`}
                                            <div style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: #36b37e; border-radius: 50%; border: 2px solid #14181f;"></div>
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 0.8rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                                            <div style="font-size: 0.65rem; color: #848d9a;">${count} tickets activos</div>
                                        </div>
                                    </div>
                                    <div style="height: 4px; background: #1c222b; border-radius: 2px; overflow: hidden;">
                                        <div style="height: 100%; width: ${pct}%; background: ${color}; box-shadow: 0 0 10px ${color}44;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- MAIN TABLES SECTION -->
                <div style="display: flex; flex-direction: column; gap: 32px;">
                    
                    <!-- FOCO DE LA DAILY (FULL WIDTH) -->
                    <div style="background: #14181f; border-radius: 16px; border: 1px solid #232933; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);">
                        <div style="padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #232933;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="color: #ff4d4f;">🛡️</span>
                                <h3 style="margin: 0; font-size: 0.9rem; font-weight: 800;">Foco de la Daily</h3>
                            </div>
                            <span style="background: rgba(255,77,79,0.1); color: #ff4d4f; padding: 4px 12px; border-radius: 8px; font-size: 0.7rem; font-weight: 900;">${urgentTickets.length} URGENTES</span>
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="text-align: left; background: #1a1f26; border-bottom: 1px solid #232933;">
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: #848d9a;">TICKET</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: #848d9a;">ESTADO</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: #848d9a;">TÍTULO</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: #848d9a;">RESPONSABLE</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: #848d9a;">ANTIG.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${urgentTickets.map(issue => {
                                    const ticketUrl = stats.jiraUrl ? stats.jiraUrl.replace(/\/$/, '') + '/browse/' + issue.key : '#';
                                    return `
                                        <tr style="border-bottom: 1px solid #1c222b;">
                                            <td style="padding: 16px 24px; font-weight: 900; color: #4285f4; font-size: 0.75rem;">
                                                <a href="${ticketUrl}" target="_blank" style="color: #4285f4; text-decoration: none; border-bottom: 1px solid transparent;" onmouseover="this.style.borderBottom='1px solid #4285f4'" onmouseout="this.style.borderBottom='1px solid transparent'">${issue.key}</a>
                                            </td>
                                            <td style="padding: 16px 24px;">
                                                <span style="background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color}; padding: 4px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">${this.getStatusTag(issue).text}</span>
                                            </td>
                                            <td style="padding: 16px 24px; font-size: 0.75rem; color: #e1e1e1; max-width: 400px; line-height: 1.4;">${UI.escapeHTML(issue.summary)}</td>
                                            <td style="padding: 16px 24px;">
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    ${issue.avatar ? `<img src="${issue.avatar}" style="width: 20px; height: 20px; border-radius: 50%;">` : ''}
                                                    <span style="font-size: 0.7rem; color: #848d9a;">${issue.assignee}</span>
                                                </div>
                                            </td>
                                            <td style="padding: 16px 24px; font-size: 0.7rem; font-weight: 800; color: ${this.formatAge(issue.created).color}">${this.formatAge(issue.created).text}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- BOTTOM: RESUMEN DE DAILY (FULL WIDTH) -->
                <div style="margin-top: 32px; background: #14181f; border-radius: 16px; border: 1px solid #232933; overflow: hidden; animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <div style="padding: 24px; border-bottom: 1px solid #232933; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 800; color: #fff;">Resumen de Daily (Ciclo 48h)</h2>
                            <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: #848d9a;">Visualización de flujo: Pendiente -> Desarrollo -> Finalizado</p>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                            <thead>
                                <tr style="background: #1c222b; text-align: left;">
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: #848d9a; text-transform: uppercase; letter-spacing: 1px;">Ticket</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: #848d9a; text-transform: uppercase; letter-spacing: 1px;">Título</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: #848d9a; text-transform: uppercase; letter-spacing: 1px;">Estado Actual</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: #848d9a; text-transform: uppercase; letter-spacing: 1px;">Responsable Hoy</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: #848d9a; text-transform: uppercase; letter-spacing: 1px;">Finalizado Por</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.issues.filter(i => {
                                    const now = new Date();
                                    const todayStr = now.toISOString().split('T')[0];
                                    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
                                    const yesterdayStr = yesterday.toISOString().split('T')[0];
                                    
                                    const resDay = i.resolutiondate ? i.resolutiondate.split('T')[0] : null;
                                    const updDay = i.updated ? i.updated.split('T')[0] : null;
                                    
                                    return resDay === todayStr || resDay === yesterdayStr || (updDay === todayStr && i.statusCategory !== 'done') || (updDay === yesterdayStr && i.statusCategory !== 'done');
                                    }).sort((a, b) => a.status.localeCompare(b.status)).map(issue => {
                                        const ticketUrl = stats.jiraUrl ? stats.jiraUrl.replace(/\/$/, '') + '/browse/' + issue.key : '#';
                                        
                                        const renderUser = (name, avatar) => {
                                            if (!name) return '<span style="color: #3f444e;">-</span>';
                                            return `
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    ${avatar ? `<img src="${avatar}" style="width: 24px; height: 24px; border-radius: 6px; border: 1px solid #232933;">` : `<div style="width: 24px; height: 24px; border-radius: 6px; background: #1c222b; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; border: 1px solid #232933;">${name[0]}</div>`}
                                                    <span style="white-space: nowrap; font-weight: 500;">${name}</span>
                                                </div>
                                            `;
                                        };

                                        return `
                                            <tr style="border-bottom: 1px solid #1c222b; transition: background 0.2s;" onmouseover="this.style.background='#1c222b'" onmouseout="this.style.background='transparent'">
                                                <td style="padding: 20px 24px; font-weight: 900; color: #4285f4; font-size: 0.75rem;">
                                                    <a href="${ticketUrl}" target="_blank" style="color: #4285f4; text-decoration: none;">${issue.key}</a>
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: #e1e1e1; line-height: 1.4; max-width: 500px;">${UI.escapeHTML(issue.summary)}</td>
                                                <td style="padding: 20px 24px;">
                                                    <span style="background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color}; padding: 4px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">${this.getStatusTag(issue).text}</span>
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: #fff;">
                                                    ${renderUser(issue.assignee, issue.avatar)}
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: #36b37e;">
                                                    ${(issue.statusCategory === 'done' || issue.status === 'Finalizada' || issue.status === 'Finalizado' || issue.status === 'Done' || issue.status === 'Resolved') ? renderUser(issue.doneUser?.name, issue.doneUser?.avatar) : renderUser(null, null)}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
    },

    bindEvents(container) {
        container.querySelectorAll('.user-avatar-trigger').forEach(trigger => {
            trigger.onclick = () => {
                const userName = trigger.dataset.user;
                const userIssues = this.lastStats.issues.filter(i => i.assignee === userName && i.statusCategory !== 'done');
                this.showTicketsModal(`Tickets de ${userName}`, userIssues, 'Monitor de carga operativa sin finalizar');
            };
        });

        container.querySelectorAll('.kpi-card-trigger').forEach(card => {
            card.onclick = () => {
                const type = card.dataset.type;
                let filtered = [];
                let title = '';
                let subtitle = '';
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];

                if (type === 'OPEN') {
                    filtered = this.lastStats.issues.filter(i => i.statusCategory !== 'done');
                    title = 'Bugs Abiertos';
                    subtitle = 'Listado total de tickets pendientes de resolución';
                } else if (type === 'CLOSED_TODAY') {
                    filtered = this.lastStats.issues.filter(i => {
                        if (!i.resolutiondate) return false;
                        return new Date(i.resolutiondate).toISOString().split('T')[0] === todayStr;
                    });
                    title = 'Cerrados Hoy';
                    subtitle = 'Tickets que alcanzaron el estado FINALIZADO durante la jornada';
                } else if (type === 'CRITICAL_AGE') {
                    filtered = this.lastStats.issues.filter(i => {
                        const days = (now - new Date(i.created)) / (1000 * 60 * 60 * 24);
                        return days > 7 && i.statusCategory !== 'done';
                    });
                    title = 'Antigüedad Crítica';
                    subtitle = 'Tickets sin resolver con más de 7 días desde su creación';
                }

                if (filtered.length > 0) {
                    this.showTicketsModal(title, filtered, subtitle);
                } else if (type !== 'LEAD') {
                    UI.toast('No hay tickets para mostrar en este filtro', 'info');
                }
            };
        });
    },

    showTicketsModal(title, issues, subtitle = '') {
        const jiraBaseUrl = this.lastStats.jiraUrl ? this.lastStats.jiraUrl.replace(/\/$/, '') + '/browse/' : '';

        const modalHtml = `
            <div id="jira-tickets-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(12px); z-index: 9999; display: flex; align-items: center; justify-content: center; animation: modalFade 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
                <div style="background: #14181f; width: 1000px; max-height: 85vh; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 40px 100px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden;">
                    <div style="padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02);">
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="background: #2e3c54; width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">📊</div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.2rem; font-weight: 900; color: #fff;">${title}</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #848d9a; font-weight: 600;">${subtitle}</p>
                            </div>
                        </div>
                        <button id="close-modal" style="background: rgba(255,255,255,0.05); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">&times;</button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; padding: 32px;">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            <thead>
                                <tr style="text-align: left; color: #848d9a; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                                    <th style="padding: 0 16px;">Ticket</th>
                                    <th style="padding: 0 16px;">Estado</th>
                                    <th style="padding: 0 16px;">TÍTULO</th>
                                    <th style="padding: 0 16px;">Responsable</th>
                                    <th style="padding: 0 16px;">Aging</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${issues.map(issue => {
                                    const ticketUrl = jiraBaseUrl + issue.key;
                                    return `
                                        <tr style="background: rgba(255,255,255,0.02); border-radius: 12px; transition: background 0.2s;">
                                            <td style="padding: 20px 16px; font-weight: 900; color: #4285f4; font-size: 0.85rem; border-radius: 12px 0 0 12px;">
                                                <a href="${ticketUrl}" target="_blank" style="color: #4285f4; text-decoration: none; border-bottom: 1px solid transparent;" onmouseover="this.style.borderBottom='1px solid #4285f4'" onmouseout="this.style.borderBottom='1px solid transparent'">${issue.key}</a>
                                            </td>
                                            <td style="padding: 20px 16px;">
                                                <span style="background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color}; padding: 6px 10px; border-radius: 6px; font-size: 0.65rem; font-weight: 900;">${this.getStatusTag(issue).text}</span>
                                            </td>
                                            <td style="padding: 20px 16px; font-size: 0.8rem; font-weight: 600; color: #e1e1e1; max-width: 400px; line-height: 1.4;">${UI.escapeHTML(issue.summary)}</td>
                                            <td style="padding: 20px 16px;">
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    ${issue.avatar ? `<img src="${issue.avatar}" style="width: 20px; height: 20px; border-radius: 50%;">` : ''}
                                                    <span style="font-size: 0.7rem; color: #848d9a;">${issue.assignee}</span>
                                                </div>
                                            </td>
                                            <td style="padding: 20px 16px; font-size: 0.8rem; font-weight: 800; color: ${this.formatAge(issue.created).color}; border-radius: 0 12px 12px 0;">${this.formatAge(issue.created).text}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalFade { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
                #jira-tickets-modal tr:hover { background: rgba(255,255,255,0.05) !important; }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-modal').onclick = () => document.getElementById('jira-tickets-modal').remove();
        document.getElementById('jira-tickets-modal').onclick = (e) => {
            if (e.target.id === 'jira-tickets-modal') document.getElementById('jira-tickets-modal').remove();
        };
    },

    renderTopCard(label, value, icon, bgColor, type) {
        const isClickable = type !== 'LEAD';
        return `
            <div class="${isClickable ? 'kpi-card-trigger' : ''}" data-type="${type}" style="background: #14181f; border-radius: 16px; border: 1px solid #232933; padding: 16px 20px; display: flex; align-items: center; gap: 16px; ${isClickable ? 'cursor: pointer; transition: all 0.2s;' : ''}" ${isClickable ? 'onmouseover="this.style.borderColor=\'var(--brand)\'; this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'#232933\'; this.style.transform=\'translateY(0)\'"' : ''}>
                <div style="background: ${bgColor}; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">${icon}</div>
                <div>
                    <div style="font-size: 0.6rem; font-weight: 800; color: #848d9a; text-transform: uppercase; margin-bottom: 4px;">${label}</div>
                    <div style="font-size: 1.2rem; font-weight: 900; color: #ffffff;">${value}</div>
                </div>
            </div>
        `;
    },

    getStatusTag(issue) {
        const text = (issue.status || 'TODO');
        const s = text.toUpperCase();
        const colorName = issue.statusColor || 'blue-gray';
        const category = issue.statusCategory || 'new';
        
        let bg = 'rgba(132,141,154,0.1)';
        let color = '#848d9a';
        
        // Mapeo basado en colores y categorías de Jira
        if (colorName === 'green' || category === 'done') {
            bg = 'rgba(54,179,126,0.1)'; color = '#36b37e';
        } else if (colorName === 'yellow' || category === 'indeterminate') {
            bg = 'rgba(255,171,0,0.1)'; color = '#ffab00';
        }
        
        return { text, bg, color };
    },

    formatAge(date) {
        const diff = (new Date() - new Date(date)) / (1000 * 60 * 60);
        if (diff < 24) return { text: Math.floor(diff) + 'h', color: '#848d9a' };
        const days = Math.floor(diff / 24);
        if (days < 7) return { text: days + 'd', color: '#ffab00' };
        return { text: Math.floor(days / 7) + 'sem', color: '#ff4d4f' };
    }
};
