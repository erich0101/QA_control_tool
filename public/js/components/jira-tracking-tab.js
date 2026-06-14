import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';

export const JiraTrackingTab = {
    data: [],
    expandedEpics: new Set(),

    async render(container) {
        const scrollPos = container.scrollTop;
        const { activeProjectId } = Store.state;
        if (!activeProjectId) {
            container.innerHTML = '<div class="empty-state"><h3>Seguimiento Jira</h3><p>Selecciona un proyecto para ver el seguimiento.</p></div>';
            return;
        }

        UI.showLoading();
        try {
            const res = await ApiService.getJiraTracking(activeProjectId);
            this.data = res.tracking || [];
            
            // Inicialmente expandir todas las épicas
            const epics = [...new Set(this.data.map(item => item.jira_epic_key))];
            epics.forEach(e => this.expandedEpics.add(e));

        } catch (err) {
            UI.toast(err.message, 'error');
        }
        UI.hideLoading();

        container.innerHTML = `
            <div class="tab-toolbar" style="padding: 20px;">
                <div class="tab-toolbar-left">
                    <span class="tab-toolbar-title">Centro de Seguimiento Jira</span>
                    <span class="tab-toolbar-count">${this.data.length} tickets sincronizados</span>
                </div>
                <div class="tab-toolbar-right">
                    <button class="btn btn-ghost btn-sm" id="btn-refresh-tracking">🔄 Sincronizar con Jira</button>
                </div>
            </div>

            <div class="tt-container" style="padding: 0 20px 20px 20px;">
                ${this.renderTreeTable()}
            </div>
        `;

        this.bindEvents(container);
        container.scrollTop = scrollPos;
    },

    renderTreeTable() {
        if (this.data.length === 0) {
            return `
                <div style="text-align: center; padding: 60px; background: var(--bg-surface); border-radius: 16px; border: 1px dashed var(--border);">
                    <div style="font-size: 2rem; margin-bottom: 16px;">🎯</div>
                    <h3 style="margin-bottom: 8px;">Sin tickets vinculados</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Los bugs que exportes a Jira aparecerán aquí para seguimiento.</p>
                </div>
            `;
        }

        // Agrupar por Épica
        const groups = {};
        this.data.forEach(item => {
            const epicKey = item.jira_epic_key || 'OTRAS';
            if (!groups[epicKey]) {
                groups[epicKey] = {
                    key: epicKey,
                    name: item.jira_epic_name || 'Sin Épica / Otros',
                    tickets: []
                };
            }
            groups[epicKey].tickets.push(item);
        });

        return `
            <table class="tt-table">
                <thead>
                    <tr>
                        <th style="min-width: 200px;">ÉPICA / TICKET</th>
                        <th style="width: 150px; white-space: nowrap;">ASIGNADO</th>
                        <th style="width: 110px; white-space: nowrap;">FECHA CREACIÓN</th>
                        <th style="text-align: center; width: 120px; white-space: nowrap;">ESTADO JIRA</th>
                        <th style="text-align: right; width: 100px; white-space: nowrap;">ACCIONES</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.values(groups).map(group => this.renderEpicGroup(group)).join('')}
                </tbody>
            </table>
        `;
    },

    renderEpicGroup(group) {
        const isExpanded = this.expandedEpics.has(group.key);
        const rows = [];
        
        // Fila de la Épica
        rows.push(`
            <tr class="epic-row" data-epic="${group.key}" style="background: rgba(0, 82, 204, 0.03); cursor: pointer;">
                <td colspan="5" style="padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 0.7rem; transition: transform 0.2s; transform: ${isExpanded ? 'rotate(90deg)' : 'rotate(0)'}">▶</span>
                        <div style="background: #8777D9; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">EPIC</div>
                        <span style="font-weight: 700; color: var(--text-main);">${UI.escapeHTML(group.key)} — ${UI.escapeHTML(group.name)}</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;">(${group.tickets.length} tickets)</span>
                    </div>
                </td>
            </tr>
        `);

        // Filas de los Tickets (si está expandido)
        if (isExpanded) {
            group.tickets.forEach(ticket => {
                rows.push(`
                    <tr class="ticket-row" style="border-left: 4px solid var(--brand);">
                        <td style="padding-left: 40px;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: var(--brand); font-weight: 800; font-size: 0.8rem;">${ticket.jira_key}</span>
                                    <span style="font-weight: 600; font-size: 0.85rem;">${UI.escapeHTML(ticket.title)}</span>
                                </div>
                            </div>
                        </td>
                        <td style="max-width: 180px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${ticket.jira_avatar ? 
                                    `<img src="${ticket.jira_avatar}" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border);">` : 
                                    `<div style="width: 24px; height: 24px; border-radius: 50%; background: var(--brand); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 800;">${ticket.jira_assignee.charAt(0).toUpperCase()}</div>`
                                }
                                <span style="font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHTML(ticket.jira_assignee)}</span>
                            </div>
                        </td>
                        <td style="font-size: 0.75rem; color: var(--text-secondary);">
                            ${new Date(ticket.created_at).toLocaleDateString()}
                        </td>
                        <td style="text-align: center;">
                            ${this.renderStatusPill(ticket.jira_status)}
                        </td>
                        <td style="text-align: right;">
                            <button class="btn btn-ghost btn-sm btn-view-jira" data-key="${ticket.jira_key}" data-id="${ticket.id}">
                                🔍 Ver Detalle
                            </button>
                        </td>
                    </tr>
                `);
            });
        }

        return rows.join('');
    },

    renderStatusPill(status) {
        let color = 'var(--text-secondary)';
        let bg = 'rgba(0,0,0,0.05)';
        
        const s = status.toUpperCase();
        if (s.includes('DONE') || s.includes('FIXED') || s.includes('CERRADO')) {
            color = '#00875A'; bg = '#E3FCEF';
        } else if (s.includes('PROGRESS') || s.includes('DOING') || s.includes('PROGRESO')) {
            color = '#0052CC'; bg = '#DEEBFF';
        } else if (s.includes('TODO') || s.includes('PENDING') || s.includes('BACKLOG')) {
            color = '#42526E'; bg = '#F4F5F7';
        }

        return `
            <span style="padding: 4px 10px; border-radius: 100px; font-size: 0.65rem; font-weight: 800; color: ${color}; background: ${bg}; text-transform: uppercase;">
                ${status}
            </span>
        `;
    },

    bindEvents(container) {
        // Refresh
        container.querySelector('#btn-refresh-tracking')?.addEventListener('click', () => this.render(container));

        // Expand/Collapse Epic
        container.querySelectorAll('.epic-row').forEach(row => {
            row.addEventListener('click', () => {
                const key = row.dataset.epic;
                if (this.expandedEpics.has(key)) {
                    this.expandedEpics.delete(key);
                } else {
                    this.expandedEpics.add(key);
                }
                this.render(container);
            });
        });

        // View Details
        container.querySelectorAll('.btn-view-jira').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.key;
                const ticketId = parseInt(btn.dataset.id);
                const ticket = this.data.find(t => t.id === ticketId);
                this.openSideDetails(ticket);
            });
        });
    },

    async openSideDetails(ticket) {
        const content = `
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div style="background: var(--bg-surface-elevated); padding: 20px; border-radius: 16px; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="color: var(--brand); font-weight: 800; font-size: 0.9rem;">${ticket.jira_key}</span>
                        ${this.renderStatusPill(ticket.jira_status)}
                    </div>
                    <h3 style="margin: 0; font-size: 1.1rem; line-height: 1.4;">${UI.escapeHTML(ticket.title)}</h3>
                    <div style="margin-top: 16px;">
                        <a href="${ticket.jira_url}" target="_blank" class="btn btn-primary" style="width: 100%; background: #0052cc; color: white; text-align: center; text-decoration: none; font-weight: 700;">
                            🔗 ABRIR EN JIRA
                        </a>
                    </div>
                </div>

                <div class="details-section">
                    <h4 style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Detalles del Ticket</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="field">
                            <label style="display: block; font-size: 0.65rem; color: var(--text-secondary);">RESPONSABLE</label>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                ${ticket.jira_avatar ? `<img src="${ticket.jira_avatar}" style="width: 20px; height: 20px; border-radius: 50%;">` : ''}
                                <span style="font-weight: 600; font-size: 0.85rem;">${UI.escapeHTML(ticket.jira_assignee)}</span>
                            </div>
                        </div>
                        <div class="field">
                            <label style="display: block; font-size: 0.65rem; color: var(--text-secondary);">PRIORIDAD</label>
                            <span style="font-weight: 600; font-size: 0.85rem;">${ticket.jira_priority}</span>
                        </div>
                        <div class="field">
                            <label style="display: block; font-size: 0.65rem; color: var(--text-secondary);">ÉPICA</label>
                            <span style="font-weight: 600; font-size: 0.85rem;">${UI.escapeHTML(ticket.jira_epic_key)}</span>
                        </div>
                        <div class="field">
                            <label style="display: block; font-size: 0.65rem; color: var(--text-secondary);">CREACIÓN</label>
                            <span style="font-weight: 600; font-size: 0.85rem;">${new Date(ticket.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>

                <div class="comments-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin: 0;">Comentarios en Jira</h4>
                        <span id="comment-count" style="font-size: 0.7rem; background: var(--bg-hover); padding: 2px 8px; border-radius: 10px;">Cargando...</span>
                    </div>
                    <div id="jira-comments-container" style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto; padding-bottom: 20px;">
                        <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Obteniendo comentarios de Jira...</div>
                    </div>
                </div>

                <!-- Área de Nuevo Comentario -->
                <div style="background: var(--bg-surface-elevated); padding: 16px; border-radius: 16px; border: 1px solid var(--border); margin-top: auto;">
                    <textarea id="new-comment-text" placeholder="Escribe un comentario o respuesta..." style="width: 100%; min-height: 80px; padding: 12px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main); font-family: inherit; font-size: 0.85rem; resize: none; margin-bottom: 12px;"></textarea>
                    <button id="btn-send-comment" class="btn btn-primary" style="width: 100%; background: var(--brand); color: white; font-weight: 700; font-size: 0.8rem;">
                        💬 ENVIAR COMENTARIO
                    </button>
                </div>
            </div>
        `;

        UI.showSidePanel('SEGUIMIENTO DE TICKET', content);
        this.loadComments(ticket.jira_key);

        // Lógica de envío de comentario
        const btnSend = document.getElementById('btn-send-comment');
        const textInput = document.getElementById('new-comment-text');

        btnSend.onclick = async () => {
            const text = textInput.value.trim();
            if (!text) return;

            btnSend.disabled = true;
            btnSend.innerText = '⌛ ENVIANDO...';

            try {
                const mentionId = textInput.dataset.mentionId;
                const mentionName = textInput.dataset.mentionName;
                
                // Si el texto ya no contiene la mención, la limpiamos de los metadatos
                const finalMentionId = text.startsWith(`@[${mentionName}]`) ? mentionId : null;

                await ApiService.addJiraComment(Store.state.activeProjectId, ticket.jira_key, text, finalMentionId);
                textInput.value = '';
                delete textInput.dataset.mentionId;
                delete textInput.dataset.mentionName;
                UI.toast('Comentario añadido');
                this.loadComments(ticket.jira_key); // Recargar hilo
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                btnSend.disabled = false;
                btnSend.innerText = '💬 ENVIAR COMENTARIO';
            }
        };
    },

    async loadComments(issueKey) {
        const container = document.getElementById('jira-comments-container');
        const countSpan = document.getElementById('comment-count');
        
        try {
            const { comments } = await ApiService.getJiraComments(Store.state.activeProjectId, issueKey);
            
            countSpan.innerText = `${comments.length} comentarios`;

            if (comments.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: var(--bg-surface); border-radius: 8px;">No hay comentarios en este ticket aún.</div>';
                return;
            }

            container.innerHTML = comments.map(c => {
                const authorName = c.author.displayName;
                const avatarUrl = c.author.avatarUrls?.['32x32'] || c.author.avatarUrls?.['48x48'];
                const dateStr = new Date(c.created).toLocaleString();
                const bodyText = this.parseADF(c.body);

                return `
                    <div style="padding: 12px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border); position: relative;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${avatarUrl ? `<img src="${avatarUrl}" style="width: 20px; height: 20px; border-radius: 50%;">` : ''}
                                <span style="font-weight: 700; font-size: 0.75rem; color: var(--brand);">${UI.escapeHTML(authorName)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 0.65rem; color: var(--text-muted);">${dateStr}</span>
                                <button class="btn-reply-comment" data-id="${c.author.accountId}" data-name="${authorName}" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 0;" title="Responder">↩️</button>
                            </div>
                        </div>
                        <div style="font-size: 0.8rem; line-height: 1.5; color: var(--text-main);">
                            ${UI.escapeHTML(bodyText)}
                        </div>
                    </div>
                `;
            }).join('');

            // Vincular eventos de respuesta
            container.querySelectorAll('.btn-reply-comment').forEach(btn => {
                btn.onclick = () => {
                    const name = btn.dataset.name;
                    const input = document.getElementById('new-comment-text');
                    input.value = `@[${name}] `;
                    input.dataset.mentionId = btn.dataset.id;
                    input.dataset.mentionName = name;
                    input.focus();
                };
            });

        } catch (err) {
            container.innerHTML = `<div style="color: var(--fail); font-size: 0.8rem;">Error al cargar comentarios: ${err.message}</div>`;
        }
    },

    /**
     * Procesa recursivamente el formato ADF de Jira para extraer texto plano.
     */
    parseADF(node) {
        if (!node) return "";
        let text = "";

        if (node.text) {
            text += node.text;
        } else if (node.type === 'mention') {
            text += `@${node.attrs.text || 'Usuario'}`;
        }

        if (node.content && Array.isArray(node.content)) {
            node.content.forEach(child => {
                text += this.parseADF(child);
            });
        }

        return text;
    }
};
