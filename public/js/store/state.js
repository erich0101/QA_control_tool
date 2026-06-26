/**
 * STATE.JS - Gestión de estado global con persistencia.
 */

const STORAGE_KEY = 'qa_app_state';

export const Store = {
    state: {
        // Theme
        theme: localStorage.getItem('theme') || 'dark',

        // Proyecto
        projects: [],
        activeProjectId: localStorage.getItem('activeProjectId') || null,

        // Tabs
        activeTab: localStorage.getItem('activeTab') || 'use-cases',

        // Casos de Uso
        useCases: [],
        selectedUseCaseId: localStorage.getItem('selectedUseCaseId') || null,

        // Datos por tab
        userStories: [],
        selectedUSId: localStorage.getItem('selectedUSId') || null,
        testSuites: [],
        preconditions: [],

        // Tracking de frescura por CU
        loadedForUC: {
            userStories: null,
            testSuites: null
        },
        loadedStoryUcIds: new Set(),

        // Legacy (compatibilidad guardado/reporte)
        data: { pruebas: [] },
        currentIdx: -1,
        sbsPairs: [],
        isLoading: false,
        jiraEpics: [],
        hallazgos: [],
        suggestions: []
    },
    
    listeners: [],

    subscribe(fn) {
        this.listeners.push(fn);
    },

    notify() {
        this.listeners.forEach(fn => fn(this.state));
    },

    save() {
        localStorage.setItem('activeProjectId', this.state.activeProjectId || '');
        localStorage.setItem('activeTab', this.state.activeTab || '');
        localStorage.setItem('selectedUseCaseId', this.state.selectedUseCaseId || '');
        localStorage.setItem('selectedUSId', this.state.selectedUSId || '');
    },

    setTheme(theme) {
        // Add transition class for smooth animation
        document.documentElement.classList.add('theme-transition');
        document.documentElement.setAttribute('data-theme', theme);
        this.state.theme = theme;
        localStorage.setItem('theme', theme);
        this.notify();
        // Remove transition class after animation
        setTimeout(() => document.documentElement.classList.remove('theme-transition'), 350);
    },

    setState(newState) {
        Object.assign(this.state, newState);
        this.save();
        this.notify();
    },

    // Proyectos
    setProjects(projects) {
        this.state.projects = projects;
        this.notify();
    },

    setActiveProject(id) {
        this.state.activeProjectId = id;
        this.state.useCases = [];
        this.state.selectedUseCaseId = null;
        this.state.userStories = [];
        this.state.selectedUSId = null;
        this.state.testSuites = [];
        this.state.jiraEpics = [];
        this.state.loadedForUC.userStories = null;
        this.state.loadedForUC.testSuites = null;
        this.state.loadedStoryUcIds = new Set();
        this.save();
        this.notify();
    },

    // Casos de Uso
    setUseCases(cases) {
        this.state.useCases = cases;
        this.notify();
    },

    setSelectedUseCase(id) {
        this.state.selectedUseCaseId = id;
        this.state.userStories = [];
        this.state.selectedUSId = null;
        this.state.testSuites = [];
        this.state.loadedForUC.userStories = null;
        this.state.loadedForUC.testSuites = null;
        this.state.loadedStoryUcIds = new Set();
        this.save();
        this.notify();
    },

    // Tabs
    setActiveTab(tab) {
        this.state.activeTab = tab;
        this.save();
        this.notify();
    },

    // User Stories
    setUserStories(stories, ucId) {
        this.state.userStories = stories;
        if (ucId != null) this.state.loadedStoryUcIds.add(Number(ucId));
        this.state.loadedForUC.userStories = ucId != null ? ucId : this.state.selectedUseCaseId;
        this.notify();
    },

    setSelectedUS(id) {
        this.state.selectedUSId = id;
        this.save();
        this.notify();
    },

    isStale(dataKey) {
        return this.state.loadedForUC[dataKey] !== this.state.selectedUseCaseId;
    },

    // Test Suites
    setTestSuites(suites) {
        this.state.testSuites = suites;
        this.state.loadedForUC.testSuites = this.state.selectedUseCaseId;
        this.notify();
    },

    // Precondiciones
    setPreconditions(precs) {
        this.state.preconditions = precs;
        this.notify();
    },

    // Legacy
    setData(newData) {
        this.state.data = newData;
        this.notify();
    },

    setCurrentIdx(idx) {
        this.state.currentIdx = idx;
        this.notify();
    },

    setSbsPairs(pairs) {
        this.state.sbsPairs = pairs;
        this.notify();
    },

    setLoading(loading) {
        this.state.isLoading = loading;
    },

    setJiraEpics(epics) {
        this.state.jiraEpics = epics;
        this.notify();
    },

    // Hallazgos
    setHallazgos(hallazgos) {
        this.state.hallazgos = hallazgos;
        this.notify();
    },
    setSuggestions(suggestions) {
        this.state.suggestions = suggestions;
        this.notify();
    }
};

// Cache simple por tab/proyecto con TTL.
// Permite que cambiar de tab no re-pegue al backend si los datos siguen frescos.
// Forma de la clave: `${tabKey}::${projectId}`. Valor: { ts, data, promise? }.
const TAB_CACHE_TTL_MS = 30000;
const tabCache = new Map();

export function getCachedTab(tabKey, projectId) {
    const key = `${tabKey}::${projectId || ''}`;
    const entry = tabCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > TAB_CACHE_TTL_MS) {
        tabCache.delete(key);
        return null;
    }
    return entry;
}

export function setCachedTab(tabKey, projectId, data) {
    const key = `${tabKey}::${projectId || ''}`;
    tabCache.set(key, { ts: Date.now(), data });
}

export function invalidateTabCache(tabKey, projectId) {
    if (tabKey) {
        if (projectId != null) {
            tabCache.delete(`${tabKey}::${projectId}`);
        } else {
            for (const k of tabCache.keys()) {
                if (k.startsWith(`${tabKey}::`)) tabCache.delete(k);
            }
        }
    } else {
        tabCache.clear();
    }
}
