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
            <div style="padding: 24px; background: var(--apple-bg); min-height: 100%; color: var(--apple-label); font-family: var(--apple-font-family);">
                
                <!-- TOP KPIs -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px;">
                    ${this.renderTopCard('LEAD TIME', stats.avgResolutionDays + ' días', '🕒', 'var(--apple-blue-soft)', 'LEAD')}
                    ${this.renderTopCard('BUGS ABIERTOS', stats.openCount, '🐞', 'var(--apple-red-soft)', 'OPEN')}
                    ${this.renderTopCard('CERRADOS HOY', stats.closedToday, '✅', 'var(--apple-green-soft)', 'CLOSED_TODAY')}
                    ${this.renderTopCard('ANTIGÜEDAD CRÍTICA', stats.issues.filter(i => (new Date() - new Date(i.created)) / (1000*60*60*24) > 7 && i.statusCategory !== 'done').length, '⚠️', 'var(--apple-orange-soft)', 'CRITICAL_AGE')}
                </div>
                       <!-- TEAM WORKLOAD SECTION (Horizontal) -->
                <div style="margin-bottom: 32px; animation: fadeIn 0.8s ease-out;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-left: 4px;">
                        <span style="font-size: 1.2rem;">👥</span>
                        <h3 style="margin: 0; font-size: 0.9rem; font-weight: 800; color: var(--apple-label); text-transform: uppercase; letter-spacing: 1px;">Carga por Responsable</h3>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
                        ${Object.entries(stats.assigneeCounts).sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([name, count]) => {
                            const userIssue = stats.issues.find(i => i.assignee === name);
                            const pct = Math.min(100, (count / 12) * 100);
                            const color = count > 8 ? 'var(--apple-red)' : (count > 4 ? 'var(--apple-orange)' : 'var(--apple-blue)');
                            return `
                                <div class="user-avatar-trigger" data-user="${name}" style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); padding: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;" onmouseover="this.style.borderColor='${color}'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.borderColor='var(--apple-separator)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                        <div style="position: relative;">
                                            ${userIssue?.avatar ? `<img src="${userIssue.avatar}" style="width: 40px; height: 40px; border-radius: 12px; border: 2px solid var(--apple-bg-tertiary);">` : `<div style="width: 40px; height: 40px; border-radius: 12px; background: var(--apple-bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--apple-label);">${name[0]}</div>`}
                                            <div style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: var(--apple-green); border-radius: 50%; border: 2px solid var(--apple-bg-elevated);"></div>
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 0.8rem; font-weight: 800; color: var(--apple-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                                            <div style="font-size: 0.65rem; color: var(--apple-label-secondary);">${count} tickets activos</div>
                                        </div>
                                    </div>
                                    <div style="height: 4px; background: var(--apple-bg-tertiary); border-radius: 2px; overflow: hidden;">
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
                    <div style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-xl); border: 1px solid var(--apple-separator); overflow: hidden; box-shadow: var(--apple-shadow-lg); animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);">
                        <div style="padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--apple-separator);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="color: var(--apple-red);">🛡️</span>
                                <h3 style="margin: 0; font-size: 0.9rem; font-weight: 800;">Foco de la Daily</h3>
                            </div>
                            <span style="background: var(--apple-red-soft); color: var(--apple-red); padding: 4px 12px; border-radius: var(--apple-radius-sm); font-size: 0.7rem; font-weight: 900;">${urgentTickets.length} URGENTES</span>
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="text-align: left; background: var(--apple-fill-tertiary); border-bottom: 1px solid var(--apple-separator);">
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: var(--apple-label-secondary);">TICKET</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: var(--apple-label-secondary);">ESTADO</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: var(--apple-label-secondary);">TÍTULO</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: var(--apple-label-secondary);">RESPONSABLE</th>
                                    <th style="padding: 14px 24px; font-size: 0.65rem; color: var(--apple-label-secondary);">ANTIG.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${urgentTickets.map(issue => {
                                    const ticketUrl = stats.jiraUrl ? stats.jiraUrl.replace(/\/$/, '') + '/browse/' + issue.key : '#';
                                    return `
                                        <tr style="border-bottom: 1px solid var(--apple-separator);">
                                            <td style="padding: 16px 24px; font-weight: 900; color: var(--apple-blue); font-size: 0.75rem;">
                                                <a href="${ticketUrl}" target="_blank" style="color: var(--apple-blue); text-decoration: none; border-bottom: 1px solid transparent;" onmouseover="this.style.borderBottom='1px solid var(--apple-blue)'" onmouseout="this.style.borderBottom='1px solid transparent'">${issue.key}</a>
                                            </td>
                                            <td style="padding: 16px 24px;">
                                                <span style="background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color}; padding: 4px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">${this.getStatusTag(issue).text}</span>
                                            </td>
                                            <td style="padding: 16px 24px; font-size: 0.75rem; color: var(--apple-label); max-width: 400px; line-height: 1.4;">${UI.escapeHTML(issue.summary)}</td>
                                            <td style="padding: 16px 24px;">
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    ${issue.avatar ? `<img src="${issue.avatar}" style="width: 20px; height: 20px; border-radius: 50%;">` : ''}
                                                    <span style="font-size: 0.7rem; color: var(--apple-label-secondary);">${issue.assignee}</span>
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
                <div style="margin-top: 32px; background: var(--apple-bg-elevated); border-radius: var(--apple-radius-xl); border: 1px solid var(--apple-separator); overflow: hidden; animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: var(--apple-shadow-lg);">
                    <div style="padding: 24px; border-bottom: 1px solid var(--apple-separator); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h2 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--apple-label);">Resumen de Daily (Ciclo 48h)</h2>
                            <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--apple-label-secondary);">Visualización de flujo: Pendiente -> Desarrollo -> Finalizado</p>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                            <thead>
                                <tr style="background: var(--apple-fill-tertiary); text-align: left;">
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 1px;">Ticket</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 1px;">Título</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 1px;">Estado Actual</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 1px;">Responsable Hoy</th>
                                    <th style="padding: 16px 24px; font-size: 0.65rem; color: var(--apple-label-secondary); text-transform: uppercase; letter-spacing: 1px;">Finalizado Por</th>
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
                                            if (!name) return '<span style="color: var(--apple-label-quaternary);">-</span>';
                                            return `
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    ${avatar ? `<img src="${avatar}" style="width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--apple-separator);">` : `<div style="width: 24px; height: 24px; border-radius: 6px; background: var(--apple-bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 0.6rem; border: 1px solid var(--apple-separator);">${name[0]}</div>`}
                                                    <span style="white-space: nowrap; font-weight: 500;">${name}</span>
                                                </div>
                                            `;
                                        };

                                        return `
                                            <tr style="border-bottom: 1px solid var(--apple-separator); transition: background 0.2s;" onmouseover="this.style.background='var(--apple-fill-tertiary)'" onmouseout="this.style.background='transparent'">
                                                <td style="padding: 20px 24px; font-weight: 900; color: var(--apple-blue); font-size: 0.75rem;">
                                                    <a href="${ticketUrl}" target="_blank" style="color: var(--apple-blue); text-decoration: none;">${issue.key}</a>
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: var(--apple-label); line-height: 1.4; max-width: 500px;">${UI.escapeHTML(issue.summary)}</td>
                                                <td style="padding: 20px 24px;">
                                                    <span style="background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color}; padding: 4px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 900;">${this.getStatusTag(issue).text}</span>
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: var(--apple-label);">
                                                    ${renderUser(issue.assignee, issue.avatar)}
                                                </td>
                                                <td style="padding: 20px 24px; font-size: 0.75rem; color: var(--apple-green);">
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
        const epics = [...new Set(issues.map(i => i.epic || 'Sin Épica'))].sort();
        const self = this;

        const modalHtml = `
            <div id="jira-tickets-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(20px) saturate(180%); z-index: 9999; display: flex; align-items: center; justify-content: center; animation: modalFade 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
                <div style="background: var(--apple-bg-elevated); width: 1100px; max-height: 85vh; border-radius: var(--apple-radius-xl); border: 1px solid var(--apple-separator); box-shadow: var(--apple-shadow-xl); display: flex; flex-direction: column; overflow: hidden;">
                    <div style="padding: 20px 28px; border-bottom: 1px solid var(--apple-separator); display: flex; justify-content: space-between; align-items: center; background: var(--apple-fill-tertiary);">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="background: var(--apple-blue-soft); width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">📊</div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--apple-label);">${title}</h3>
                                <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: var(--apple-label-secondary);">${subtitle}</p>
                            </div>
                        </div>
                        <button id="close-modal" style="background: var(--apple-fill); border: none; color: var(--apple-label); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">&times;</button>
                    </div>
                    
                    <div style="padding: 16px 28px; border-bottom: 1px solid var(--apple-separator); display: flex; align-items: center; gap: 12px; background: var(--apple-bg-elevated);">
                        <label style="font-size: 0.72rem; font-weight: 600; color: var(--apple-label-secondary);">Filtrar por Épica:</label>
                        <select id="epic-filter" style="padding: 6px 12px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.78rem; min-width: 200px;">
                            <option value="">Todas las Épicas (${issues.length})</option>
                            ${epics.map(epic => {
                                const count = issues.filter(i => (i.epic || 'Sin Épica') === epic).length;
                                return `<option value="${UI.escapeHTML(epic)}">${UI.escapeHTML(epic)} (${count})</option>`;
                            }).join('')}
                        </select>
                        <div style="flex: 1;"></div>
                        <span id="epic-count" style="font-size: 0.72rem; color: var(--apple-label-tertiary);">${issues.length} tickets</span>
                        <button id="btn-export-epic" style="padding: 6px 14px; border-radius: var(--apple-radius-md); border: 1px solid var(--apple-separator); background: var(--apple-bg-tertiary); color: var(--apple-label); font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">📊 Exportar Reporte</button>
                    </div>
                    
                    <div style="flex: 1; overflow-y: auto; padding: 20px 28px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="text-align: left; border-bottom: 1px solid var(--apple-separator);">
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">Ticket</th>
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">Estado</th>
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">Título</th>
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">Épica</th>
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em;">Responsable</th>
                                    <th style="padding: 10px 12px; font-size: 0.68rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; text-align: right;">Aging</th>
                                </tr>
                            </thead>
                            <tbody id="tickets-tbody">
                                ${this.renderTicketRows(issues, jiraBaseUrl)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalFade { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
                #jira-tickets-modal tr.ticket-row:hover { background: var(--apple-fill) !important; }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-modal').onclick = () => document.getElementById('jira-tickets-modal').remove();
        document.getElementById('jira-tickets-modal').onclick = (e) => {
            if (e.target.id === 'jira-tickets-modal') document.getElementById('jira-tickets-modal').remove();
        };
        
        document.getElementById('epic-filter').addEventListener('change', function() {
            const selectedEpic = this.value;
            const filtered = selectedEpic 
                ? issues.filter(i => (i.epic || 'Sin Épica') === selectedEpic)
                : issues;
            document.getElementById('tickets-tbody').innerHTML = self.renderTicketRows(filtered, jiraBaseUrl);
            document.getElementById('epic-count').textContent = filtered.length + ' tickets';
        });
        
        document.getElementById('btn-export-epic').addEventListener('click', function() {
            const selectedEpic = document.getElementById('epic-filter').value;
            const filtered = selectedEpic 
                ? issues.filter(i => (i.epic || 'Sin Épica') === selectedEpic)
                : issues;
            self.exportEpicReport(filtered, selectedEpic || 'Todas las Épicas', title);
        });
    },
    
    renderTicketRows(issues, jiraBaseUrl) {
        return issues.map(issue => {
            const ticketUrl = jiraBaseUrl + issue.key;
            const age = this.formatAge(issue.created);
            return `
                <tr class="ticket-row" style="border-bottom: 1px solid var(--apple-separator); transition: background 0.15s;">
                    <td style="padding: 12px; font-weight: 700; color: var(--apple-blue); font-size: 0.82rem;">
                        <a href="${ticketUrl}" target="_blank" style="color: var(--apple-blue); text-decoration: none;">${issue.key}</a>
                    </td>
                    <td style="padding: 12px;">
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; background: ${this.getStatusTag(issue).bg}; color: ${this.getStatusTag(issue).color};">${this.getStatusTag(issue).text}</span>
                    </td>
                    <td style="padding: 12px; font-size: 0.82rem; font-weight: 500; color: var(--apple-label); max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(issue.summary)}</td>
                    <td style="padding: 12px;">
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; background: var(--apple-indigo-soft); color: var(--apple-indigo); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(issue.epic || 'Sin Épica')}</span>
                    </td>
                    <td style="padding: 12px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${issue.avatar ? `<img src="${issue.avatar}" style="width: 18px; height: 18px; border-radius: 50%;">` : ''}
                            <span style="font-size: 0.72rem; color: var(--apple-label-secondary);">${issue.assignee}</span>
                        </div>
                    </td>
                    <td style="padding: 12px; font-size: 0.78rem; font-weight: 700; color: ${age.color}; text-align: right;">${age.text}</td>
                </tr>
            `;
        }).join('');
    },
    
    exportEpicReport(issues, epicName, modalTitle) {
        const jiraBaseUrl = this.lastStats.jiraUrl ? this.lastStats.jiraUrl.replace(/\/$/, '') + '/browse/' : '';
        const now = new Date();
        const reportDate = now.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
        
        const statusCounts = {};
        issues.forEach(i => {
            const status = i.status || 'Desconocido';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        const priorityCounts = {};
        issues.forEach(i => {
            const priority = i.priority || 'Media';
            priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        });

        const reportHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte ${epicName} - ${reportDate}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; background: #f2f2f7; color: #1d1d1f; padding: 20px 24px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; border-radius: 12px; padding: 28px; margin-bottom: 24px; border: 1px solid rgba(0,0,0,0.08); }
        .header h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; }
        .header p { color: #6e6e73; font-size: 0.85rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        .stat-card { background: white; border-radius: 12px; padding: 20px; border: 1px solid rgba(0,0,0,0.08); }
        .stat-label { font-size: 0.68rem; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .stat-value { font-size: 1.8rem; font-weight: 700; }
        .table-container { background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08); overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f7; padding: 10px 12px; text-align: left; font-size: 0.68rem; font-weight: 700; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid rgba(0,0,0,0.08); }
        td { padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        tr:last-child td { border-bottom: none; }
        .status-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.08); display: flex; justify-content: space-between; font-size: 0.7rem; color: #6e6e73; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Reporte de Bugs por Épica</h1>
            <p>Épica: <strong>${epicName}</strong> | ${reportDate} | ${issues.length} tickets</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Bugs</div>
                <div class="stat-value">${issues.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Abiertos</div>
                <div class="stat-value" style="color: #FF3B30;">${issues.filter(i => i.statusCategory !== 'done').length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Cerrados</div>
                <div class="stat-value" style="color: #34C759;">${issues.filter(i => i.statusCategory === 'done').length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Críticos (>7 días)</div>
                <div class="stat-value" style="color: #FF9500;">${issues.filter(i => (now - new Date(i.created)) / (1000*60*60*24) > 7 && i.statusCategory !== 'done').length}</div>
            </div>
        </div>
        
        <div class="table-container">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th>Ticket</th>
                        <th>Estado</th>
                        <th>Título</th>
                        <th>Responsable</th>
                        <th>Prioridad</th>
                        <th>Creación</th>
                        <th style="text-align: right;">Aging</th>
                    </tr>
                </thead>
                <tbody>
                    ${issues.map(i => {
                        const age = this.formatAge(i.created);
                        const ageDays = Math.floor((now - new Date(i.created)) / (1000*60*60*24));
                        return `
                        <tr>
                            <td style="padding: 8px 10px;"><a href="${jiraBaseUrl}${i.key}" target="_blank" style="color: #007AFF; text-decoration: none; font-weight: 600; font-size: 0.82rem;">${i.key}</a></td>
                            <td style="padding: 8px 10px;"><span class="status-badge" style="background: ${this.getStatusTag(i).bg}; color: ${this.getStatusTag(i).color}; white-space: nowrap;">${this.getStatusTag(i).text}</span></td>
                            <td style="padding: 8px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; max-width: 400px;" title="${UI.escapeHTML(i.summary)}">${UI.escapeHTML(i.summary)}</td>
                            <td style="padding: 8px 10px; font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${i.assignee}</td>
                            <td style="padding: 8px 10px;"><span style="font-weight: 600; color: ${i.priority === 'Crítica' || i.priority === 'Highest' ? '#FF3B30' : i.priority === 'Alta' || i.priority === 'High' ? '#FF9500' : '#1d1d1f'}; white-space: nowrap; font-size: 0.82rem;">${i.priority}</span></td>
                            <td style="padding: 8px 10px; font-size: 0.82rem; white-space: nowrap;">${new Date(i.created).toLocaleDateString('es-AR')}</td>
                            <td style="padding: 8px 10px; font-weight: 700; color: ${age.color}; text-align: right; white-space: nowrap;">${ageDays}d</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <span>Generado por Manual QA Tool — JIRA Edition</span>
            <span>${now.toLocaleString('es-AR')} · Documento Confidencial</span>
        </div>
    </div>
</body>
</html>`;

        const win = window.open('', '_blank');
        win.document.write(reportHtml);
        win.document.close();
    },

    renderTopCard(label, value, icon, bgColor, type) {
        const isClickable = type !== 'LEAD';
        return `
            <div class="${isClickable ? 'kpi-card-trigger' : ''}" data-type="${type}" style="background: var(--apple-bg-elevated); border-radius: var(--apple-radius-lg); border: 1px solid var(--apple-separator); padding: 16px 20px; display: flex; align-items: center; gap: 16px; ${isClickable ? 'cursor: pointer; transition: all 0.2s;' : ''}" ${isClickable ? 'onmouseover="this.style.borderColor=\'var(--apple-blue)\'; this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'var(--apple-separator)\'; this.style.transform=\'translateY(0)\'"' : ''}>
                <div style="background: ${bgColor}; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">${icon}</div>
                <div>
                    <div style="font-size: 0.6rem; font-weight: 800; color: var(--apple-label-secondary); text-transform: uppercase; margin-bottom: 4px;">${label}</div>
                    <div style="font-size: 1.2rem; font-weight: 900; color: var(--apple-label);">${value}</div>
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
