'use strict';
class ProjectRepository {
    constructor() {
        if (new.target === ProjectRepository) {
            throw new Error("ProjectRepository is abstract; cannot be instantiated directly");
        }
    }
    async listAll(exec) { throw new Error("not implemented"); }
    async listForUser(userId, exec) { throw new Error("not implemented"); }
    async findById(id, exec) { throw new Error("not implemented"); }
    async findFirstActive(exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async overviewSummary(projectId, exec) { throw new Error("not implemented"); }
    async overviewSummaryLegacy(projectId, exec) { throw new Error("not implemented"); }
}
module.exports = ProjectRepository;
