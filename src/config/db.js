const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
    host: config.PG.host,
    port: config.PG.port,
    user: config.PG.user,
    password: config.PG.password,
    database: config.PG.database,
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
});

pool.on('error', (err) => {
    require('../utils/logger').error({ err }, 'PG pool error');
});

function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

const noIdTables = [
    'qa_user_permissions',
    'qa_project_users',
    'qa_use_case_users',
    'qa_suite_users',
    'qa_project_sequences',
    'qa_tc_preconditions',
];

function addReturningIfInsert(sql) {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('INSERT') || trimmed.includes('RETURNING')) return sql;
    const tableMatch = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';
    if (noIdTables.includes(tableName)) return sql;
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

async function query(sql, params = []) {
    const finalSql = addReturningIfInsert(convertPlaceholders(sql));
    const finalParams = normalizeParams(params);
    let client;
    try {
        client = await pool.connect();
        const res = await client.query(finalSql, finalParams);
        return mapResult(res);
    } finally {
        if (client) client.release();
    }
}

async function getClient() {
    const client = await pool.connect();
    const wrapper = {
        query: async (sql, params = []) => {
            const finalSql = addReturningIfInsert(convertPlaceholders(sql));
            const finalParams = normalizeParams(params);
            const res = await client.query(finalSql, finalParams);
            return mapResult(res);
        },
        release: () => client.release(),
    };
    return wrapper;
}

function setupRealtimeChannel(onChange) {
    return { unsubscribe: () => {} };
}

async function closePool() {
    try { await pool.end(); } catch (_) { /* ignore */ }
}

module.exports = { query, getClient, pool, setupRealtimeChannel, closePool };
