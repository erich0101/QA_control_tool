const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

/** Exige cookie `token` válida (httpOnly) y deja el payload en `req.user`. */
const requireAuth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

/** Roles con permisos de gestión (equivalente a `canManage` del frontend). */
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    next();
};

module.exports = { requireAuth, requireAdmin };
