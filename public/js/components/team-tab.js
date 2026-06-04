import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { Modals } from './modals.js';

const PERM_LABELS = {
    can_create_cu: 'Crear CU',
    can_create_hu: 'Crear HU',
    can_create_suite: 'Crear Suite',
    can_create_test: 'Crear Test',
    can_assign_cu: 'Asignar CU',
    can_assign_hu: 'Asignar HU',
    can_assign_suite: 'Asignar Suite',
    can_execute_test: 'Ejecutar',
    can_manage_projects: 'Proyectos',
    can_manage_users: 'Usuarios',
    can_configure_jira: 'Jira'
};

function renderPermBadge(user, key) {
    const has = user[key] === true || user[key] === 1;
    return `<span class="perm-badge ${has ? 'perm-on' : 'perm-off'}" title="${PERM_LABELS[key]}">${has ? '✓' : '✗'}</span>`;
}

export const TeamTab = {
    async render(container) {
        if (Store.state.user?.perfil !== 'admin') {
            container.innerHTML = `<div class="empty-state">No tienes permisos para ver esta sección.</div>`;
            return;
        }

        try {
            UI.showLoading();
            const { users } = await ApiService.getUsers();
            Store.state.team = users || [];
            UI.hideLoading();
        } catch (err) {
            UI.hideLoading();
            container.innerHTML = `<div class="empty-state">Error cargando equipo: ${err.message}</div>`;
            return;
        }

        const team = Store.state.team;
        const projects = Store.state.projects || [];
        const permKeys = Object.keys(PERM_LABELS);

        container.innerHTML = `
            <div class="panel">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; color: var(--primary);">👥 Gestión de Equipo</h2>
                    <button class="btn btn-primary" id="btn-new-user">+ Nuevo Usuario</button>
                </div>
                
                <div style="overflow-x: auto;">
                    <table class="tt-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Email</th>
                                <th>Perfil</th>
                                <th>Rol</th>
                                <th>Proyectos</th>
                                ${permKeys.map(k => `<th title="${PERM_LABELS[k]}" style="text-align:center; font-size:0.65rem; padding:4px;">${PERM_LABELS[k].replace(' ','<br>')}</th>`).join('')}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${team.map(u => `
                                <tr>
                                    <td><strong>${UI.escapeHTML(u.name)}</strong></td>
                                    <td style="color: var(--text-secondary);">${UI.escapeHTML(u.email)}</td>
                                    <td><span class="tt-key" style="font-family: inherit; ${u.perfil === 'admin' ? 'color: var(--ok); font-weight:800;' : ''}">${UI.escapeHTML(u.perfil || 'user')}</span></td>
                                    <td><span class="tt-key" style="font-family: inherit;">${UI.escapeHTML(u.role)}</span></td>
                                    <td>
                                        ${u.projects?.length > 0 ? 
                                            u.projects.map(pid => {
                                                const p = projects.find(proj => proj.id === pid);
                                                return p ? `<span class="tt-link-badge" style="margin-right: 4px;">${UI.escapeHTML(p.name)}</span>` : '';
                                            }).join('') 
                                            : '<span style="color: var(--text-muted)">—</span>'}
                                    </td>
                                    ${permKeys.map(k => `<td style="text-align:center;">${renderPermBadge(u, k)}</td>`).join('')}
                                    <td>
                                        <button class="btn-icon btn-edit-user" data-id="${u.id}" title="Editar">✏️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>
                .perm-badge { display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
                .perm-on { background: rgba(34,197,94,0.15); color: #22c55e; }
                .perm-off { background: rgba(239,68,68,0.1); color: #ef4444; }
            </style>
        `;

        this.bindEvents(container);
    },

    bindEvents(container) {
        container.querySelector('#btn-new-user').addEventListener('click', () => {
            Modals.render('user-admin', {
                projects: Store.state.projects,
                onSuccess: () => this.render(container)
            });
        });

        container.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const user = Store.state.team.find(u => u.id === id);
                if (!user) return;

                Modals.render('user-admin', {
                    user,
                    projects: Store.state.projects,
                    onSuccess: () => this.render(container)
                });
            });
        });
    }
};
