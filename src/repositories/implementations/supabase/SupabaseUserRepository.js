'use strict';

const { UserRepository, UserPermissionsRepository, ProjectUsersRepository } = require('../../contracts/UserRepository');
const { SupabaseBaseRepository } = require('./SupabaseBaseRepository');

class SupabaseUserRepository extends UserRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
        this.permissions = new SupabaseUserPermissionsRepository({ base: this._base });
        this.projectUsers = new SupabaseProjectUsersRepository({ base: this._base });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findById(id, exec) {
        const r = await this._query(`SELECT * FROM qa_users WHERE id = ?`, [id]);
        return r.rows[0] || null;
    }
    async findByEmail(email, exec) {
        const r = await this._query(
            `SELECT id, password_hash, name, role, perfil, email FROM qa_users WHERE email = ?`, [email]
        );
        return r.rows[0] || null;
    }
    async listWithPermissions(exec) {
        const r = await this._query(`
            SELECT u.id, u.email, u.name, u.role, u.perfil,
                   p.can_create_cu, p.can_create_hu, p.can_create_suite, p.can_create_test,
                   p.can_assign_cu, p.can_assign_hu, p.can_assign_suite, p.can_execute_test,
                   p.can_manage_projects, p.can_manage_users, p.can_configure_jira
            FROM qa_users u LEFT JOIN qa_user_permissions p ON u.id = p.user_id
            ORDER BY u.id`);
        return r.rows;
    }
    async create({ email, passwordHash, name, role, perfil }, exec) {
        const r = await this._query(
            `INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`,
            [email, passwordHash, name, role, perfil]
        );
        return r.lastID;
    }
    async update(id, { email, name, role, perfil }, exec) {
        await this._query(
            `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ? WHERE id = ?`,
            [email, name, role, perfil, id]
        );
    }
    async updateWithPassword(id, { email, name, role, perfil, passwordHash }, exec) {
        await this._query(
            `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ?, password_hash = ? WHERE id = ?`,
            [email, name, role, perfil, passwordHash, id]
        );
    }
}

class SupabaseUserPermissionsRepository extends UserPermissionsRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findByUserId(userId, exec) {
        const r = await this._query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [userId]);
        return r.rows[0] || {};
    }
    async getByUserId(userId, exec) {
        const r = await this._query(
            `SELECT can_create_cu, can_create_hu, can_create_suite, can_create_test,
                    can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test,
                    can_manage_projects, can_manage_users, can_configure_jira
             FROM qa_user_permissions WHERE user_id = ?`, [userId]
        );
        return r.rows[0] || {};
    }
    async create(userId, perms, exec) {
        await this._query(
            `INSERT INTO qa_user_permissions
             (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test,
              can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test,
              can_manage_projects, can_manage_users, can_configure_jira)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, ...perms]
        );
    }
    async updateByUserId(userId, perms, exec) {
        await this._query(
            `UPDATE qa_user_permissions
             SET can_create_cu=?, can_create_hu=?, can_create_suite=?, can_create_test=?,
                 can_assign_cu=?, can_assign_hu=?, can_assign_suite=?, can_execute_test=?,
                 can_manage_projects=?, can_manage_users=?, can_configure_jira=?
             WHERE user_id = ?`, [...perms, userId]
        );
    }
    async check(userId, permission, exec) {
        const ALLOWED = new Set(['can_create_cu','can_create_hu','can_create_suite','can_create_test','can_assign_cu','can_assign_hu','can_assign_suite','can_execute_test','can_manage_projects','can_manage_users','can_configure_jira']);
        if (!ALLOWED.has(permission)) return false;
        const r = await this._query(`SELECT ${permission} FROM qa_user_permissions WHERE user_id = ?`, [userId]);
        const v = r.rows[0]?.[permission];
        return v === true || v === 1;
    }
}

class SupabaseProjectUsersRepository extends ProjectUsersRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async listAll(exec) {
        const r = await this._query(`SELECT * FROM qa_project_users`);
        return r.rows;
    }
    async create(projectId, userId, exec) {
        await this._query(
            `INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
            [projectId, userId]
        );
    }
    async deleteByUserId(userId, exec) {
        await this._query(`DELETE FROM qa_project_users WHERE user_id = ?`, [userId]);
    }
}

module.exports = {
    SupabaseUserRepository,
    SupabaseUserPermissionsRepository,
    SupabaseProjectUsersRepository,
};
