'use strict';

const db = require('../db');

function executor(tx) { return tx || db; }

async function listWithPermissions(exec) {
    const e = executor(exec);
    const r = await e.query(`
        SELECT u.id, u.email, u.name, u.role, u.perfil, p.can_create_cu, p.can_create_hu,
               p.can_create_suite, p.can_create_test, p.can_assign_cu, p.can_assign_hu,
               p.can_assign_suite, p.can_execute_test, p.can_manage_projects, p.can_manage_users,
               p.can_configure_jira
        FROM qa_users u
        LEFT JOIN qa_user_permissions p ON u.id = p.user_id
        ORDER BY u.id
    `);
    return r.rows;
}

async function findById(id, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_users WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function findByEmail(email, exec) {
    const r = await executor(exec).query(
        `SELECT id, password_hash, name, role, perfil, email FROM qa_users WHERE email = ?`, [email]
    );
    return r.rows[0] || null;
}

async function create({ email, passwordHash, name, role, perfil }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`,
        [email, passwordHash, name, role, perfil]
    );
    return r.lastID;
}

async function update(id, { email, name, role, perfil }, exec) {
    await executor(exec).query(
        `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ? WHERE id = ?`,
        [email, name, role, perfil, id]
    );
}

async function updateWithPassword(id, { email, name, role, perfil, passwordHash }, exec) {
    await executor(exec).query(
        `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ?, password_hash = ? WHERE id = ?`,
        [email, name, role, perfil, passwordHash, id]
    );
}

const permissions = {
    async findByUserId(userId, exec) {
        const r = await executor(exec).query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [userId]);
        return r.rows[0] || {};
    },
    async getByUserId(userId, exec) {
        const r = await executor(exec).query(
            `SELECT can_create_cu, can_create_hu, can_create_suite, can_create_test,
                    can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test,
                    can_manage_projects, can_manage_users, can_configure_jira
             FROM qa_user_permissions WHERE user_id = ?`, [userId]
        );
        return r.rows[0] || {};
    },
    async create(userId, perms, exec) {
        await executor(exec).query(
            `INSERT INTO qa_user_permissions
             (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test,
              can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test,
              can_manage_projects, can_manage_users, can_configure_jira)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, ...perms]
        );
    },
    async updateByUserId(userId, perms, exec) {
        await executor(exec).query(
            `UPDATE qa_user_permissions
             SET can_create_cu = ?, can_create_hu = ?, can_create_suite = ?, can_create_test = ?,
                 can_assign_cu = ?, can_assign_hu = ?, can_assign_suite = ?, can_execute_test = ?,
                 can_manage_projects = ?, can_manage_users = ?, can_configure_jira = ?
             WHERE user_id = ?`,
            [...perms, userId]
        );
    },
    async check(userId, permission, exec) {
        const ALLOWED = new Set([
            'can_create_cu', 'can_create_hu', 'can_create_suite', 'can_create_test',
            'can_assign_cu', 'can_assign_hu', 'can_assign_suite', 'can_execute_test',
            'can_manage_projects', 'can_manage_users', 'can_configure_jira'
        ]);
        if (!ALLOWED.has(permission)) return false;
        const r = await executor(exec).query(
            `SELECT ${permission} FROM qa_user_permissions WHERE user_id = ?`, [userId]
        );
        const v = r.rows[0]?.[permission];
        return v === true || v === 1;
    }
};

const projectUsers = {
    async listAll(exec) {
        const r = await executor(exec).query(`SELECT * FROM qa_project_users`);
        return r.rows;
    },
    async create(projectId, userId, exec) {
        await executor(exec).query(
            `INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)
             ON CONFLICT (project_id, user_id) DO NOTHING`,
            [projectId, userId]
        );
    },
    async deleteByUserId(userId, exec) {
        await executor(exec).query(`DELETE FROM qa_project_users WHERE user_id = ?`, [userId]);
    }
};

module.exports = { listWithPermissions, findById, findByEmail, create, update, updateWithPassword, permissions, projectUsers };
