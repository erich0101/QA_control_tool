'use strict';

const noIdTables = new Set([
    'qa_user_permissions', 'qa_project_users', 'qa_use_case_users',
    'qa_suite_users', 'qa_project_sequences', 'qa_tc_preconditions',
]);

function escapeLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return 'NULL';
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

function buildSql(sql, params) {
    let processed = sql;
    let i = 0;
    processed = processed.replace(/\?/g, () => escapeLiteral(params[i++]));

    const trimmed = processed.trim().toUpperCase();
    if (trimmed.startsWith('INSERT') && !trimmed.includes('RETURNING')) {
        const m = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
        const table = m ? m[1].toLowerCase() : '';
        if (!noIdTables.has(table)) {
            processed += ' RETURNING id';
        }
    }
    return processed;
}

function mapResult(data) {
    const rows = data.rows || [];
    return {
        rows,
        lastID: (Array.isArray(rows) && rows.length > 0 && rows[0]?.id !== undefined) ? rows[0].id : null,
        changes: data.rowCount !== undefined ? data.rowCount : rows.length,
    };
}

class SupabaseBaseRepository {
    constructor({ client } = {}) {
        if (!client) {
            throw new Error("SupabaseBaseRepository requires a Supabase client. Use getSupabaseClient() from config/supabase.");
        }
        this.client = client;
    }

    async _query(sql, params = []) {
        const finalSql = buildSql(sql, params);
        const { data, error } = await this.client.rpc('exec_query', { query_text: finalSql });
        if (error) throw new Error(error.message);
        if (data && data.error) {
            throw new Error(data.error + (data.detail ? ` (${data.detail})` : ''));
        }
        return mapResult(data || { rows: [], rowCount: 0 });
    }

    async _getClient() {
        const self = this;
        return {
            query: (sql, params) => self._query(sql, params),
            release: () => {},
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
        const r = await this._query('SELECT 1', []);
        return r.rows.length > 0;
    }

    async end() {
    }
}

module.exports = { SupabaseBaseRepository, escapeLiteral, buildSql, mapResult, noIdTables };
