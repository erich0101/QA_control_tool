'use strict';
class TestSuiteRepository {
    constructor() {
        if (new.target === TestSuiteRepository) {
            throw new Error("TestSuiteRepository is abstract; cannot be instantiated directly");
        }
    }
    async create(data, exec) { throw new Error("not implemented"); }
    async createReturning(data, exec) { throw new Error("not implemented"); }
    async findById(id, exec) { throw new Error("not implemented"); }
    async findActiveRunId(suiteId, exec) { throw new Error("not implemented"); }
    async findProjectId(suiteId, exec) { throw new Error("not implemented"); }
    async findUseCaseId(suiteId, exec) { throw new Error("not implemented"); }
    async listByUseCase(useCaseId, exec) { throw new Error("not implemented"); }
    async listByProject(projectId, exec) { throw new Error("not implemented"); }
    async listAvailableForUC(useCaseId, exec) { throw new Error("not implemented"); }
    async listByStoryIds(storyIds, exec) { throw new Error("not implemented"); }
    async setActiveRun(suiteId, runId, exec) { throw new Error("not implemented"); }
    async clearActiveRun(suiteId, exec) { throw new Error("not implemented"); }
    async moveToUC(suiteId, newUseCaseId, updatedBy, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async statsByProject(projectId, exec) { throw new Error("not implemented"); }
    async statsByDurationByProject(projectId, exec) { throw new Error("not implemented"); }
}

class TestCaseRepository {
    constructor() {
        if (new.target === TestCaseRepository) {
            throw new Error("TestCaseRepository is abstract");
        }
    }
    async findById(id, exec) { throw new Error("not implemented"); }
    async findSlim(id, exec) { throw new Error("not implemented"); }
    async findSuiteId(id, exec) { throw new Error("not implemented"); }
    async findJiraEpicKey(id, exec) { throw new Error("not implemented"); }
    async listBySuiteIds(suiteIds, exec) { throw new Error("not implemented"); }
    async findEligibleForExecution(args, exec) { throw new Error("not implemented"); }
    async countLinkedToUS(suiteId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async createMinimal(data, exec) { throw new Error("not implemented"); }
    async updateTitle(id, title, exec) { throw new Error("not implemented"); }
    async updateTitleByScenario(scenarioId, title, exec) { throw new Error("not implemented"); }
    async setScenario(id, scenarioId, exec) { throw new Error("not implemented"); }
    async moveToSuite(id, newSuiteId, updatedBy, exec) { throw new Error("not implemented"); }
    async assignAllBySuite(suiteId, userId, exec) { throw new Error("not implemented"); }
    async updateDynamic(id, fields, exec) { throw new Error("not implemented"); }
    async updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async exportByUseCase(useCaseId, exec) { throw new Error("not implemented"); }
    async exportByProject(projectId, exec) { throw new Error("not implemented"); }
    async statusBreakdownByProject(projectId, exec) { throw new Error("not implemented"); }
}

class TestRunRepository {
    constructor() {
        if (new.target === TestRunRepository) {
            throw new Error("TestRunRepository is abstract");
        }
    }
    async create(data, exec) { throw new Error("not implemented"); }
    async createRetest(data, exec) { throw new Error("not implemented"); }
    async findActive(runId, exec) { throw new Error("not implemented"); }
    async findPaused(runId, exec) { throw new Error("not implemented"); }
    async findById(runId, exec) { throw new Error("not implemented"); }
    async findSuiteId(runId, exec) { throw new Error("not implemented"); }
    async listActiveByIds(runIds, exec) { throw new Error("not implemented"); }
    async listActiveByIdsWithStatuses(runIds, exec) { throw new Error("not implemented"); }
    async listFinishedByProject(projectId, exec) { throw new Error("not implemented"); }
    async pause(runId, accumulatedSeconds, exec) { throw new Error("not implemented"); }
    async resume(runId, exec) { throw new Error("not implemented"); }
    async finish(runId, accumulatedSeconds, exec) { throw new Error("not implemented"); }
}

class ExecutionRepository {
    constructor() {
        if (new.target === ExecutionRepository) {
            throw new Error("ExecutionRepository is abstract");
        }
    }
    async findByTcAndRun(tcId, runId, exec) { throw new Error("not implemented"); }
    async findLatestByTc(tcId, exec) { throw new Error("not implemented"); }
    async findStatusesByRunId(runId, exec) { throw new Error("not implemented"); }
    async findFailedTcIds(runId, exec) { throw new Error("not implemented"); }
    async findLatestBySuiteIds(suiteIds, exec) { throw new Error("not implemented"); }
    async listByRunIds(runIds, exec) { throw new Error("not implemented"); }
    async findLatestByRunIds(runIds, exec) { throw new Error("not implemented"); }
    async listByTcIds(tcIds, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async createMinimal(data, exec) { throw new Error("not implemented"); }
    async updateStatus(id, status, exec) { throw new Error("not implemented"); }
    async updateDynamic(id, fields, exec) { throw new Error("not implemented"); }
}

module.exports = { TestSuiteRepository, TestCaseRepository, TestRunRepository, ExecutionRepository };
