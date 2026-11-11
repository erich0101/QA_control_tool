const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const users = await query(`
            SELECT u.id, u.email, u.name, u.role, u.perfil, p.can_create_cu, p.can_create_hu, p.can_create_suite, p.can_create_test, p.can_assign_cu, p.can_assign_hu, p.can_assign_suite, p.can_execute_test, p.can_manage_projects, p.can_manage_users, p.can_configure_jira
            FROM qa_users u 
            LEFT JOIN qa_user_permissions p ON u.id = p.user_id
        `);
        // Obtener proyectos asignados
        const projs = await query(`SELECT * FROM qa_project_users`);
        
        const usersWithProjs = users.rows.map(u => ({
            ...u,
            projects: projs.rows.filter(p => p.user_id === u.id).map(p => p.project_id)
        }));
        
        res.json({ users: usersWithProjs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, role, perfil, permissions, projects } = req.body;
        const hash = bcrypt.hashSync(password, 10);
        const result = await query(`INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`, [email, hash, name, role, perfil || 'user']);
        const userId = result.lastID;
        
        await query(`INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, !!permissions.can_create_cu, !!permissions.can_create_hu, !!permissions.can_create_suite, !!permissions.can_create_test, !!permissions.can_assign_cu, !!permissions.can_assign_hu, !!permissions.can_assign_suite, !!permissions.can_execute_test, !!permissions.can_manage_projects, !!permissions.can_manage_users, !!permissions.can_configure_jira]);
            
        if (projects && projects.length > 0) {
            for (let pid of projects) {
                await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
            }
        }
        
        res.json({ ok: true, id: userId });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, role, perfil, permissions, projects } = req.body;
        const userId = req.params.id;
        
        let updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ? WHERE id = ?`;
        let updateParams = [email, name, role, perfil || 'user', userId];
        
        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ?, password_hash = ? WHERE id = ?`;
            updateParams = [email, name, role, perfil || 'user', hash, userId];
        }
        
        await query(updateQuery, updateParams);
        
        await query(`INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET can_create_cu = EXCLUDED.can_create_cu, can_create_hu = EXCLUDED.can_create_hu, can_create_suite = EXCLUDED.can_create_suite, can_create_test = EXCLUDED.can_create_test, can_assign_cu = EXCLUDED.can_assign_cu, can_assign_hu = EXCLUDED.can_assign_hu, can_assign_suite = EXCLUDED.can_assign_suite, can_execute_test = EXCLUDED.can_execute_test, can_manage_projects = EXCLUDED.can_manage_projects, can_manage_users = EXCLUDED.can_manage_users, can_configure_jira = EXCLUDED.can_configure_jira`,
            [userId, !!permissions.can_create_cu, !!permissions.can_create_hu, !!permissions.can_create_suite, !!permissions.can_create_test, !!permissions.can_assign_cu, !!permissions.can_assign_hu, !!permissions.can_assign_suite, !!permissions.can_execute_test, !!permissions.can_manage_projects, !!permissions.can_manage_users, !!permissions.can_configure_jira]);
            
        await query(`DELETE FROM qa_project_users WHERE user_id = ?`, [userId]);
        if (projects && projects.length > 0) {
            for (let pid of projects) {
                await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
            }
        }
        res.json({ ok: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// Middleware global para proteger todas las rutas siguientes

module.exports = router;
