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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: var(--primary);">👥 Gestión de Equipo</h2>
                    <button class="btn btn-primary" id="btn-new-user">+ Nuevo Usuario</button>
                </div>

                <div class="tt-team-grid">
                    ${team.map(u => this.renderUserCard(u, projects, permKeys)).join('')}
                </div>
            </div>
            <style>
                .tt-team-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 14px;
                }
                .tt-team-card {
                    background: var(--apple-bg-elevated);
                    border: 1px solid var(--apple-separator);
                    border-radius: var(--apple-radius-lg);
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .tt-team-card:hover {
                    border-color: var(--apple-blue);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
                }
                .tt-team-card-head {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .tt-team-avatar {
                    width: 38px; height: 38px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--apple-blue), var(--apple-indigo));
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                .tt-team-name {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: var(--apple-label);
                    line-height: 1.2;
                }
                .tt-team-email {
                    font-size: 0.7rem;
                    color: var(--apple-label-tertiary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .tt-team-badges {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .tt-team-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.66rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                .tt-badge-admin { background: rgba(255,59,48,0.1); color: var(--apple-red); }
                .tt-badge-rol { background: var(--apple-blue-soft); color: var(--apple-blue); }
                .tt-badge-perfil { background: var(--apple-fill); color: var(--apple-label-secondary); }
                .tt-team-projects {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .tt-team-project-chip {
                    display: inline-flex;
                    padding: 2px 8px;
                    border-radius: 6px;
                    background: var(--apple-indigo-soft);
                    color: var(--apple-indigo);
                    font-size: 0.66rem;
                    font-weight: 600;
                }
                .tt-team-projects-empty {
                    font-size: 0.7rem;
                    color: var(--apple-label-tertiary);
                    font-style: italic;
                }
                .tt-team-perms {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 4px 8px;
                }
                .tt-team-perm {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.7rem;
                    color: var(--apple-label-secondary);
                }
                .tt-team-perm-dot {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .tt-team-perm-dot.on { background: var(--apple-green); }
                .tt-team-perm-dot.off { background: var(--apple-red); opacity: 0.4; }
                .tt-team-actions {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 4px;
                    border-top: 1px solid var(--apple-separator);
                }
            </style>
        `;

        this.bindEvents(container);
    },

    renderUserCard(u, projects, permKeys) {
        const initials = (u.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
        const isAdmin = u.perfil === 'admin';
        const projectsHtml = (u.projects || []).length > 0
            ? `<div class="tt-team-projects">${u.projects.map(pid => {
                const p = projects.find(proj => proj.id === pid);
                return p ? `<span class="tt-team-project-chip">${UI.escapeHTML(p.name)}</span>` : '';
            }).join('')}</div>`
            : `<div class="tt-team-projects-empty">Sin proyectos asignados</div>`;

        const permsHtml = `<div class="tt-team-perms">${permKeys.map(k => {
            const on = u[k] === true || u[k] === 1;
            return `<div class="tt-team-perm" title="${PERM_LABELS[k]}: ${on ? 'sí' : 'no'}">
                <span class="tt-team-perm-dot ${on ? 'on' : 'off'}"></span>
                <span style="${on ? '' : 'opacity: 0.5;'}">${PERM_LABELS[k]}</span>
            </div>`;
        }).join('')}</div>`;

        return `
            <div class="tt-team-card" data-user-id="${u.id}">
                <div class="tt-team-card-head">
                    <div class="tt-team-avatar">${UI.escapeHTML(initials)}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="tt-team-name">${UI.escapeHTML(u.name)}</div>
                        <div class="tt-team-email" title="${UI.escapeHTML(u.email)}">${UI.escapeHTML(u.email)}</div>
                    </div>
                </div>
                <div class="tt-team-badges">
                    ${isAdmin ? `<span class="tt-team-badge tt-badge-admin">Admin</span>` : `<span class="tt-team-badge tt-badge-perfil">${UI.escapeHTML(u.perfil || 'user')}</span>`}
                    ${u.role ? `<span class="tt-team-badge tt-badge-rol">${UI.escapeHTML(u.role)}</span>` : ''}
                </div>
                <div>
                    <div style="font-size: 0.66rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Proyectos</div>
                    ${projectsHtml}
                </div>
                <div>
                    <div style="font-size: 0.66rem; font-weight: 700; color: var(--apple-label-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Permisos</div>
                    ${permsHtml}
                </div>
                <div class="tt-team-actions">
                    <button class="btn btn-sm btn-edit-user" data-id="${u.id}" style="padding: 5px 14px; border-radius: var(--apple-radius-sm); font-size: 0.74rem; font-weight: 600; background: var(--apple-blue); color: white; border: none;">Editar</button>
                </div>
            </div>
        `;
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
