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
    if (Buffer.isBuffer(value)) {
        return `decode('${value.toString('hex')}', 'hex')`;
    }
    if (value instanceof Uint8Array) {
        return `decode('${Buffer.from(value).toString('hex')}', 'hex')`;
    }
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

const SQLSTATE_HINTS = {
    '22P02': 'validation',
    '23502': 'validation',
    '23503': 'conflict',
    '23505': 'conflict',
    '23514': 'validation',
    '40P01': 'transient',
    '40001': 'transient',
    '57014': 'timeout',
    '53300': 'capacity',
    '08000': 'connection',
    '08003': 'connection',
    '08006': 'connection',
};

function mapSqlStateToHint(sqlstate, message) {
    if (sqlstate && SQLSTATE_HINTS[sqlstate]) return SQLSTATE_HINTS[sqlstate];
    const m = String(message || '').toLowerCase();
    if (m.includes('timeout') || m.includes('canceling statement')) return 'timeout';
    if (m.includes('connection') || m.includes('econnrefused')) return 'connection';
    if (m.includes('permission denied')) return 'permission';
    if (m.includes('bytea') || m.includes('invalid input syntax')) return 'validation';
    if (m.includes('duplicate') || m.includes('unique')) return 'conflict';
    if (m.includes('foreign key')) return 'conflict';
    if (m.includes('not null') || m.includes('check constraint')) return 'validation';
    return 'database';
}

function mapSqlStateToMessage(sqlstate, message) {
    if (!message) return null;
    const m = String(message).toLowerCase();
    if (sqlstate === '23505' || m.includes('duplicate') || m.includes('unique constraint')) {
        return 'Ya existe un registro con esos datos únicos';
    }
    if (sqlstate === '23503' || m.includes('foreign key')) {
        return 'La referencia a otro registro no es válida';
    }
    if (sqlstate === '23502' || m.includes('not-null') || m.includes('not null')) {
        return 'Faltan datos obligatorios para guardar el registro';
    }
    if (sqlstate === '23514' || m.includes('check constraint')) {
        return 'Algún valor no cumple las reglas de validación';
    }
    if (sqlstate === '22P02' || m.includes('invalid input syntax')) {
        return 'Uno de los valores enviados tiene un formato inválido';
    }
    if (sqlstate === '57014' || m.includes('timeout')) {
        return 'La base de datos tardó demasiado en responder';
    }
    if (sqlstate === '53300') {
        return 'La base de datos está saturada, reintentá en unos segundos';
    }
    if (m.includes('connection')) {
        return 'No se pudo conectar con la base de datos';
    }
    if (m.includes('permission denied')) {
        return 'La base de datos rechazó la operación por permisos';
    }
    return null;
}

class SupabaseBaseRepository {
    constructor({ client } = {}) {
        if (!client) {
            throw new Error("SupabaseBaseRepository requires a Supabase client. Use getSupabaseClient() from config/supabase.");
        }
        this.client = client;
    }

    _wrapDbError(err, sql) {
        const { AppError } = require('../../../middleware/errors');
        const message = (err && err.message) || 'Database error';
        const detail = (err && err.detail) || null;
        const sqlstate = (err && (err.code || err.sqlState)) || null;

        const hint = mapSqlStateToHint(sqlstate, message);
        const safeMessage = mapSqlStateToMessage(sqlstate, message) || 'No se pudo completar la operación en la base de datos';

        const wrapped = new AppError(safeMessage, 500, 'DATABASE_ERROR', { hint });
        wrapped.cause = err;
        wrapped.dbSqlState = sqlstate;
        wrapped.dbDetail = detail;
        wrapped.dbQuery = sql;
        return wrapped;
    }

    async _query(sql, params = []) {
        let finalSql;
        try {
            finalSql = buildSql(sql, params);
        } catch (buildErr) {
            throw this._wrapDbError(buildErr, sql);
        }
        const { data, error } = await this.client.rpc('exec_query', { query_text: finalSql });
        if (error) {
            throw this._wrapDbError({ message: error.message, code: error.code }, finalSql);
        }
        if (data && data.error) {
            throw this._wrapDbError({ message: data.error, detail: data.detail, code: data.detail }, finalSql);
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

module.exports = {
    SupabaseBaseRepository,
    escapeLiteral,
    buildSql,
    mapResult,
    mapSqlStateToHint,
    mapSqlStateToMessage,
    noIdTables,
};
