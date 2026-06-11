const bcrypt = require('bcryptjs');
const { users } = require('../repositories');
const { UnauthorizedError } = require('../middleware/errors');

async function verifyCredentials(email, password) {
    const user = await users.findByEmail(email);
    if (!user) throw new UnauthorizedError('Credenciales inválidas');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Credenciales inválidas');
    return { id: user.id, name: user.name, role: user.role, perfil: user.perfil, email: user.email };
}

async function getUserPermissions(userId) {
    return users.permissions.getByUserId(userId);
}

module.exports = { verifyCredentials, getUserPermissions };
