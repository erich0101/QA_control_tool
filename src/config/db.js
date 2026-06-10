'use strict';

const db = require('../db');

const {
    query,
    getClient,
    withTransaction,
    end,
    ping,
} = db;

function closePool() {
    return end();
}

function setupRealtimeChannel() {
    return { unsubscribe: () => {} };
}

module.exports = {
    query,
    getClient,
    withTransaction,
    end,
    closePool,
    setupRealtimeChannel,
    ping,
    pool: null,
    driver: db.driver,
};
