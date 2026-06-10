'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function create({ suiteId, createdBy, runType, lastResumeAt = null, accumulatedSeconds = 0 }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
         VALUES (?, 'RUNNING', ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
        [suiteId, createdBy, runType || 'FULL', lastResumeAt, accumulatedSeconds]
    );
    return r.lastID;
}

async function createRetest({ suiteId, createdBy, parentRunId }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_runs (suite_id, status, created_by, parent_run_id, run_type)
         VALUES (?, 'RUNNING', ?, ?, 'RETEST')`, [suiteId, createdBy, parentRunId]
    );
    return r.lastID;
}

async function findActive(runId, exec) {
    const r = await executor(exec).query(
        `SELECT last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ? AND status = 'RUNNING'`,
        [runId]
    );
    return r.rows[0] || null;
}

async function findPaused(runId, exec) {
    const r = await executor(exec).query(
        `SELECT id FROM qa_test_runs WHERE id = ? AND status = 'PAUSED'`, [runId]
    );
    return r.rows[0] || null;
}

async function findById(runId, exec) {
    const r = await executor(exec).query(
        `SELECT status, last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ?`, [runId]
    );
    return r.rows[0] || null;
}

async function findSuiteId(runId, exec) {
    const r = await executor(exec).query(`SELECT suite_id FROM qa_test_runs WHERE id = ?`, [runId]);
    return r.rows[0]?.suite_id;
}

async function listActiveByIds(runIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status = 'ACTIVE'`, [runIds]
    );
    return r.rows;
}

async function listActiveByIdsWithStatuses(runIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status IN ('ACTIVE', 'RUNNING', 'PAUSED')`,
        [runIds]
    );
    return r.rows;
}

async function listFinishedByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT r.*, s.title AS suite_title, u.name AS tester_name
         FROM qa_test_runs r
         JOIN qa_test_suites s ON r.suite_id = s.id
         JOIN qa_use_cases uc ON s.use_case_id = uc.id
         LEFT JOIN qa_users u ON r.created_by = u.id
         WHERE uc.project_id = ? AND r.status = 'FINISHED'
         ORDER BY r.finished_at DESC`, [projectId]
    );
    return r.rows;
}

async function pause(runId, accumulatedSeconds, exec) {
    await executor(exec).query(
        `UPDATE qa_test_runs SET status = 'PAUSED', accumulated_seconds = ?, last_resume_at = NULL WHERE id = ?`,
        [accumulatedSeconds, runId]
    );
}

async function resume(runId, exec) {
    await executor(exec).query(
        `UPDATE qa_test_runs SET status = 'RUNNING', last_resume_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId]
    );
}

async function finish(runId, accumulatedSeconds, exec) {
    await executor(exec).query(
        `UPDATE qa_test_runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP, accumulated_seconds = ? WHERE id = ?`,
        [accumulatedSeconds, runId]
    );
}

module.exports = {
    create, createRetest, findActive, findPaused, findById, findSuiteId,
    listActiveByIds, listActiveByIdsWithStatuses, listFinishedByProject,
    pause, resume, finish,
};
