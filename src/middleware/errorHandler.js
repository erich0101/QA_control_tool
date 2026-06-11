const { AppError } = require('./errors');

const MULTER_ERROR_MESSAGES = {
    LIMIT_FILE_SIZE: 'El archivo excede el tamaño máximo permitido',
    LIMIT_FILE_COUNT: 'Se enviaron demasiados archivos',
    LIMIT_FIELD_KEY: 'Nombre de campo demasiado largo',
    LIMIT_FIELD_VALUE: 'Valor de campo demasiado largo',
    LIMIT_FIELD_COUNT: 'Demasiados campos en el formulario',
    LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado',
    MISSING_FIELD_NAME: 'Falta el nombre del campo de archivo',
};

function describeMulterError(err) {
    const field = err.field ? ` (campo: ${err.field})` : '';
    const human = MULTER_ERROR_MESSAGES[err.code] || err.message || 'Error al procesar el archivo';
    return `${human}${field}`;
}

function describePayloadError(err) {
    if (err && err.type === 'entity.too.large') {
        return 'El cuerpo de la petición excede el tamaño máximo permitido';
    }
    if (err && err.type === 'entity.parse.failed') {
        return 'El cuerpo de la petición tiene un formato inválido';
    }
    if (err && err.type === 'encoding.unsupported') {
        return 'Codificación del cuerpo no soportada';
    }
    return null;
}

function describeJsonError(err) {
    if (err instanceof SyntaxError && 'body' in (err || {})) {
        return 'JSON inválido en el cuerpo de la petición';
    }
    return null;
}

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
        req.log?.warn({ err: { message: err.message, code: err.code, status: err.statusCode }, ...ctx }, 'AppError');
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code || undefined,
            details: err.details || undefined,
            requestId,
        });
    }

    const multerMsg = err && err.name === 'MulterError' ? describeMulterError(err) : null;
    if (multerMsg) {
        req.log?.warn({ err: { message: err.message, code: err.code }, ...ctx }, 'MulterError');
        return res.status(400).json({
            error: multerMsg,
            code: 'UPLOAD_ERROR',
            details: { field: err.field || null, multerCode: err.code || null },
            requestId,
        });
    }

    const jsonMsg = describeJsonError(err);
    if (jsonMsg) {
        req.log?.warn({ err: { message: err.message }, ...ctx }, 'JsonError');
        return res.status(400).json({
            error: jsonMsg,
            code: 'INVALID_JSON',
            requestId,
        });
    }

    const payloadMsg = describePayloadError(err);
    if (payloadMsg) {
        req.log?.warn({ err: { message: err.message, type: err.type }, ...ctx }, 'PayloadError');
        return res.status(413).json({
            error: payloadMsg,
            code: 'PAYLOAD_TOO_LARGE',
            requestId,
        });
    }

    req.log?.error({
        err: { message: err.message, stack: err.stack, name: err.name },
        ...ctx,
    }, 'Unhandled error');

    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({
        error: 'Error interno del servidor',
        code: 'INTERNAL_ERROR',
        hint: 'El servidor encontró un problema al procesar la solicitud. Reintentá o contactá al administrador con este requestId.',
        requestId,
        ...(isDev && { debug: { message: err.message, stack: err.stack, name: err.name } }),
    });
}

function notFoundHandler(req, res) {
    res.status(404).json({
        error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
        code: 'NOT_FOUND',
        requestId: req.id,
    });
}

module.exports = {
    errorHandler,
    notFoundHandler,
};
