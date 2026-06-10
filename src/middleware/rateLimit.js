const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos' }
});

if (config && config.TRUST_PROXY !== undefined) {
    globalLimiter.trustProxy = config.TRUST_PROXY;
    authLimiter.trustProxy = config.TRUST_PROXY;
}

module.exports = { globalLimiter, authLimiter };
