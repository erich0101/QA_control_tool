const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    try {
        await query('SELECT 1');
        return res.status(200).json({
            status: 'ok',
            db: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        const isDev = (process.env.NODE_ENV || 'development') !== 'production';
        return res.status(503).json({
            status: 'error',
            db: 'unreachable',
            ...(isDev ? { detail: err.message } : {})
        });
    }
}));

module.exports = router;
