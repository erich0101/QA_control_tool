const pino = require('pino');
const config = require('../config/env');
const { stream: ringStream } = require('./logBuffer');

const logger = pino({
    level: config.LOG_LEVEL,
    base: { service: 'qa-control-tool' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
}, pino.multistream([
    { stream: process.stdout },
    { stream: ringStream, level: 'info' },
]));

module.exports = logger;
