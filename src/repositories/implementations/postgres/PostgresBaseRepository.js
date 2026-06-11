'use strict';

const { Pool } = require('pg');
const config = require('../../../config/env');

const noIdTables = new Set([
    'qa_user_permissions', 'qa_project_users', 'qa_use_case_users',
    'qa_suite_users', 'qa_project_sequences', 'qa_tc_preconditions',
]);

function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

function addReturning(sql, noIdSet) {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('INSERT') || trimmed.includes('RETURNING')) return sql;
    const m = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
    const table = m ? m[1].toLowerCase() : '';
    if (noIdSet.has(table)) return sql;
    return sql.replace(/;?\s*$/, '') + ' RETURNING id';
}

function normalizeParams(params) {
    return params.map(p => p instanceof Date ? p.toISOString() : p);
}

function mapResult(res) {
    const rows = res.rows || [];
    return {
        rows,
        lastID: (rows.length > 0 && rows[0] && rows[0].id != null) ? rows[0].id : null,
        changes: res.rowCount !== undefined ? res.rowCount : rows.length,
    };
}

function createPool() {
    return new Pool({
        host: config.DB.host,
        port: config.DB.port,
        user: config.DB.user,
        password: config.DB.password,
        database: config.DB.database,
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10),
        ssl: config.DB.ssl,
    });
}

class PostgresBaseRepository {
    constructor({ pool, noIdSet } = {}) {
        this.pool = pool || createPool();
        this.noIdTables = noIdSet || noIdTables;
        this.pool.on('error', (err) => {
            require('../../../utils/logger').error({ err }, 'pg pool error');
        });
    }

    async _query(sql, params = []) {
        const finalSql = addReturning(convertPlaceholders(sql), this.noIdTables);
        const res = await this.pool.query(finalSql, normalizeParams(params));
        return mapResult(res);
    }

    async _getClient() {
        const client = await this.pool.connect();
        const self = this;
        return {
            async query(sql, params = []) {
                const finalSql = addReturning(convertPlaceholders(sql), self.noIdTables);
                const res = await client.query(finalSql, normalizeParams(params));
                return mapResult(res);
            },
            release: (err) => err ? client.release(err) : client.release(),
        };
    }

    async _withTransaction(fn) {
        const client = await this._getClient();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch (_) { }
            throw err;
        } finally {
            client.release();
        }
    }

    async ping() {
        const c = await this.pool.connect();
        try { await c.query('SELECT 1'); return true; } finally { c.release(); }
    }

    async end() { await this.pool.end(); }
}

module.exports = { PostgresBaseRepository, createPool, noIdTables, convertPlaceholders, addReturning, normalizeParams, mapResult };
