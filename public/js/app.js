import { Store } from './store/state.js';
import { ApiService } from './services/api.js';
import { TopBar } from './components/topbar.js';
import { TabBar } from './components/tabbar.js';
import { UserStories } from './components/user-stories.js';
import { TestSuitesTab } from './components/test-suites-tab.js';
import { TeamTab } from './components/team-tab.js';
import { ExecutionTab } from './components/execution-tab.js';
import { DashboardTab } from './components/dashboard-tab.js';
import { HistoryTab } from './components/history-tab.js';
import { JiraTrackingTab } from './components/jira-tracking-tab.js';
import { MiJiraTab } from './components/mi-jira-tab.js';
import { HallazgosTab } from './components/hallazgos-tab.js';
import { UI } from './utils/ui-utils.js';
import { RealtimeService } from './services/realtime.js';
import { Modals } from './components/modals.js';

/**
 * APP.JS - Entry point de la aplicación.
 */

async function init() {
    console.log("🚀 Inicializando Manual QA Tool JIRA Edition...");
    
    // Apply saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const topbar = document.getElementById('topbar');
    const tabbar = document.getElementById('tabbar');
    const content = document.getElementById('tab-content');

    // Suscribirse a cambios de estado
    Store.subscribe((state) => {
        TopBar.render(topbar);
        TabBar.render(tabbar);
        renderActiveTab(content, state);
    });

    try {
        UI.showLoading();
        
        // Autenticación inicial
        try {
            const { user, permissions } = await ApiService.getMe();
            Store.state.user = { ...user, permissions };
            
            // Cargar equipo para asignaciones (evita que el dropdown de test esté vacío)
            const { users } = await ApiService.getUsers();
            Store.state.team = users || [];

            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
        } catch(e) {
            UI.hideLoading();
            return; // Detener init, el interceptor ya mostró el login
        }
        
        // Cargar proyectos
        const { projects } = await ApiService.getProjects();
        Store.state.projects = projects || [];
        
        // Recuperar proyecto activo (Persistido o default)
        const persistedId = Store.state.activeProjectId;
        const activeProject = projects?.find(p => p.id == persistedId) || projects?.find(p => p.status === 'ACTIVE') || projects?.[0];
        
        if (activeProject) {
            Store.state.activeProjectId = activeProject.id;
            
            // Cargar Casos de Uso del proyecto activo
            const { useCases } = await ApiService.getUseCases(activeProject.id);
            Store.state.useCases = useCases || [];

            // Seleccionar primer Caso de Uso por defecto si no hay uno seleccionado
            if (Store.state.useCases.length > 0 && !Store.state.selectedUseCaseId) {
                Store.setSelectedUseCase(Store.state.useCases[0].id);
            }

            // Si hay un Caso de Uso activo, cargar sus historias
            if (Store.state.selectedUseCaseId) {
                const { stories } = await ApiService.getUserStories(Store.state.selectedUseCaseId);
                Store.setUserStories(stories || [], Store.state.selectedUseCaseId);

                // Seleccionar primera US por defecto si no hay una seleccionada
                if (Store.state.userStories.length > 0 && !Store.state.selectedUSId) {
                    Store.state.selectedUSId = Store.state.userStories[0].id;
                }
            }
        }

        // Trigger initial render
        Store.notify();
        UI.hideLoading();
        UI.toast("Sesión recuperada");

        // Inicializar Realtime
        RealtimeService.init();
        TestSuitesTab.setupRealtimeListener();
        ExecutionTab.setupRealtimeListener();
        HistoryTab.setupRealtimeListener();
        HallazgosTab.setupRealtimeListener();
        JiraTrackingTab.setupRealtimeListener();
        MiJiraTab.setupRealtimeListener();

    } catch (error) {
        UI.hideLoading();
        UI.toast("Error al cargar datos", "error");
        console.error("❌ Error durante la inicialización:", error);
        // Still render empty state
        Store.notify();
    }
}

function renderActiveTab(container, state) {
    const containerScroll = container.scrollTop;
    const windowScrollY = window.scrollY;

    // Guard: si el tab activo requiere admin y el usuario no lo es, forzar fallback.
    const isAdmin = state.user?.perfil === 'admin';
    let activeTab = state.activeTab;
    if (activeTab === 'team' && !isAdmin) {
        activeTab = 'use-cases';
    }

    switch (activeTab) {
        case 'use-cases':
            UserStories.render(container);
            break;
        case 'test-suites':
            TestSuitesTab.render(container);
            break;
        case 'team':
            TeamTab.render(container);
            break;
        case 'execution':
            ExecutionTab.render(container);
            break;
        case 'history':
            HistoryTab.render(container);
            break;
        case 'jira-tracking':
            JiraTrackingTab.render(container);
            break;
        case 'dashboard':
            DashboardTab.render(container);
            break;
        case 'hallazgos':
            HallazgosTab.render(container);
            break;
        case 'mi-jira':
            MiJiraTab.render(container);
            break;
        default:
            UserStories.render(container);
    }

    container.scrollTop = containerScroll;
    window.scrollTo(0, windowScrollY);
}

// Escuchar cambios de pestaña externos (ej: desde Retest)
window.addEventListener('change-tab', (e) => {
    Store.setState({ activeTab: e.detail });
});



// Iniciar aplicación
// Escuchar error de autenticación
window.addEventListener('auth-error', () => {
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
});

// Manejar form de login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        UI.showLoading();
        const res = await ApiService.login(email, pass);
        if (res.ok) {
            window.location.reload(); // Recargar para inicializar correctamente
        }
    } catch(err) {
        UI.hideLoading();
        Modals.render('alert', { title: 'Error de Acceso', msg: err.message });
    }
});

document.addEventListener('DOMContentLoaded', init);
