import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';

/**
 * TOPBAR.JS - Barra superior con selector de Proyecto.
 */
export const TopBar = {
    render(container) {
        const { projects, activeProjectId, theme } = Store.state;
        const user = Store.state.user;

        container.innerHTML = `
            <div class="topbar-brand">
                <div class="topbar-brand-icon">🧪</div>
                <div>
                    <h1>Manual QA</h1>
                    <div class="topbar-brand-sub">JIRA Edition</div>
                </div>
                ${user ? `
                    <div style="display: flex; align-items: center; gap: 8px; margin-left: 20px; padding-left: 20px; border-left: 1px solid var(--apple-separator);">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--apple-blue); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: white;">${user.name.charAt(0).toUpperCase()}</div>
                        <span style="font-size: 0.85rem; font-weight: 500; color: var(--apple-label);">${UI.escapeHTML(user.name)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="topbar-actions">
                <div class="topbar-project-actions">
                    ${activeProjectId && user?.perfil === 'admin' ? `<button class="btn btn-ghost btn-sm" id="btn-edit-project">Editar Proyecto</button>` : ''}
                    ${activeProjectId && user?.perfil === 'admin' ? `<button class="btn btn-ghost btn-sm" id="btn-jira-config">Configurar JIRA</button>` : ''}
                    ${activeProjectId ? `<button class="btn btn-ghost btn-sm" id="btn-export-project">Exportar Matriz</button>` : ''}
                </div>
                <div class="topbar-controls">
                    <select id="project-select" class="st-select">
                        ${projects.length === 0
                            ? '<option value="">Sin proyectos</option>'
                            : projects.map(p => `
                                <option value="${p.id}" ${p.id === activeProjectId ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>
                            `).join('')
                        }
                    </select>
                    ${user?.perfil === 'admin' ? `<button class="btn btn-primary btn-sm" id="btn-new-project">+ Proyecto</button>` : ''}
                    <button class="btn btn-ghost btn-sm" id="btn-theme-toggle">${theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro'}</button>
                    ${user ? `<button class="btn btn-ghost btn-sm" id="btn-logout">Salir</button>` : ''}
                </div>
            </div>
        `;

        this.bindEvents(container);
    },

    bindEvents(container) {
        container.querySelector('#project-select')?.addEventListener('change', async (e) => {
            const id = parseInt(e.target.value);
            if (!id) return;
            Store.setActiveProject(id);
            UI.showLoading();
            const { useCases } = await ApiService.getUseCases(id);
            Store.setUseCases(useCases || []);
            
            // Seleccionar el primero por defecto
            if (useCases && useCases.length > 0) {
                Store.setSelectedUseCase(useCases[0].id);
                // Cargar también las historias del primer caso de uso
                const { stories } = await ApiService.getUserStories(useCases[0].id);
                Store.setUserStories(stories || []);
            }
            
            UI.hideLoading();
        });

        container.querySelector('#btn-theme-toggle')?.addEventListener('click', () => {
            const newTheme = Store.state.theme === 'dark' ? 'light' : 'dark';
            Store.setTheme(newTheme);
        });

        container.querySelector('#btn-new-project')?.addEventListener('click', () => {
            Modals.render('new-project');
        });

        container.querySelector('#btn-edit-project')?.addEventListener('click', async () => {
            const currentProject = Store.state.projects.find(p => p.id === Store.state.activeProjectId);
            if (!currentProject) return;
            
            Modals.render('prompt', {
                title: 'Editar Proyecto',
                msg: 'Nuevo nombre para el proyecto:',
                value: currentProject.name,
                onConfirm: async (newName) => {
                    if (newName && newName !== currentProject.name) {
                        UI.showLoading();
                        await ApiService.updateProject(currentProject.id, { name: newName });
                        const { projects } = await ApiService.getProjects();
                        Store.setProjects(projects || []);
                        UI.hideLoading();
                        UI.toast("Proyecto actualizado");
                    }
                }
            });
        });
        
        container.querySelector('#btn-jira-config')?.addEventListener('click', async () => {
            UI.showLoading();
            try {
                const { config, userHasToken } = await ApiService.getJiraConfig(Store.state.activeProjectId);
                Modals.render('jira-config', { config: config || {}, userHasToken: !!userHasToken });
            } catch (err) {
                UI.toast("Error al obtener configuración de Jira", "error");
            }
            UI.hideLoading();
        });

        container.querySelector('#btn-export-project')?.addEventListener('click', () => {
            const projectId = Store.state.activeProjectId;
            if (!projectId) return UI.toast('Selecciona un proyecto primero', 'error');
            UI.toast('Generando Matriz del Proyecto...', 'ok');
            ApiService.exportProjectMatrix(projectId);
        });

        container.querySelector('#btn-logout')?.addEventListener('click', async () => {
            try {
                UI.showLoading();
                await ApiService.logout();
                window.location.reload();
            } catch (err) {
                UI.hideLoading();
                UI.toast("Error cerrando sesión", "error");
            }
        });
    }
};
