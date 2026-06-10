'use strict';

const config = require('../config/env');
const { createPgDriver } = require('./drivers/pg');

function createDb() {
    const driverName = (config.DB_DRIVER || 'pg').toLowerCase();
    switch (driverName) {
        case 'pg':
        case 'postgres':
        case 'postgresql':
            return createPgDriver();
        case 'memory':
        case 'mock':
            const { createMemoryDriver } = require('./drivers/memory');
            return createMemoryDriver();
        default:
            throw new Error(`[db] Driver desconocido: ${driverName}. Usar 'pg' o 'memory'.`);
    }
}

const instance = createDb();

module.exports = instance;
module.exports.createDb = createDb;
