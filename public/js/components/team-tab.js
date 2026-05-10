import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { UI } from '../utils/ui-utils.js';
import { Modals } from './modals.js';

export const TeamTab = {
    async render(container) {
        if (Store.state.user?.role !== 'Admin' && Store.state.user?.role !== 'Analista QA') {
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

        container.innerHTML = `
            <div class="panel">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; color: var(--primary);">👥 Gestión de Equipo</h2>
                    <button class="btn btn-primary" id="btn-new-user">+ Nuevo Usuario</button>
                </div>
                
                <table class="tt-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Email</th>
                            <th>Rol</th>
                            <th>Proyectos</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${team.map(u => `
                            <tr>
                                <td><strong>${UI.escapeHTML(u.name)}</strong></td>
                                <td style="color: var(--text-secondary);">${UI.escapeHTML(u.email)}</td>
                                <td><span class="tt-key" style="font-family: inherit;">${UI.escapeHTML(u.role)}</span></td>
                                <td>
                                    ${u.projects?.length > 0 ? 
                                        u.projects.map(pid => {
                                            const p = projects.find(proj => proj.id === pid);
                                            return p ? `<span class="tt-link-badge" style="margin-right: 4px;">${UI.escapeHTML(p.name)}</span>` : '';
                                        }).join('') 
                                        : '<span style="color: var(--text-muted)">—</span>'}
                                </td>
                                <td>
                                    <button class="btn-icon btn-edit-user" data-id="${u.id}" title="Editar">✏️</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
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
