'use strict';

const { createPgDriver } = require('./drivers/pg');

function createDb() {
    return createPgDriver();
}

const instance = createDb();

module.exports = instance;
module.exports.createDb = createDb;
