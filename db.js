require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'db',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 10,
    idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de Postgres:', err);
});

function escapeLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
        if (isNaN(value)) return 'NULL';
        return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (Array.isArray(value)) {
        const elements = value.map(v => escapeLiteral(v)).join(',');
        return `ARRAY[${elements}]`;
    }
    if (value instanceof Date) return `'${value.toISOString()}'::timestamp`;
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

const noIdTables = [
    'qa_user_permissions',
    'qa_project_users',
    'qa_use_case_users',
    'qa_suite_users',
    'qa_project_sequences',
    'qa_tc_preconditions'
];

function buildSql(sql, params) {
    let processed = sql;
    let paramIndex = 0;
    processed = processed.replace(/\?/g, () => {
        const val = params[paramIndex++];
        return escapeLiteral(val);
    });

    const trimmed = processed.trim().toUpperCase();
    const isInsert = trimmed.startsWith('INSERT');
    if (isInsert && !trimmed.includes('RETURNING')) {
        const tableMatch = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
        const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';
        if (!noIdTables.includes(tableName)) {
            processed += ' RETURNING id';
        }
    }

    return processed;
}

function mapResult(res) {
    const rows = res.rows || [];
    const lastID = (rows.length > 0 && rows[0].id !== undefined && rows[0].id !== null)
        ? rows[0].id
        : null;
    return {
        rows: rows,
        lastID: lastID,
        changes: res.rowCount !== undefined ? res.rowCount : rows.length
    };
}

async function query(sql, params = []) {
    const finalSql = buildSql(sql, params);
    let client;
    try {
        client = await pool.connect();
        const res = await client.query(finalSql);
        return mapResult(res);
    } catch (err) {
        console.error('Error en ejecucion:', err.message);
        console.error('SQL fallido:', finalSql.substring(0, 500));
        throw err;
    } finally {
        if (client) client.release();
    }
}

async function getClient() {
    const client = await pool.connect();
    const wrapper = {
        query: async (sql, params = []) => {
            const finalSql = buildSql(sql, params);
            const res = await client.query(finalSql);
            return mapResult(res);
        },
        release: () => client.release()
    };
    return wrapper;
}

function setupRealtimeChannel(onChange) {
    console.log('Realtime: usando WebSocket directo (Postgres LISTEN/NOTIFY) - no soportado en este modo');
    return {
        unsubscribe: () => {}
    };
}

module.exports = { query, pool, getClient, setupRealtimeChannel };
