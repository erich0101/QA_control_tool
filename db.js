require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en .env');
    process.exit(1);
}

const noKeepAliveFetch = (url, options = {}) => {
    return fetch(url, { ...options, keepalive: false });
};

const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: noKeepAliveFetch }
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
    if (Buffer.isBuffer(value)) {
        return `'\\x${value.toString('hex')}'::bytea`;
    }
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
    'qa_tc_preconditions',
    'qa_jira_configs'
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

function mapResult(data) {
    const rows = Array.isArray(data) ? data : (data?.rows || []);
    const lastID = (Array.isArray(rows) && rows.length > 0 && rows[0].id !== undefined)
        ? rows[0].id
        : null;
    return {
        rows: rows,
        lastID: lastID,
        changes: data?.rowCount !== undefined ? data.rowCount : rows.length
    };
}

async function query(sql, params = []) {
    const finalSql = buildSql(sql, params);
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
            const { data, error } = await supabase.rpc('exec_query', { query_text: finalSql }, { signal: controller.signal });

            if (error) throw new Error(error.message);
            if (data && data.error) {
                const err = new Error(data.error + (data.detail ? ' (' + data.detail + ')' : '') + (data.code ? ' [code ' + data.code + ']' : ''));
                err.sqlState = data.code;
                throw err;
            }

            clearTimeout(timer);
            return mapResult(data || { rows: [], rowCount: 0 });
        } catch (err) {
            clearTimeout(timer);
            const isTransientFetch = err && err.name === 'TypeError' && /fetch failed/i.test(err.message);
            if (isTransientFetch && attempt < MAX_ATTEMPTS) {
                console.warn(`query: fetch failed, retrying (${attempt}/${MAX_ATTEMPTS})`);
                continue;
            }
            console.error('Error en ejecucion:', err.message);
            console.error('SQL fallido:', finalSql.substring(0, 500));
            throw err;
        }
    }
}

async function getClient() {
    return {
        query: async (sql, params = []) => {
            return query(sql, params);
        },
        release: () => {}
    };
}

function setupRealtimeChannel(onChange) {
    const channel = supabase
        .channel('db-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public' },
            (payload) => {
                const mapped = {
                    table: payload.table,
                    action: payload.eventType,
                    data: payload.new
                };
                onChange(mapped);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime: suscrito a cambios de base de datos via Supabase');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('Error en canal Realtime de Supabase');
            }
        });

    return channel;
}

module.exports = { query, supabase, getClient, setupRealtimeChannel };
