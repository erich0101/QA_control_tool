/**
 * API.JS - Capa de servicios.
 * Encapsula todas las llamadas fetch al backend.
 */

const json = async (res) => {
    if (res.status === 401) {
        window.dispatchEvent(new Event('auth-error'));
        throw new Error('No autorizado');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error en la petición');
    return data;
};
const headers = { 'Content-Type': 'application/json' };

export const ApiService = {
    // ── Auth & Users ──
    async login(email, password) {
        return fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), headers }).then(json);
    },
    async getMe() {
        return fetch('/api/auth/me').then(json);
    },
    async logout() {
        return fetch('/api/auth/logout', { method: 'POST' }).then(json);
    },
    async getUsers() {
        return fetch('/api/users').then(json);
    },
    async createUser(data) {
        return fetch('/api/users', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateUser(id, data) {
        return fetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },

    // ── Proyectos ──
    async getProjects() {
        return fetch('/api/projects').then(json);
    },
    async createProject(data) {
        return fetch('/api/projects', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateProject(id, data) {
        return fetch(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteProject(id) {
        return fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(json);
    },

    // ── Casos de Uso ──
    async getUseCases(projectId) {
        return fetch(`/api/use-cases?project_id=${projectId}`).then(json);
    },
    async createUseCase(data) {
        return fetch('/api/use-cases', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateUseCase(id, data) {
        return fetch(`/api/use-cases/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteUseCase(id) {
        return fetch(`/api/use-cases/${id}`, { method: 'DELETE' }).then(json);
    },

    // ── User Stories ──
    async getUserStories(useCaseId) {
        return fetch(`/api/user-stories?use_case_id=${useCaseId}`).then(json);
    },
    async createUserStory(data) {
        return fetch('/api/user-stories', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateUserStory(id, data) {
        return fetch(`/api/user-stories/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteUserStory(id) {
        return fetch(`/api/user-stories/${id}`, { method: 'DELETE' }).then(json);
    },

    // ── Scenarios ──
    async createScenario(data) {
        return fetch('/api/scenarios', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateScenario(id, data) {
        return fetch(`/api/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteScenario(id) {
        return fetch(`/api/scenarios/${id}`, { method: 'DELETE' }).then(json);
    },
    
    // ── Inconsistencies ──
    async createInconsistency(data) {
        return fetch('/api/inconsistencies', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateInconsistency(id, data) {
        return fetch(`/api/inconsistencies/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteInconsistency(id) {
        return fetch(`/api/inconsistencies/${id}`, { method: 'DELETE' }).then(json);
    },

    // ── Precondiciones ──
    async getPreconditions(usId) {
        return fetch(`/api/preconditions?us_id=${usId}`).then(json);
    },
    async createPrecondition(data) {
        return fetch('/api/preconditions', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async linkPrecondition(tcId, prcId) {
        return fetch('/api/preconditions/link', { method: 'POST', body: JSON.stringify({ tc_id: tcId, prc_id: prcId }), headers }).then(json);
    },
    async deletePrecondition(id) {
        return fetch(`/api/preconditions/${id}`, { method: 'DELETE' }).then(json);
    },

    // ── Test Suites ──
    async getTestSuites(useCaseId, projectId) {
        const query = useCaseId ? `use_case_id=${useCaseId}` : `project_id=${projectId}`;
        return fetch(`/api/test-suites?${query}`).then(json);
    },
    async createTestSuite(data) {
        return fetch('/api/test-suites', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateTestSuite(id, data) {
        return fetch(`/api/test-suites/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async updateSuiteInconsistencies(suiteId, inconsistencies) {
        return fetch(`/api/test-suites/${suiteId}/inconsistencies`, { method: 'PUT', body: JSON.stringify({ inconsistencies }), headers }).then(json);
    },
    async getTestSuite(suiteId) {
        return fetch(`/api/test-suites/${suiteId}`).then(json);
    },
    async deleteTestSuite(id) {
        return fetch(`/api/test-suites/${id}`, { method: 'DELETE' }).then(json);
    },
    async getSuiteStats(projectId) {
        const url = `/api/stats/suites?project_id=${projectId}`;
        return fetch(url).then(json);
    },
    async getOverviewStats(projectId) {
        const url = `/api/stats/overview?project_id=${projectId}`;
        return fetch(url).then(json);
    },

    async startRun(suiteId, execution_type = 'FULL', filters = null, only_assigned = false) {
        return fetch(`/api/test-suites/${suiteId}/start-execution`, { 
            method: 'POST', 
            body: JSON.stringify({ execution_type, filters, only_assigned }),
            headers 
        }).then(json);
    },
    async finishRun(suiteId) {
        return fetch(`/api/test-suites/${suiteId}/finish-execution`, { method: 'POST' }).then(json);
    },
    async finishTestSuite(id) {
        return this.finishRun(id);
    },
    async startSuiteExecution(suiteId, only_assigned = false) {
        return this.startRun(suiteId, 'FULL', null, only_assigned);
    },
    async startTestCaseExecution(id) {
        return fetch(`/api/test-cases/${id}/start-execution`, { method: 'POST' }).then(json);
    },
    async getHistory(projectId) {
        return fetch(`/api/history?project_id=${projectId}`).then(json);
    },
    async getRunBugs(runId) {
        return fetch(`/api/runs/${runId}/bugs`).then(json);
    },
    async pauseRun(runId) {
        return fetch(`/api/runs/${runId}/pause`, { method: 'POST' }).then(json);
    },
    async resumeRun(runId) {
        return fetch(`/api/runs/${runId}/resume`, { method: 'POST' }).then(json);
    },
    async retestRun(runId) {
        return fetch(`/api/runs/${runId}/retest`, { method: 'POST', headers }).then(json);
    },

    // ── Defectos ──
    async createDefect(data) {
        return fetch('/api/defects', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateDefectStatus(id, status) {
        return fetch(`/api/defects/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }), headers }).then(json);
    },
    async getProjectDefects(projectId) {
        return fetch(`/api/defects?project_id=${projectId}`).then(json);
    },
    async assignDefect(id, userId) {
        return fetch(`/api/defects/${id}/assign`, { method: 'PUT', body: JSON.stringify({ assigned_to: userId }), headers }).then(json);
    },

    // ── Jira Integration ──
    async getJiraContext(projectId) {
        return fetch(`/api/jira/projects/${projectId}/context`).then(json);
    },
    async getJiraTracking(projectId) {
        return fetch(`/api/jira/projects/${projectId}/tracking`).then(json);
    },
    async getJiraDailyStats(projectId) {
        const res = await fetch(`/api/stats/jira-daily?project_id=${projectId}`);
        return await res.json();
    },

    async getJiraTeamProductivity(projectId) {
        const res = await fetch(`/api/stats/jira-productivity?project_id=${projectId}`);
        return await res.json();
    },
    async getJiraComments(projectId, issueKey) {
        return fetch(`/api/jira/issues/${issueKey}/comments?project_id=${projectId}`).then(json);
    },
    async getJiraEpicStats(projectId, epicKey, from, to) {
        const params = new URLSearchParams({ epicKey, from, to });
        const res = await fetch(`/api/jira/projects/${projectId}/epic-stats?${params}`);
        return await res.json();
    },
    async addJiraComment(projectId, issueKey, text, mentionId = null) {
        return fetch(`/api/jira/issues/${issueKey}/comments`, {
            method: 'POST',
            body: JSON.stringify({ project_id: projectId, text, mentionId }),
            headers
        }).then(json);
    },
    async createJiraBug(defectId, epicId, assigneeId, priorityId, customFields) {
        return fetch(`/api/jira/defects/${defectId}/create-ticket`, { 
            method: 'POST', 
            body: JSON.stringify({ epicId, assigneeId, priorityId, customFields }), 
            headers 
        }).then(json);
    },

    // ── Hallazgos QA ──
    async getHallazgos(projectId) {
        return fetch(`/api/hallazgos?project_id=${projectId}`).then(json);
    },
    async createHallazgo(data) {
        return fetch('/api/hallazgos', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateHallazgo(id, data) {
        return fetch(`/api/hallazgos/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteHallazgo(id) {
        return fetch(`/api/hallazgos/${id}`, { method: 'DELETE' }).then(json);
    },
    async updateHallazgoStatus(id, status) {
        return fetch(`/api/hallazgos/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }), headers }).then(json);
    },
    async assignHallazgo(id, userId) {
        return fetch(`/api/hallazgos/${id}/assign`, { method: 'PUT', body: JSON.stringify({ assigned_to: userId }), headers }).then(json);
    },
    async convertHallazgoToTC(id, suiteId) {
        return fetch(`/api/hallazgos/${id}/convert-to-tc`, { method: 'POST', body: JSON.stringify({ suite_id: suiteId }), headers }).then(json);
    },
    async createJiraFromHallazgo(id, epicId, assigneeId, priorityId, customFields) {
        return fetch(`/api/jira/hallazgos/${id}/create-ticket`, {
            method: 'POST',
            body: JSON.stringify({ epicId, assigneeId, priorityId, customFields }),
            headers
        }).then(json);
    },

    // ── Test Cases ──
    async createTestCase(data) {
        return fetch('/api/test-cases', { method: 'POST', body: JSON.stringify(data), headers }).then(json);
    },
    async updateTestCase(id, data) {
        return fetch(`/api/test-cases/${id}`, { method: 'PUT', body: JSON.stringify(data), headers }).then(json);
    },
    async deleteTestCase(id) {
        return fetch(`/api/test-cases/${id}`, { method: 'DELETE' }).then(json);
    },
    async moveTestCase(tcId, newSuiteId) {
        return fetch(`/api/test-cases/${tcId}/move`, { method: 'PUT', body: JSON.stringify({ new_suite_id: newSuiteId }), headers }).then(json);
    },
    async moveTestSuite(suiteId, newUseCaseId) {
        console.log(`[API] moveTestSuite called: suiteId=${suiteId}, newUseCaseId=${newUseCaseId}`);
        return fetch(`/api/test-suites/${suiteId}/move`, { method: 'PUT', body: JSON.stringify({ new_use_case_id: newUseCaseId }), headers }).then(json);
    },
    async assignTestSuiteTests(suiteId, userId) {
        return fetch(`/api/test-suites/${suiteId}/assign-all`, { method: 'PUT', body: JSON.stringify({ assigned_to: userId }), headers }).then(json);
    },

    // ── Legacy ──
    async saveIssue(formData) {
        return fetch('/api/issue', { method: 'POST', body: formData }).then(json);
    },
    async generateReport() {
        return fetch('/api/report', { method: 'POST' }).then(json);
    },
    async getJiraConfig(projectId) {
        return fetch(`/api/projects/${projectId}/jira-config`).then(json);
    },
    async saveJiraConfig(projectId, data) {
        return fetch(`/api/projects/${projectId}/jira-config`, { 
            method: 'POST', 
            body: JSON.stringify(data), 
            headers 
        }).then(json);
    },
    async getJiraUserConfig(projectId) {
        return fetch(`/api/projects/${projectId}/jira-user-config`).then(json);
    },
    async saveJiraUserConfig(projectId, data) {
        return fetch(`/api/projects/${projectId}/jira-user-config`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers
        }).then(json);
    },
    async deleteJiraUserConfig(projectId) {
        return fetch(`/api/projects/${projectId}/jira-user-config`, {
            method: 'DELETE',
            headers
        }).then(json);
    },
    async exportUseCaseMatrix(useCaseId) {
        window.location.href = `/api/use-cases/${useCaseId}/export-excel`;
    },
    async exportProjectMatrix(projectId) {
        window.location.href = `/api/projects/${projectId}/export-excel`;
    },

    async startAllCU(cuId) {
        return fetch(`/api/use-cases/${cuId}/start-all`, {
            method: 'POST',
            body: JSON.stringify({ execution_type: 'REGRESSION', only_assigned: true }),
            headers
        }).then(json);
    },
    async debugJiraTest(projectId, jql) {
        return fetch(`/api/debug/jira-test?projectId=${projectId}&jql=${encodeURIComponent(jql)}`).then(r => r.json());
    },
    async getMyJiraTickets(projectId, filter, maxResults = 50) {
        return fetch(`/api/jira/projects/${projectId}/my-tickets?filter=${filter}&maxResults=${maxResults}`).then(json);
    }
};
