import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const MiJiraTab = {
    activeSubTab: 'assigned',
    tickets: [],
    loading: false,

    async render(container) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <!-- Header -->
                <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h1 style="font-size: 0.95rem; font-weight: 700; color: #e6edf3; margin: 0;">Mi JIRA</h1>
                    </div>
                    <button id="mi-jira-refresh" style="padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: #8b949e; font-size: 0.72rem; cursor: pointer;">🔄</button>
                </div>

                <!-- Sub-Tab Bar -->
                <div style="display: flex; gap: 0; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <button class="sub-tab-btn ${this.activeSubTab === 'assigned' ? 'active' : ''}" data-filter="assigned" style="padding: 6px 14px; border-radius: 6px; border: none; background: ${this.activeSubTab === 'assigned' ? '#3b82f6' : 'transparent'}; color: ${this.activeSubTab === 'assigned' ? '#fff' : '#8b949e'}; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">📥 Asignados</button>
                    <button class="sub-tab-btn ${this.activeSubTab === 'created' ? 'active' : ''}" data-filter="created" style="padding: 6px 14px; border-radius: 6px; border: none; background: ${this.activeSubTab === 'created' ? '#3b82f6' : 'transparent'}; color: ${this.activeSubTab === 'created' ? '#fff' : '#8b949e'}; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">✏️ Creados</button>
                    <button class="sub-tab-btn ${this.activeSubTab === 'mentions' ? 'active' : ''}" data-filter="mentions" style="padding: 6px 14px; border-radius: 6px; border: none; background: ${this.activeSubTab === 'mentions' ? '#3b82f6' : 'transparent'}; color: ${this.activeSubTab === 'mentions' ? '#fff' : '#8b949e'}; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s;">🔖 Menciones</button>
                </div>

                <!-- Panel Container -->
                <div id="mi-jira-panel" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span id="mi-jira-title" style="font-size: 0.8rem; font-weight: 600; color: #d1d5db;">Cargando...</span>
                            <span id="mi-jira-count" style="font-size: 0.7rem; color: #6b7280;"></span>
                        </div>
                    </div>
                    <div id="mi-jira-grid" style="flex: 1; overflow-y: auto;">
                        <!-- Grid renders here -->
                    </div>
                </div>

                <!-- Detail Panel -->
                <div id="mi-jira-detail" style="display: none; border-top: 1px solid rgba(255,255,255,0.08);">
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

        const titles = { assigned: 'Asignados a Mí', created: 'Creados por Mí', mentions: 'Donde me mencionaron' };
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
            <div style="display: flex; flex-direction: column;">
                ${Array(5).fill(0).map(() => `
                    <div style="display: grid; grid-template-columns: 100px 70px 1fr 90px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <div style="height: 12px; width: 70px; background: rgba(255,255,255,0.04); border-radius: 3px;"></div>
                        <div style="height: 12px; width: 50px; background: rgba(255,255,255,0.04); border-radius: 3px;"></div>
                        <div style="height: 12px; width: 160px; background: rgba(255,255,255,0.04); border-radius: 3px;"></div>
                        <div style="height: 12px; width: 60px; background: rgba(255,255,255,0.04); border-radius: 3px;"></div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderEmpty(message) {
        const grid = document.getElementById('mi-jira-grid');
        if (!grid) return;
        grid.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 8px; opacity: 0.4;">📋</div>
                <p style="font-size: 0.8rem; color: #6b7280; max-width: 260px;">${message}</p>
            </div>
        `;
    },

    renderGrid(tickets) {
        const grid = document.getElementById('mi-jira-grid');
        if (!grid) return;

        grid.innerHTML = `
            <!-- Header -->
            <div style="display: grid; grid-template-columns: 100px 70px 1fr 90px; padding: 6px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.01); position: sticky; top: 0; z-index: 1;">
                <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">CLAVE</div>
                <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">TIPO</div>
                <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">RESUMEN</div>
                <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">ESTADO</div>
            </div>

            <!-- Rows -->
            ${tickets.map(ticket => {
                const typeColors = { 'Bug': '#ff7b72', 'Task': '#58a6ff', 'Story': '#3fb950', 'Epic': '#3b82f6', 'Subtask': '#79c0ff', 'Sub-task': '#79c0ff' };
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
                <div class="ticket-row" data-key="${ticket.key}" style="display: grid; grid-template-columns: 100px 70px 1fr 90px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 5px;">
                        ${ticket.issueType === 'Epic' ? '<span style="font-size: 9px; color: #3b82f6;">📋</span>' : ''}
                        <span style="font-weight: 600; color: #d1d5db; font-size: 11px;">${ticket.key}</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 10px; font-weight: 600; color: ${typeColor};">${ticket.issueType || '—'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                        ${ticket.parent ? `<span style="font-size: 9px; color: #484f58; flex-shrink: 0;">└</span>` : ''}
                        <span style="font-size: 12px; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ticket.summary || '—'}</span>
                        ${this.activeSubTab === 'mentions' && ticket.mentions && ticket.mentions.length > 0 ? `
                            <span style="flex-shrink: 0; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #3b82f6; border-radius: 3px; padding: 1px 5px; font-size: 9px; font-weight: 600;">${ticket.mentions.length} 🔖</span>
                        ` : ''}
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${statusColor}; letter-spacing: 0.03em;">${ticket.status || '—'}</span>
                    </div>
                </div>
                `;
            }).join('')}
        `;

        grid.querySelectorAll('.ticket-row').forEach(row => {
            row.addEventListener('click', () => {
                const key = row.dataset.key;
                const ticket = this.tickets.find(t => t.key === key);
                if (ticket) this.showDetail(ticket);
            });
            row.addEventListener('mouseover', () => row.style.background = 'rgba(255,255,255,0.04)');
            row.addEventListener('mouseout', () => row.style.background = 'transparent');
        });
    },

    showDetail(ticket) {
        const detail = document.getElementById('mi-jira-detail');
        if (!detail) return;

        const statusColors = { 'done': '#3fb950', 'new': '#8b949e', 'indeterminate': '#f59e0b' };
        const statusColor = statusColors[ticket.statusCategory] || '#8b949e';

        const sortedComments = (ticket.comments || []).sort((a, b) => new Date(b.created) - new Date(a.created));
        const mentionCount = ticket.mentions?.length || 0;

        detail.style.display = 'block';
        detail.innerHTML = `
            <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: flex-start; justify-content: space-between;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: #3b82f6;">${ticket.key}</span>
                        <span style="font-size: 10px; font-weight: 600; color: ${statusColor}; background: rgba(255,255,255,0.04); border: 1px solid ${statusColor}30; border-radius: 3px; padding: 1px 6px;">${ticket.status}</span>
                        <span style="font-size: 10px; color: #6b7280;">${ticket.issueType || ''}</span>
                    </div>
                    <p style="font-size: 0.82rem; color: #e6edf3; margin: 0; line-height: 1.3;">${ticket.summary}</p>
                </div>
                <button onclick="document.getElementById('mi-jira-detail').style.display='none'" style="padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: #6b7280; cursor: pointer; font-size: 0.75rem; margin-left: 8px;">✕</button>
            </div>

            <!-- Meta row -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <div>
                    <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Reporter</div>
                    <div style="font-size: 0.75rem; color: #d1d5db;">${ticket.reporter || '—'}</div>
                </div>
                <div>
                    <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Asignado</div>
                    <div style="font-size: 0.75rem; color: #d1d5db;">${ticket.assignee || '—'}</div>
                </div>
                <div>
                    <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Creado</div>
                    <div style="font-size: 0.75rem; color: #d1d5db;">${this.formatDate(ticket.created)}</div>
                </div>
                <div>
                    <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Actualizado</div>
                    <div style="font-size: 0.75rem; color: #d1d5db;">${this.formatDate(ticket.updated)}</div>
                </div>
            </div>

            ${ticket.parent ? `
            <div style="padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <span style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Epic: </span>
                <span style="font-size: 0.75rem; color: #3b82f6;">${ticket.parent}</span>
            </div>
            ` : ''}

            <!-- Comment Chain -->
            ${sortedComments.length > 0 ? `
            <div style="padding: 10px 0;">
                <div style="padding: 0 16px 8px; display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">💬 Comentarios</span>
                    <span style="font-size: 10px; color: #6b7280;">(${sortedComments.length})</span>
                    ${mentionCount > 0 ? `<span style="font-size: 10px; color: #3b82f6;">· ${mentionCount} menciones</span>` : ''}
                </div>
                <div style="max-height: 320px; overflow-y: auto;">
                    ${sortedComments.map(c => `
                        <div style="padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); ${c.isMention ? 'background: rgba(59,130,246,0.06); border-left: 3px solid #3b82f6;' : ''}">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 0.75rem; font-weight: 600; color: ${c.isMention ? '#3b82f6' : '#d1d5db'};">${c.author}</span>
                                    ${c.isMention ? '<span style="font-size: 9px; color: #3b82f6; background: rgba(59,130,246,0.1); padding: 1px 5px; border-radius: 3px;">🔖</span>' : ''}
                                </div>
                                <span style="font-size: 0.7rem; color: #6b7280;">${this.formatDate(c.created)}</span>
                            </div>
                            <p style="font-size: 0.78rem; color: #c9d1d9; margin: 0; line-height: 1.4; white-space: pre-wrap;">${UI.escapeHTML(c.body || '')}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Actions -->
            <div style="padding: 10px 16px; display: flex; gap: 8px;">
                <a href="https://livewareissa.atlassian.net/browse/${ticket.key}" target="_blank" style="padding: 6px 12px; border-radius: 6px; background: #3b82f6; color: #fff; font-size: 0.75rem; font-weight: 600; text-decoration: none;">🔗 Jira</a>
                <button onclick="navigator.clipboard.writeText('${ticket.key}')" style="padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: #8b949e; font-size: 0.75rem; cursor: pointer;">📋 Copiar</button>
            </div>
        `;

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