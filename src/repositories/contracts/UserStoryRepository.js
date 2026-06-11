'use strict';
class UserStoryRepository {
    constructor() {
        if (new.target === UserStoryRepository) {
            throw new Error("UserStoryRepository is abstract; cannot be instantiated directly");
        }
    }
    async listByUseCaseIds(useCaseIds, exec) { throw new Error("not implemented"); }
    async listByUseCase(useCaseId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async upsertReturning(data, exec) { throw new Error("not implemented"); }
    async setEscenariosPrueba(id, text, exec) { throw new Error("not implemented"); }
    async appendEscenario(id, escenario, exec) { throw new Error("not implemented"); }
    async updateRecommendations(id, recommendations, exec) { throw new Error("not implemented"); }
    async updateDynamic(id, fields, exec) { throw new Error("not implemented"); }
    async updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
}

class ScenarioRepository {
    constructor() {
        if (new.target === ScenarioRepository) {
            throw new Error("ScenarioRepository is abstract");
        }
    }
    async create(data, exec) { throw new Error("not implemented"); }
    async createReturning(data, exec) { throw new Error("not implemented"); }
    async createNextForUS(usId, title, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async updateTitle(id, title, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
}

class InconsistenciaRepository {
    constructor() {
        if (new.target === InconsistenciaRepository) {
            throw new Error("InconsistenciaRepository is abstract");
        }
    }
    async create(data, exec) { throw new Error("not implemented"); }
    async createForUS(usId, title, exec) { throw new Error("not implemented"); }
    async listBySuiteIds(suiteIds, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async deleteBySuiteId(suiteId, exec) { throw new Error("not implemented"); }
}

module.exports = { UserStoryRepository, ScenarioRepository, InconsistenciaRepository };
