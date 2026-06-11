const express = require('express');
const { asyncHandler } = require('../middleware/errors');
const { users } = require('../repositories');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    try {
        await users._base.ping();
        return res.status(200).json({
            status: 'ok',
            db: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        const isDev = (process.env.NODE_ENV || 'development') !== 'production';
        return res.status(503).json({
            status: 'error',
            db: 'unreachable',
            ...(isDev ? { detail: err.message } : {}),
        });
    }
}));

module.exports = router;
