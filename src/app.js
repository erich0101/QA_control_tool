const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config/env');
const logger = require('./utils/logger');
const requestId = require('./middleware/requestId');
const logRequest = require('./middleware/logRequest');
const { globalLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRouter = require('./routes/health.routes');
const apiRouter = require('./routes');

const BASE_DIR = path.resolve(__dirname, '..');

function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(requestId);
    app.use(logRequest);

    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
    app.use(cors({
        origin: config.CORS_ORIGIN,
        credentials: true
    }));
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(cookieParser());

    app.use('/api/health', healthRouter);

    app.use('/api', globalLimiter);
    app.use('/api', apiRouter);

    app.use(express.static(path.join(BASE_DIR, 'public')));

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
