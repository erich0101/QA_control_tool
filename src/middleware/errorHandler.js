const { AppError } = require('./errors');

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const requestId = req.id || '-';
    const ctx = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.id,
    };

    if (err instanceof AppError && err.isOperational) {
        req.log?.warn({ err: { message: err.message, code: err.code }, ...ctx }, 'AppError');
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code || undefined,
            details: err.details || undefined,
            requestId,
        });
    }

    req.log?.error({ err: { message: err.message, stack: err.stack }, ...ctx }, 'Unhandled error');

    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({
        error: 'Error interno del servidor',
        requestId,
        ...(isDev && { debug: { message: err.message, stack: err.stack } }),
    });
}

function notFoundHandler(req, res) {
    res.status(404).json({ error: 'Ruta no encontrada', requestId: req.id });
}

module.exports = { errorHandler, notFoundHandler };
