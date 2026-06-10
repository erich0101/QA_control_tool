'use strict';

const { Pool } = require('pg');
const config = require('../../config/env');
const logger = require('../../utils/logger');

const noIdTables = new Set([
    'qa_user_permissions',
    'qa_project_users',
    'qa_use_case_users',
    'qa_suite_users',
    'qa_project_sequences',
    'qa_tc_preconditions',
]);

function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

function addReturningIfInsert(sql) {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('INSERT') || trimmed.includes('RETURNING')) return sql;
    const tableMatch = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';
    if (noIdTables.has(tableName)) return sql;
    return sql.replace(/;?\s*$/, '') + ' RETURNING id';
}

function normalizeParams(params) {
    return params.map(p => {
        if (p instanceof Date) return p.toISOString();
        return p;
    });
}

function mapResult(res) {
    const rows = res.rows || [];
    const lastID = (rows.length > 0 && rows[0] && rows[0].id !== undefined && rows[0].id !== null)
        ? rows[0].id
        : null;
    return {
        rows,
        lastID,
        changes: res.rowCount !== undefined ? res.rowCount : rows.length,
    };
}

function buildPoolConfig() {
    const { DB } = config;
    const cfg = {
        host: DB.host,
        port: DB.port,
        user: DB.user,
        password: DB.password,
        database: DB.database,
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
        statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10),
    };
    if (DB.ssl) cfg.ssl = DB.ssl;
    return cfg;
}

function createPgDriver() {
    const pool = new Pool(buildPoolConfig());

    pool.on('error', (err) => {
        logger.error({ err }, 'pg pool error');
    });

    async function query(sql, params = []) {
        const finalSql = addReturningIfInsert(convertPlaceholders(sql));
        const finalParams = normalizeParams(params);
        const client = await pool.connect();
        try {
            const res = await client.query(finalSql, finalParams);
            return mapResult(res);
        } finally {
            client.release();
        }
    }

    async function getClient() {
        const client = await pool.connect();
        return {
            async query(sql, params = []) {
                const finalSql = addReturningIfInsert(convertPlaceholders(sql));
                const finalParams = normalizeParams(params);
                const res = await client.query(finalSql, finalParams);
                return mapResult(res);
            },
            release(err) {
                if (err) client.release(err);
                else client.release();
            },
            rawClient: client,
        };
    }

    async function withTransaction(fn) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
            throw err;
        } finally {
            client.release();
        }
    }

    async function end() {
        await pool.end();
    }

    async function ping() {
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            return true;
        } finally {
            client.release();
        }
    }

    return { driver: 'pg', query, getClient, withTransaction, end, ping };
}

module.exports = { createPgDriver };
