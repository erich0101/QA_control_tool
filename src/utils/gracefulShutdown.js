const logger = require('./logger');
const { closePool } = require('../config/db');

function attachGracefulShutdown(server) {
    const shutdown = async (signal) => {
        logger.info({ signal }, 'shutting down gracefully');
        server.close(async () => {
            try {
                await closePool();
                logger.info('pg pool drained');
            } catch (e) {
                logger.error({ err: e }, 'pool.end error');
            }
            process.exit(0);
        });
        setTimeout(() => {
            logger.error('force exit after 10s');
            process.exit(1);
        }, 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
        logger.fatal({ err: { message: err.message, stack: err.stack } }, 'uncaughtException');
        shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        logger.fatal({ err: { reason: String(reason) } }, 'unhandledRejection');
        shutdown('unhandledRejection');
    });
}

module.exports = { attachGracefulShutdown };
