const logger = require('../utils/logger');

module.exports = function logRequest(req, res, next) {
    const start = process.hrtime.bigint();
    const log = logger.child({ requestId: req.id });
    req.log = log;

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        log.info({
            method: req.method,
            url: req.originalUrl || req.url,
            status: res.statusCode,
            duration: Number(durationMs.toFixed(2)),
            userId: req.user && req.user.id ? req.user.id : null
        }, 'request completed');
    });

    next();
};
