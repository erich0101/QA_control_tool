const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { UnauthorizedError } = require('../middleware/errors');

async function verifyCredentials(email, password) {
    const result = await query(`SELECT id, password_hash, name, role, perfil, email FROM qa_users WHERE email = $1`, [email]);
    if (result.rows.length === 0) throw new UnauthorizedError('Credenciales inválidas');
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Credenciales inválidas');
    return { id: user.id, name: user.name, role: user.role, perfil: user.perfil, email: user.email };
}

async function getUserPermissions(userId) {
    const result = await query(`SELECT * FROM qa_user_permissions WHERE user_id = $1`, [userId]);
    return result.rows[0] || {};
}

module.exports = { verifyCredentials, getUserPermissions };
