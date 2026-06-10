'use strict';

function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

function addReturningIfInsert(sql) {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('INSERT') || trimmed.includes('RETURNING')) return sql;
    return sql.replace(/;?\s*$/, '') + ' RETURNING id';
}

function makeResult(rows) {
    return {
        rows,
        lastID: rows[0]?.id ?? null,
        changes: rows.length,
    };
}

function createMemoryDriver({ seed = [] } = {}) {
    const tables = {};
    const sequences = {};
    let nextId = 1000;

    function ensureTable(name) {
        if (!tables[name]) tables[name] = [];
        if (!sequences[name]) sequences[name] = nextId++;
        return tables[name];
    }

    function execSelect(sql, params) {
        const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (!fromMatch) return [];
        const table = fromMatch[1].toLowerCase();
        const rows = tables[table] || [];

        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER BY|\s+GROUP BY|\s+LIMIT|\s+OFFSET|$)/i);
        let filtered = rows;
        if (whereMatch) {
            filtered = applyWhere(rows, whereMatch[1].trim(), params, tables);
        }

        if (/DISTINCT\s+ON/i.test(sql)) {
            const distinctKeyMatch = sql.match(/DISTINCT\s+ON\s*\(\s*([a-zA-Z0-9_,\s]+)\s*\)/i);
            if (distinctKeyMatch) {
                const keys = distinctKeyMatch[1].split(',').map(k => k.trim());
                const orderMatch = sql.match(/ORDER\s+BY\s+([\s\S]+)$/i);
                const orderCols = orderMatch ? orderMatch[1].split(',').map(s => s.trim()) : [];
                const seen = new Set();
                filtered = orderCols.length > 0 ? sortRows(filtered, orderCols) : filtered;
                filtered = filtered.filter(r => {
                    const k = keys.map(x => r[x]).join('|');
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            }
        } else if (/ORDER BY/i.test(sql)) {
            const orderMatch = sql.match(/ORDER\s+BY\s+([\s\S]+?)(?:\s+LIMIT|\s+OFFSET|$)/i);
            if (orderMatch) {
                filtered = sortRows(filtered, orderMatch[1].split(',').map(s => s.trim()));
            }
        }

        if (/COUNT\s*\(\s*\*\s*\)/i.test(sql)) {
            return [{ cnt: filtered.length, count: filtered.length }];
        }

        const limitMatch = sql.match(/LIMIT\s+(\?|\d+)/i);
        if (limitMatch) {
            const v = limitMatch[1] === '?' ? Number(params.shift()) : parseInt(limitMatch[1], 10);
            filtered = filtered.slice(0, v);
        }

        return filtered;
    }

    function applyWhere(rows, expr, params, tables) {
        const conds = splitAnds(expr);
        return rows.filter(r => {
            for (const cond of conds) {
                if (!evalCond(r, cond, params, tables)) return false;
            }
            return true;
        });
    }

    function splitAnds(expr) {
        const out = [];
        let depth = 0, buf = '';
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (c === '(') depth++;
            if (c === ')') depth--;
            if (c === ' ' && depth === 0 && expr.substr(i, 5).toUpperCase() === ' AND ') {
                out.push(buf.trim());
                buf = '';
                i += 4;
                continue;
            }
            buf += c;
        }
        if (buf.trim()) out.push(buf.trim());
        return out;
    }

    function evalCond(row, cond, params, tables) {
        cond = cond.trim().replace(/;$/, '');
        const anyMatch = cond.match(/([a-zA-Z0-9_.]+)\s*=\s*ANY\s*\(\s*(\?|\$[0-9]+)\s*::\s*int\[\]\s*\)/i);
        if (anyMatch) {
            const col = anyMatch[1].split('.').pop();
            const list = Array.isArray(params[0]) ? params.shift() : [];
            return list.includes(row[col]);
        }
        const inMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IN\s*\(\s*SELECT[^)]+\)/i);
        if (inMatch) {
            const col = inMatch[1].split('.').pop();
            const subMatch = cond.match(/SELECT\s+([a-zA-Z0-9_.]+)\s+FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+([a-zA-Z0-9_.]+)\s*=\s*ANY/i);
            if (subMatch) {
                const subTable = subMatch[2].toLowerCase();
                const subCol = subMatch[3].split('.').pop();
                const list = Array.isArray(params[0]) ? params.shift() : [];
                const subRows = (tables[subTable] || []).filter(r => list.includes(r[subCol]));
                return subRows.some(sr => sr.id !== undefined && row[col] === sr.id || row[col] === sr[subMatch[1].split('.').pop()]);
            }
        }
        const statusInMatch = cond.match(/status\s+IN\s*\(([^)]+)\)/i);
        if (statusInMatch) {
            const col = 'status';
            const list = statusInMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
            if (!list.includes(row[col])) return false;
            return true;
        }
        const eqMatch = cond.match(/([a-zA-Z0-9_.]+)\s*=\s*(\?|'[^']*'|\$?[0-9]+|true|false|null)/i);
        if (eqMatch) {
            const col = eqMatch[1].split('.').pop();
            let val;
            const raw = eqMatch[2];
            if (raw === '?') {
                val = params.shift();
            } else if (raw === 'true') {
                val = true;
            } else if (raw === 'false') {
                val = false;
            } else if (raw === 'null') {
                val = null;
            } else if (/^'.*'$/.test(raw)) {
                val = raw.slice(1, -1);
            } else if (/^\$?[0-9]+$/.test(raw)) {
                val = row[col];
            } else {
                val = raw;
            }
            return row[col] === val;
        }
        const isNotNullMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL/i);
        if (isNotNullMatch) {
            const col = isNotNullMatch[1].split('.').pop();
            return row[col] !== null && row[col] !== undefined;
        }
        return true;
    }

    function sortRows(rows, orderCols) {
        return [...rows].sort((a, b) => {
            for (const oc of orderCols) {
                const desc = /DESC/i.test(oc);
                const col = oc.split(/\s+/)[0];
                const av = a[col], bv = b[col];
                if (av === bv) continue;
                if (av === null || av === undefined) return 1;
                if (bv === null || bv === undefined) return -1;
                if (av < bv) return desc ? 1 : -1;
                if (av > bv) return desc ? -1 : 1;
            }
            return 0;
        });
    }

    function execInsert(sql, params) {
        const intoMatch = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
        if (!intoMatch) return [];
        const table = intoMatch[1].toLowerCase();
        const tbl = ensureTable(table);

        const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        let cols = [];
        if (colsMatch) cols = colsMatch[1].split(',').map(c => c.trim());

        const onConflict = sql.match(/ON CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+?)(?:\s+RETURNING|$)/i);
        const returningMatch = sql.match(/RETURNING\s+([\s\S]+)$/i);

        if (onConflict) {
            const conflictCols = onConflict[1].split(',').map(c => c.trim());
            const setMatch = onConflict[2].match(/^([a-zA-Z0-9_]+)\s*=\s*EXCLUDED\.\1/i);
            if (setMatch) {
                const targetCol = conflictCols[0];
                const value = params[cols.indexOf(targetCol)];
                const existing = tbl.find(r => r[targetCol] === value);
                if (existing) {
                    const newCol = setMatch[1];
                    existing[newCol] = params[cols.indexOf(newCol)];
                    if (returningMatch) {
                        return [existing];
                    }
                    return [];
                }
            }
        }

        const row = { id: sequences[table]++ };
        cols.forEach((c, i) => { row[c] = params[i]; });
        tbl.push(row);
        return [row];
    }

    function execUpdate(sql, params) {
        const tableMatch = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)/i);
        if (!tableMatch) return { rows: [], rowCount: 0 };
        const table = tableMatch[1].toLowerCase();
        const tbl = ensureTable(table);

        const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
        const whereMatch = sql.match(/WHERE\s+([\s\S]+)$/i);
        if (!setMatch || !whereMatch) return { rows: [], rowCount: 0 };

        const setParts = splitCommasRespectingParens(setMatch[1]);
        const setObj = {};
        for (const part of setParts) {
            const eqMatch = part.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
            if (!eqMatch) continue;
            const col = eqMatch[1].trim();
            const raw = eqMatch[2].trim();
            if (raw.startsWith('COALESCE(?,') || raw.startsWith('COALESCE(')) {
                setObj[col] = params.shift();
            } else if (raw === '?') {
                setObj[col] = params.shift();
            } else if (/^CURRENT_TIMESTAMP$/i.test(raw)) {
                setObj[col] = new Date().toISOString();
            } else if (/^NULL$/i.test(raw)) {
                setObj[col] = null;
            } else if (/^'(.*)'$/.test(raw)) {
                setObj[col] = raw.slice(1, -1);
            } else {
                setObj[col] = raw;
            }
        }

        const matched = applyWhere(tbl, whereMatch[1], [...params], tables);
        let count = 0;
        for (const r of matched) {
            Object.assign(r, setObj);
            count++;
        }
        return { rows: matched, rowCount: count };
    }

    function splitCommasRespectingParens(s) {
        const out = []; let depth = 0, buf = '';
        for (const c of s) {
            if (c === '(') depth++;
            if (c === ')') depth--;
            if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
            buf += c;
        }
        if (buf.trim()) out.push(buf.trim());
        return out;
    }

    function execDelete(sql, params) {
        const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (!fromMatch) return { rows: [], rowCount: 0 };
        const table = fromMatch[1].toLowerCase();
        const tbl = ensureTable(table);
        const whereMatch = sql.match(/WHERE\s+([\s\S]+)$/i);
        if (!whereMatch) {
            const n = tbl.length; tbl.length = 0; return { rows: [], rowCount: n };
        }
        const matched = applyWhere(tbl, whereMatch[1], [...params], tables);
        const remaining = tbl.filter(r => !matched.includes(r));
        tables[table] = remaining;
        return { rows: matched, rowCount: matched.length };
    }

    async function query(sql, params = []) {
        const finalSql = addReturningIfInsert(convertPlaceholders(sql));
        const ps = [...params];
        const upper = finalSql.trim().toUpperCase();
        try {
            if (upper.startsWith('SELECT')) {
                return makeResult(execSelect(finalSql, ps));
            } else if (upper.startsWith('INSERT')) {
                return makeResult(execInsert(finalSql, ps));
            } else if (upper.startsWith('UPDATE')) {
                const r = execUpdate(finalSql, ps);
                return { rows: r.rows, lastID: r.rows[0]?.id ?? null, changes: r.rowCount };
            } else if (upper.startsWith('DELETE')) {
                const r = execDelete(finalSql, ps);
                return { rows: r.rows, lastID: null, changes: r.rowCount };
            }
            return makeResult([]);
        } catch (err) {
            throw new Error(`[memory] SQL error: ${err.message} | SQL: ${finalSql}`);
        }
    }

    async function getClient() {
        return {
            query,
            release() {},
        };
    }

    async function withTransaction(fn) {
        return fn({ query });
    }

    async function end() {}

    async function ping() { return true; }

    return { driver: 'memory', query, getClient, withTransaction, end, ping };
}

module.exports = { createMemoryDriver };
