const bcrypt = require('bcryptjs');
const { users } = require('../repositories');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    const userRows = await users.listWithPermissions();
    const projs = await users.projectUsers.listAll();

    const usersWithProjs = userRows.map(u => ({
        ...u,
        projects: projs.filter(p => p.user_id === u.id).map(p => p.project_id)
    }));

    return res.json({ users: usersWithProjs });
};

exports.create = async (req, res) => {
    const { email, password, name, role, perfil, permissions, projects } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const userId = await users.create({ email, passwordHash: hash, name, role, perfil: perfil || 'user' });

    await users.permissions.create(userId, [
        permissions.can_create_cu?1:0, permissions.can_create_hu?1:0, permissions.can_create_suite?1:0, permissions.can_create_test?1:0,
        permissions.can_assign_cu?1:0, permissions.can_assign_hu?1:0, permissions.can_assign_suite?1:0, permissions.can_execute_test?1:0,
        permissions.can_manage_projects?1:0, permissions.can_manage_users?1:0, permissions.can_configure_jira?1:0
    ]);

    if (projects && projects.length > 0) {
        for (let pid of projects) {
            await users.projectUsers.create(pid, userId);
        }
    }

    return created(res, { id: userId });
};

exports.update = async (req, res) => {
    const { email, password, name, role, perfil, permissions, projects } = req.body;
    const userId = req.params.id;

    if (password) {
        const hash = await bcrypt.hash(password, 10);
        await users.updateWithPassword(userId, { email, name, role, perfil: perfil || 'user', passwordHash: hash });
    } else {
        await users.update(userId, { email, name, role, perfil: perfil || 'user' });
    }

    await users.permissions.updateByUserId(userId, [
        permissions.can_create_cu?1:0, permissions.can_create_hu?1:0, permissions.can_create_suite?1:0, permissions.can_create_test?1:0,
        permissions.can_assign_cu?1:0, permissions.can_assign_hu?1:0, permissions.can_assign_suite?1:0, permissions.can_execute_test?1:0,
        permissions.can_manage_projects?1:0, permissions.can_manage_users?1:0, permissions.can_configure_jira?1:0
    ]);

    await users.projectUsers.deleteByUserId(userId);
    if (projects && projects.length > 0) {
        for (let pid of projects) {
            await users.projectUsers.create(pid, userId);
        }
    }
    return ok(res);
};
