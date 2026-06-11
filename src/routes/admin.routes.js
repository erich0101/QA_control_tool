const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errors');
const { ok } = require('../utils/responses');
const { getRingBuffer } = require('../utils/logBuffer');
const logger = require('../utils/logger');

router.get('/logs/:requestId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    if (!requestId || requestId.length < 4) {
        throw new ValidationError('requestId inválido');
    }
    const entries = getRingBuffer().getByRequestId(requestId);
    if (entries.length === 0) {
        throw new NotFoundError(`No se encontraron logs para el requestId ${requestId}`);
    }
    logger.info({ requestId, count: entries.length, userId: req.user.id }, 'admin looked up logs');
    return ok(res, { requestId, count: entries.length, entries });
}));

router.get('/logs', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const entries = getRingBuffer().recent(limit);
    return ok(res, { limit, count: entries.length, entries });
}));

module.exports = router;
