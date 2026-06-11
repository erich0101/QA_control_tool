'use strict';
class AttachmentRepository {
    constructor() {
        if (new.target === AttachmentRepository) {
            throw new Error("AttachmentRepository is abstract; cannot be instantiated directly");
        }
    }
    async findBinary(id, exec) { throw new Error("not implemented"); }
    async findBinaryAsBase64(id, exec) { throw new Error("not implemented"); }
    async listByExecutionIds(execIds, exec) { throw new Error("not implemented"); }
    async listByExecution(executionId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async createWithDefect(data, exec) { throw new Error("not implemented"); }
    async deleteByExecutionAndCategory(executionId, category, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
}

class DefectRepository {
    constructor() {
        if (new.target === DefectRepository) {
            throw new Error("DefectRepository is abstract");
        }
    }
    async listByProject(projectId, exec) { throw new Error("not implemented"); }
    async findByExecutionAndTitle(executionId, title, exec) { throw new Error("not implemented"); }
    async findEpicKeyByExecution(executionId, exec) { throw new Error("not implemented"); }
    async findTrackedByProject(projectId, exec) { throw new Error("not implemented"); }
    async findDetailById(id, exec) { throw new Error("not implemented"); }
    async setJiraLink(id, data, exec) { throw new Error("not implemented"); }
    async listByExecutionIds(executionIds, exec) { throw new Error("not implemented"); }
    async listByRunId(runId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async updateStatus(id, status, exec) { throw new Error("not implemented"); }
    async assign(id, userId, exec) { throw new Error("not implemented"); }
    async listHallazgosByProject(projectId, exec) { throw new Error("not implemented"); }
    async update(id, fields, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async convertToTC(hallazgoId, suiteId, userId, generateKeyFn, exec) { throw new Error("not implemented"); }
    async listEvidence(hallazgoId, exec) { throw new Error("not implemented"); }
    async linkToJiraTicket(hallazgoId, jiraData, exec) { throw new Error("not implemented"); }
    async findHallazgoById(id, exec) { throw new Error("not implemented"); }
}

class PreconditionRepository {
    constructor() {
        if (new.target === PreconditionRepository) {
            throw new Error("PreconditionRepository is abstract");
        }
    }
    async listLinkedByUS(usId, exec) { throw new Error("not implemented"); }
    async listAll(exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
}

class TcPreconditionsRepository {
    constructor() {
        if (new.target === TcPreconditionsRepository) {
            throw new Error("TcPreconditionsRepository is abstract");
        }
    }
    async link(tcId, prcId, exec) { throw new Error("not implemented"); }
}

class ProjectSequenceRepository {
    constructor() {
        if (new.target === ProjectSequenceRepository) {
            throw new Error("ProjectSequenceRepository is abstract");
        }
    }
    async increment(projectId, prefix, exec) { throw new Error("not implemented"); }
    async incrementBy(projectId, prefix, count, exec) { throw new Error("not implemented"); }
}

class JiraConfigsRepository {
    constructor() {
        if (new.target === JiraConfigsRepository) {
            throw new Error("JiraConfigsRepository is abstract");
        }
    }
    async findByProjectId(projectId, exec) { throw new Error("not implemented"); }
    async existsForProject(projectId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async updateByProject(data, exec) { throw new Error("not implemented"); }
}

class JiraUserConfigsRepository {
    constructor() {
        if (new.target === JiraUserConfigsRepository) {
            throw new Error("JiraUserConfigsRepository is abstract");
        }
    }
    async findByProjectAndUser(projectId, userId, exec) { throw new Error("not implemented"); }
    async existsForProjectAndUser(projectId, userId, exec) { throw new Error("not implemented"); }
    async findEmailByProjectAndUser(projectId, userId, exec) { throw new Error("not implemented"); }
    async findTokenByProjectAndUser(projectId, userId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async updateByProjectAndUser(data, exec) { throw new Error("not implemented"); }
    async deleteByProjectAndUser(projectId, userId, exec) { throw new Error("not implemented"); }
}

module.exports = {
    AttachmentRepository,
    DefectRepository,
    PreconditionRepository,
    TcPreconditionsRepository,
    ProjectSequenceRepository,
    JiraConfigsRepository,
    JiraUserConfigsRepository,
};
