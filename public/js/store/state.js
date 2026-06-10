/**
 * STATE.JS - Gestión de estado global con persistencia.
 */

const STORAGE_KEY = 'qa_app_state';

export const Store = {
    state: {
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

        // Legacy (compatibilidad guardado/reporte)
        data: { pruebas: [] },
        currentIdx: -1,
        sbsPairs: [],
        isLoading: false,
        jiraEpics: [],
        hallazgos: []
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
    setUserStories(stories) {
        this.state.userStories = stories;
        this.state.loadedForUC.userStories = this.state.selectedUseCaseId;
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
    }
};
