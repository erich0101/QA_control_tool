'use strict';
class UseCaseRepository {
    constructor() {
        if (new.target === UseCaseRepository) {
            throw new Error("UseCaseRepository is abstract; cannot be instantiated directly");
        }
    }
    async listByProject(projectId, exec) { throw new Error("not implemented"); }
    async listByProjectWithUSCount(projectId, exec) { throw new Error("not implemented"); }
    async findById(id, exec) { throw new Error("not implemented"); }
    async findByIdWithProject(id, exec) { throw new Error("not implemented"); }
    async findProjectId(ucId, exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async remove(id, exec) { throw new Error("not implemented"); }
    async coverageByProject(projectId, exec) { throw new Error("not implemented"); }
}
module.exports = UseCaseRepository;
