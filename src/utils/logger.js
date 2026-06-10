const pino = require('pino');
const config = require('../config/env');

const logger = pino({
    level: config.LOG_LEVEL,
    base: { service: 'qa-control-tool' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
});

module.exports = logger;
