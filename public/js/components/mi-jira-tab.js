import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const MiJiraTab = {
    activeSubTab: 'assigned',
    tickets: [],
    loading: false,

    async render(container) {
        container.innerHTML = `
            <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
                <!-- Header -->
                <div style="margin-bottom: 20px;">
                    <h1 style="font-size: 1.3rem; font-weight: 700; color: #e6edf3; margin: 0 0 4px;">Mi JIRA</h1>
                    <p style="font-size: 0.8rem; color: #8b949e; margin: 0;">Tickets donde participás</p>
                </div>

                <!-- Sub-Tab Bar -->
                <div class="sub-tab-bar" style="display: flex; gap: 4px; margin-bottom: 20px; background: #161b22; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 6px; width: fit-content;">
                    <button class="sub-tab-btn ${this.activeSubTab === 'assigned' ? 'active' : ''}" data-filter="assigned" style="padding: 8px 20px; border-radius: 8px; border: none; background: ${this.activeSubTab === 'assigned' ? '#a371f7' : 'transparent'}; color: ${this.activeSubTab === 'assigned' ? '#fff' : '#8b949e'}; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">📥 Asignados</button>
                    <button class="sub-tab-btn ${this.activeSubTab === 'created' ? 'active' : ''}" data-filter="created" style="padding: 8px 20px; border-radius: 8px; border: none; background: ${this.activeSubTab === 'created' ? '#a371f7' : 'transparent'}; color: ${this.activeSubTab === 'created' ? '#fff' : '#8b949e'}; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">✏️ Creados</button>
                    <button class="sub-tab-btn ${this.activeSubTab === 'mentions' ? 'active' : ''}" data-filter="mentions" style="padding: 8px 20px; border-radius: 8px; border: none; background: ${this.activeSubTab === 'mentions' ? '#a371f7' : 'transparent'}; color: ${this.activeSubTab === 'mentions' ? '#fff' : '#8b949e'}; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">🔖 Menciones</button>
                </div>

                <!-- Panel Container -->
                <div id="mi-jira-panel" style="background: #161b22; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;">
                    <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span id="mi-jira-title" style="font-size: 0.9rem; font-weight: 600; color: #e6edf3;">Cargando...</span>
                            <span id="mi-jira-count" style="margin-left: 12px; font-size: 0.75rem; color: #8b949e;"></span>
                        </div>
                        <button id="mi-jira-refresh" style="padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #8b949e; font-size: 0.75rem; cursor: pointer;">🔄 Actualizar</button>
                    </div>
                    <div id="mi-jira-grid" style="padding: 0;">
                        <!-- Grid renders here -->
                    </div>
                </div>

                <!-- Detail Panel -->
                <div id="mi-jira-detail" style="display: none; margin-top: 20px;">
                    <!-- Detail panel for ticket -->
                </div>
            </div>
        `;

        this.bindEvents(container);
        await this.loadTickets();
    },

    bindEvents(container) {
        container.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const filter = e.target.dataset.filter;
                if (filter !== this.activeSubTab) {
                    this.activeSubTab = filter;
                    await this.loadTickets();
                }
            });
        });

        container.querySelector('#mi-jira-refresh')?.addEventListener('click', async () => {
            await this.loadTickets();
        });
    },

    async loadTickets() {
        const container = document.getElementById('mi-jira-panel');
        if (!container) return;

        const projectId = Store.state.activeProjectId;
        if (!projectId) {
            this.renderEmpty('Seleccioná un proyecto para ver tus tickets.');
            return;
        }

        const grid = document.getElementById('mi-jira-grid');
        const title = document.getElementById('mi-jira-title');
        const count = document.getElementById('mi-jira-count');

        this.loading = true;
        UI.showLoading();

        const titles = { assigned: 'Tickets Asignados a Mí', created: 'Tickets Creados por Mí', mentions: 'Tickets donde me mencionaron' };
        title.textContent = titles[this.activeSubTab] || 'Mi JIRA';
        count.textContent = '';
        grid.innerHTML = this.renderLoading();

        try {
            const res = await ApiService.getMyJiraTickets(projectId, this.activeSubTab, 50);
            this.tickets = res.tickets || [];

            count.textContent = `${this.tickets.length} tickets`;

            if (this.tickets.length === 0) {
                const emptyMessages = {
                    assigned: 'No tenés tickets asignados en este proyecto.',
                    created: 'No creaste tickets en este proyecto.',
                    mentions: 'No te mencionaron en comentarios de este proyecto.'
                };
                this.renderEmpty(emptyMessages[this.activeSubTab] || 'Sin resultados.');
            } else {
                this.renderGrid(this.tickets);
            }
        } catch (err) {
            this.renderEmpty('Error al cargar: ' + err.message);
        }

        UI.hideLoading();
        this.loading = false;
    },

    renderLoading() {
        return `
            <div style="display: grid; gap: 0;">
                ${Array(5).fill(0).map(() => `
                    <div style="display: grid; grid-template-columns: 110px 80px 1fr 100px 140px 90px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="height: 14px; width: 80px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                        <div style="height: 14px; width: 60px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                        <div style="height: 14px; width: 200px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                        <div style="height: 14px; width: 70px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                        <div style="height: 14px; width: 100px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                        <div style="height: 14px; width: 60px; background: rgba(255,255,255,0.05); border-radius: 4px; animation: shimmer 1.5s infinite; background-size: 200% 100%;"></div>
                    </div>
                `).join('')}
            </div>
            <style>
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            </style>
        `;
    },

    renderEmpty(message) {
        const grid = document.getElementById('mi-jira-grid');
        if (!grid) return;
        grid.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; text-align: center;">
                <div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;">📋</div>
                <p style="font-size: 0.85rem; color: #8b949e; max-width: 300px;">${message}</p>
            </div>
        `;
    },

    renderGrid(tickets) {
        const grid = document.getElementById('mi-jira-grid');
        if (!grid) return;

        const titles = { assigned: 'Asignados', created: 'Creados', mentions: 'Menciones' };

        grid.innerHTML = `
            <!-- Header -->
            <div style="display: grid; grid-template-columns: 110px 80px 1fr 100px 140px 90px; padding: 10px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.01);">
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">CLAVE</div>
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">TIPO</div>
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">RESUMEN</div>
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">ESTADO</div>
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">RESPONSABLE</div>
                <div style="font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;">ACTUALIZADO</div>
            </div>

            <!-- Rows -->
            ${tickets.map(ticket => {
                const typeColors = { 'Bug': '#ff7b72', 'Task': '#58a6ff', 'Story': '#3fb950', 'Epic': '#a371f7', 'Subtask': '#79c0ff', 'Sub-task': '#79c0ff' };
                const typeColor = typeColors[ticket.issueType] || '#8b949e';

                const statusColors = {
                    'done': '#3fb950',
                    'new': '#8b949e',
                    'indeterminate': '#f59e0b',
                    'To Do': '#8b949e',
                    'In Progress': '#f59e0b',
                    'In Review': '#3b82f6',
                    'Done': '#3fb950'
                };
                const statusColor = statusColors[ticket.statusCategory] || statusColors[ticket.status] || '#8b949e';

                return `
                <div class="ticket-row" data-key="${ticket.key}" style="display: grid; grid-template-columns: 110px 80px 1fr 100px 140px 90px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${ticket.issueType === 'Epic' ? '<span style="font-size: 10px; color: #a371f7;">📋</span>' : ''}
                        <span style="font-weight: 600; color: #e6edf3; font-size: 12px;">${ticket.key}</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 11px; font-weight: 600; color: ${typeColor};">${ticket.issueType || '—'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        ${ticket.parent ? `<span style="font-size: 10px; color: #484f58; flex-shrink: 0;">└</span>` : ''}
                        <span style="font-size: 13px; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ticket.summary || '—'}</span>
                        ${this.activeSubTab === 'mentions' && ticket.mentions && ticket.mentions.length > 0 ? `
                            <span style="flex-shrink: 0; background: rgba(163,113,247,0.15); border: 1px solid rgba(163,113,247,0.3); color: #a371f7; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 600;">${ticket.mentions.length} 🔖</span>
                        ` : ''}
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${statusColor}; letter-spacing: 0.03em;">${ticket.status || '—'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        ${ticket.assigneeAvatar ? `<img src="${ticket.assigneeAvatar}" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">` : `<div style="width: 24px; height: 24px; border-radius: 50%; background: #1f2335; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 10px; color: #8b949e; flex-shrink: 0;">${(ticket.assignee || '?')[0]}</div>`}
                        <span style="font-size: 12px; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ticket.assignee || 'Sin asignar'}</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 12px; color: #8b949e;">${this.formatDate(ticket.updated)}</span>
                    </div>
                </div>
                `;
            }).join('')}
        `;

        // Bind click events for rows
        grid.querySelectorAll('.ticket-row').forEach(row => {
            row.addEventListener('click', () => {
                const key = row.dataset.key;
                const ticket = this.tickets.find(t => t.key === key);
                if (ticket) this.showDetail(ticket);
            });
        });
    },

    showDetail(ticket) {
        const detail = document.getElementById('mi-jira-detail');
        if (!detail) return;

        const statusColors = { 'done': '#3fb950', 'new': '#8b949e', 'indeterminate': '#f59e0b' };
        const statusColor = statusColors[ticket.statusCategory] || '#8b949e';

        detail.style.display = 'block';
        detail.innerHTML = `
            <div style="background: #161b22; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;">
                <!-- Header -->
                <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); display: flex; align-items: flex-start; justify-content: space-between;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <span style="font-size: 0.8rem; font-weight: 600; color: #e6edf3;">${ticket.key}</span>
                            <span style="font-size: 11px; font-weight: 600; color: ${statusColor}; background: rgba(255,255,255,0.05); border: 1px solid ${statusColor}40; border-radius: 4px; padding: 2px 8px;">${ticket.status}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: #e6edf3; margin: 0;">${ticket.summary}</p>
                    </div>
                    <button onclick="document.getElementById('mi-jira-detail').style.display='none'" style="padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #8b949e; cursor: pointer; font-size: 0.8rem;">✕ Cerrar</button>
                </div>

                <!-- Meta info -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;">
                    <div style="padding: 14px 20px; border-right: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 10px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Tipo</div>
                        <div style="font-size: 0.85rem; color: #e6edf3;">${ticket.issueType || '—'}</div>
                    </div>
                    <div style="padding: 14px 20px; border-right: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 10px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Reporter</div>
                        <div style="font-size: 0.85rem; color: #e6edf3;">${ticket.reporter || '—'}</div>
                    </div>
                    <div style="padding: 14px 20px;">
                        <div style="font-size: 10px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Creado</div>
                        <div style="font-size: 0.85rem; color: #e6edf3;">${this.formatDate(ticket.created)}</div>
                    </div>
                </div>

                ${ticket.parent ? `
                <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Epic</div>
                    <div style="font-size: 0.85rem; color: #a371f7;">${ticket.parent}</div>
                </div>
                ` : ''}

                ${ticket.mentions && ticket.mentions.length > 0 ? `
                <div style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 11px; font-weight: 700; color: #a371f7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">🔖 Donde me mencionaron</div>
                    ${ticket.mentions.map(m => `
                        <div style="background: rgba(163,113,247,0.08); border: 1px solid rgba(163,113,247,0.2); border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-size: 0.8rem; font-weight: 600; color: #a371f7;">${m.author}</span>
                                <span style="font-size: 0.75rem; color: #8b949e;">${this.formatDate(m.created)}</span>
                            </div>
                            <p style="font-size: 0.8rem; color: #e6edf3; margin: 0;">"${m.preview}${m.preview.length >= 150 ? '...' : ''}"</p>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                <!-- Actions -->
                <div style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 8px;">
                    <a href="https://livewareissa.atlassian.net/browse/${ticket.key}" target="_blank" style="padding: 8px 16px; border-radius: 8px; background: #a371f7; color: #fff; font-size: 0.8rem; font-weight: 600; text-decoration: none;">🔗 Abrir en Jira</a>
                    <button onclick="navigator.clipboard.writeText('${ticket.key}')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #8b949e; font-size: 0.8rem; cursor: pointer;">📋 Copiar Key</button>
                </div>
            </div>
        `;

        // Scroll to detail
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    formatDate(dateStr) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
};