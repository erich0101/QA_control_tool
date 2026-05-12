import { Store } from '../store/state.js';
import { ApiService } from '../services/api.js';
import { Modals } from './modals.js';
import { UI } from '../utils/ui-utils.js';

/**
 * TOPBAR.JS - Barra superior con selector de Proyecto.
 */
export const TopBar = {
    render(container) {
        const { projects, activeProjectId } = Store.state;

        container.innerHTML = `
            <div class="topbar-brand">
                <div class="topbar-brand-icon">🧪</div>
                <div>
                    <h1>Manual QA</h1>
                    <div class="topbar-brand-sub">JIRA Edition</div>
                </div>
            </div>
            <div class="topbar-actions">
                ${Store.state.user ? `
                    <div style="display: flex; align-items: center; gap: 8px; margin-right: 16px;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">${UI.escapeHTML(Store.state.user.name)}</span>
                        <button class="btn-icon" id="btn-logout" title="Cerrar Sesión" style="font-size: 0.8rem; border: 1px solid var(--border); padding: 4px;">🚪</button>
                    </div>
                ` : ''}
                <select id="project-select">
                    ${projects.length === 0
                        ? '<option value="">Sin proyectos</option>'
                        : projects.map(p => `
                            <option value="${p.id}" ${p.id === activeProjectId ? 'selected' : ''}>${UI.escapeHTML(p.name)}</option>
                        `).join('')
                    }
                </select>
                ${activeProjectId && (Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA') ? `<button class="btn-icon" id="btn-edit-project" title="Editar Nombre Proyecto" style="font-size: 0.8rem; border: 1px solid var(--border); padding: 4px;">✏️</button>` : ''}
                ${activeProjectId && (Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA') ? `<button class="btn-icon" id="btn-jira-config" title="Configurar Jira" style="font-size: 0.8rem; border: 1px solid var(--border); padding: 4px;">🏢</button>` : ''}
                ${Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA' ? `<button class="btn btn-primary btn-sm" id="btn-new-project">+ Proyecto</button>` : ''}
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
