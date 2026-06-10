const usersRepo = require('../repositories/users.repository');
const { ok } = require('../utils/responses');
const { issueToken, setAuthCookie } = require('../middleware/auth');
const authService = require('../services/auth.service');

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const user = await authService.verifyCredentials(email, password);
    const token = issueToken(user);
    setAuthCookie(res, token);
    return ok(res, { user: { id: user.id, name: user.name, role: user.role, perfil: user.perfil || 'user' } });
};

exports.me = async (req, res) => {
    const perms = await usersRepo.permissions.findByUserId(req.user.id);
    return res.json({ user: req.user, permissions: perms });
};

exports.logout = (req, res) => {
    res.clearCookie('token');
    return ok(res);
};
