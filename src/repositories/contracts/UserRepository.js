'use strict';

class UserRepository {
    constructor() {
        if (new.target === UserRepository) {
            throw new Error("UserRepository is abstract; cannot be instantiated directly");
        }
    }
    async findById(id, exec) { throw new Error("not implemented"); }
    async findByEmail(email, exec) { throw new Error("not implemented"); }
    async listWithPermissions(exec) { throw new Error("not implemented"); }
    async create(data, exec) { throw new Error("not implemented"); }
    async update(id, data, exec) { throw new Error("not implemented"); }
    async updateWithPassword(id, data, exec) { throw new Error("not implemented"); }
}

class UserPermissionsRepository {
    constructor() {
        if (new.target === UserPermissionsRepository) {
            throw new Error("UserPermissionsRepository is abstract");
        }
    }
    async findByUserId(userId, exec) { throw new Error("not implemented"); }
    async getByUserId(userId, exec) { throw new Error("not implemented"); }
    async create(userId, perms, exec) { throw new Error("not implemented"); }
    async updateByUserId(userId, perms, exec) { throw new Error("not implemented"); }
    async check(userId, permission, exec) { throw new Error("not implemented"); }
}

class ProjectUsersRepository {
    constructor() {
        if (new.target === ProjectUsersRepository) {
            throw new Error("ProjectUsersRepository is abstract");
        }
    }
    async listAll(exec) { throw new Error("not implemented"); }
    async create(projectId, userId, exec) { throw new Error("not implemented"); }
    async deleteByUserId(userId, exec) { throw new Error("not implemented"); }
}

module.exports = { UserRepository, UserPermissionsRepository, ProjectUsersRepository };
