'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function findByTcAndRun(tcId, runId, exec) {
    const r = await executor(exec).query(
        `SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`, [tcId, runId]
    );
    return r.rows[0] || null;
}

async function findLatestByTc(tcId, exec) {
    const r = await executor(exec).query(
        `SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]
    );
    return r.rows[0] || null;
}

async function findStatusesByRunId(runId, exec) {
    const r = await executor(exec).query(`SELECT status FROM qa_executions WHERE run_id = ?`, [runId]);
    return r.rows;
}

async function findFailedTcIds(runId, exec) {
    const r = await executor(exec).query(
        `SELECT DISTINCT e.tc_id FROM qa_executions e
         WHERE e.run_id = ? AND e.status IN ('FAIL', 'WARNING', 'BLOCKED', 'BLOCK')`, [runId]
    );
    return r.rows.map(row => row.tc_id);
}

async function findLatestBySuiteIds(suiteIds, exec) {
    const r = await executor(exec).query(
        `SELECT DISTINCT ON (tc_id) * FROM qa_executions
         WHERE tc_id IN (SELECT id FROM qa_test_cases WHERE suite_id = ANY(?))
         ORDER BY tc_id, id DESC`, [suiteIds]
    );
    return r.rows;
}

async function listByRunIds(runIds, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_executions WHERE run_id = ANY(?)`, [runIds]);
    return r.rows;
}

async function findLatestByRunIds(runIds, exec) {
    const r = await executor(exec).query(
        `SELECT DISTINCT ON (tc_id, run_id) * FROM qa_executions
         WHERE run_id = ANY(?) ORDER BY tc_id, run_id, id DESC`, [runIds]
    );
    return r.rows;
}

async function listByTcIds(tcIds, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_executions WHERE tc_id = ANY(?)`, [tcIds]);
    return r.rows;
}

async function create({ tcId, runId, tester, status, observations, obtainedResult }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_executions (tc_id, run_id, tester, status, observations, obtained_result)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tcId, runId, tester, status || 'PENDING', observations || '', obtainedResult || '']
    );
    return r.lastID;
}

async function createMinimal({ tcId, status }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`,
        [tcId, status]
    );
    return r.rows[0]?.id;
}

async function updateStatus(id, status, exec) {
    await executor(exec).query(`UPDATE qa_executions SET status = ? WHERE id = ?`, [status, id]);
}

const ALLOWED_UPDATE_FIELDS = new Set(['status', 'observations', 'obtained_result']);

async function updateDynamic(id, fields, exec) {
    const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
    if (entries.length === 0) return;
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    await executor(exec).query(
        `UPDATE qa_executions SET ${setClause} WHERE id = ?`, [...values, id]
    );
}

module.exports = {
    findByTcAndRun, findLatestByTc, findStatusesByRunId, findFailedTcIds,
    findLatestBySuiteIds, listByRunIds, findLatestByRunIds, listByTcIds,
    create, createMinimal, updateStatus, updateDynamic,
};
