const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    const users = await query(`
        SELECT u.id, u.email, u.name, u.role, u.perfil, p.can_create_cu, p.can_create_hu, p.can_create_suite, p.can_create_test, p.can_assign_cu, p.can_assign_hu, p.can_assign_suite, p.can_execute_test, p.can_manage_projects, p.can_manage_users, p.can_configure_jira
        FROM qa_users u
        LEFT JOIN qa_user_permissions p ON u.id = p.user_id
    `);
    const projs = await query(`SELECT * FROM qa_project_users`);

    const usersWithProjs = users.rows.map(u => ({
        ...u,
        projects: projs.rows.filter(p => p.user_id === u.id).map(p => p.project_id)
    }));

    return res.json({ users: usersWithProjs });
};

exports.create = async (req, res) => {
    const { email, password, name, role, perfil, permissions, projects } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await query(`INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`, [email, hash, name, role, perfil || 'user']);
    const userId = result.lastID;

    await query(`INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, permissions.can_create_cu?1:0, permissions.can_create_hu?1:0, permissions.can_create_suite?1:0, permissions.can_create_test?1:0, permissions.can_assign_cu?1:0, permissions.can_assign_hu?1:0, permissions.can_assign_suite?1:0, permissions.can_execute_test?1:0, permissions.can_manage_projects?1:0, permissions.can_manage_users?1:0, permissions.can_configure_jira?1:0]);

    if (projects && projects.length > 0) {
        for (let pid of projects) {
            await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
        }
    }

    return created(res, { id: userId });
};

exports.update = async (req, res) => {
    const { email, password, name, role, perfil, permissions, projects } = req.body;
    const userId = req.params.id;

    let updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ? WHERE id = ?`;
    let updateParams = [email, name, role, perfil || 'user', userId];

    if (password) {
        const hash = await bcrypt.hash(password, 10);
        updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ?, password_hash = ? WHERE id = ?`;
        updateParams = [email, name, role, perfil || 'user', hash, userId];
    }

    await query(updateQuery, updateParams);

    await query(`UPDATE qa_user_permissions SET can_create_cu = ?, can_create_hu = ?, can_create_suite = ?, can_create_test = ?, can_assign_cu = ?, can_assign_hu = ?, can_assign_suite = ?, can_execute_test = ?, can_manage_projects = ?, can_manage_users = ?, can_configure_jira = ? WHERE user_id = ?`,
        [permissions.can_create_cu?1:0, permissions.can_create_hu?1:0, permissions.can_create_suite?1:0, permissions.can_create_test?1:0, permissions.can_assign_cu?1:0, permissions.can_assign_hu?1:0, permissions.can_assign_suite?1:0, permissions.can_execute_test?1:0, permissions.can_manage_projects?1:0, permissions.can_manage_users?1:0, permissions.can_configure_jira?1:0, userId]);

    await query(`DELETE FROM qa_project_users WHERE user_id = ?`, [userId]);
    if (projects && projects.length > 0) {
        for (let pid of projects) {
            await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
        }
    }
    return ok(res);
};
