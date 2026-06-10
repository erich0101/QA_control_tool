const jwt = require('jsonwebtoken');
const { JWT_SECRET, COOKIE } = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('./errors');
const { checkPermission } = require('../utils/keyGenerator');

const requireAuth = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return next(new UnauthorizedError('No autorizado'));
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        return next();
    } catch (err) {
        return next(new UnauthorizedError('Token inválido'));
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.role !== 'Admin') return next(new ForbiddenError('Permisos insuficientes'));
    return next();
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError('Permisos insuficientes'));
    return next();
};

const issueToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role, name: user.name, email: user.email, perfil: user.perfil || 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

const setAuthCookie = (res, token) => {
    res.cookie('token', token, {
        httpOnly: true,
        secure: COOKIE.secure,
        sameSite: COOKIE.sameSite,
        maxAge: COOKIE.maxAge,
    });
};

module.exports = {
    requireAuth,
    requireAdmin,
    requireRole,
    checkPermission,
    issueToken,
    setAuthCookie,
};
