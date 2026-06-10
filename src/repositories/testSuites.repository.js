'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function create({ useCaseId, title, description, createdBy, updatedBy, keyId, jiraEpicKey }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_suites (use_case_id, title, description, created_by, updated_by, key_id, jira_epic_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [useCaseId, title, description, createdBy, updatedBy, keyId, jiraEpicKey]
    );
    return r.lastID;
}

async function createReturning({ useCaseId, title, description, keyId, createdBy }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [useCaseId, title, description, keyId, createdBy]
    );
    return r.rows[0]?.id;
}

async function findById(id, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_test_suites WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function findActiveRunId(suiteId, exec) {
    const r = await executor(exec).query(
        `SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]
    );
    return r.rows[0]?.active_run_id;
}

async function findProjectId(suiteId, exec) {
    const r = await executor(exec).query(
        `SELECT cu.project_id FROM qa_test_suites ts
         JOIN qa_use_cases cu ON ts.use_case_id = cu.id WHERE ts.id = ?`, [suiteId]
    );
    return r.rows[0]?.project_id;
}

async function findUseCaseId(suiteId, exec) {
    const r = await executor(exec).query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
    return r.rows[0]?.use_case_id;
}

async function listByUseCase(useCaseId, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_test_suites WHERE use_case_id = ? ORDER BY id`, [useCaseId]
    );
    return r.rows;
}

async function listByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT s.* FROM qa_test_suites s
         LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
         WHERE s.project_id = ? OR uc.project_id = ? ORDER BY s.id`, [projectId, projectId]
    );
    return r.rows;
}

async function listAvailableForUC(useCaseId, exec) {
    const r = await executor(exec).query(
        `SELECT s.id, s.title, s.key_id FROM qa_test_suites s
         WHERE s.use_case_id = ? AND s.active_run_id IS NULL ORDER BY s.id`, [useCaseId]
    );
    return r.rows;
}

async function listByStoryIds(storyIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_test_suites WHERE us_id = ANY(?)`, [storyIds]
    );
    return r.rows;
}

async function setActiveRun(suiteId, runId, exec) {
    await executor(exec).query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);
}

async function clearActiveRun(suiteId, exec) {
    await executor(exec).query(`UPDATE qa_test_suites SET active_run_id = NULL WHERE id = ?`, [suiteId]);
}

async function moveToUC(suiteId, newUseCaseId, updatedBy, exec) {
    const r = await executor(exec).query(
        `UPDATE qa_test_suites SET use_case_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newUseCaseId, updatedBy, suiteId]
    );
    return r.changes;
}

async function update(id, { title, description, assignedTo, jiraEpicKey, updatedBy }, exec) {
    await executor(exec).query(
        `UPDATE qa_test_suites
         SET title = COALESCE(?, title), description = COALESCE(?, description),
             assigned_to = COALESCE(?, assigned_to), jira_epic_key = COALESCE(?, jira_epic_key),
             updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [title, description, assignedTo, jiraEpicKey, updatedBy, id]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_test_suites WHERE id = ?`, [id]);
}

async function statsByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT s.id, s.title,
                COUNT(r.id)::INT AS total_runs,
                COALESCE(SUM(r.accumulated_seconds), 0)::FLOAT / 60.0 AS total_minutes,
                COALESCE(AVG(r.accumulated_seconds), 0)::FLOAT / 60.0 AS avg_minutes
         FROM qa_test_suites s
         JOIN qa_use_cases uc ON s.use_case_id = uc.id
         LEFT JOIN qa_test_runs r ON s.id = r.suite_id AND r.status = 'FINISHED'
         WHERE uc.project_id = ?
         GROUP BY s.id, s.title ORDER BY total_minutes DESC`, [projectId]
    );
    return r.rows;
}

async function statsByDurationByProject(projectId, exec) {
    const r = await executor(exec).query(`
        SELECT
            s.id,
            s.title,
            COUNT(r.id)::INT as total_runs,
            COALESCE(SUM(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE 0 END), 0)::FLOAT as total_minutes,
            COALESCE(AVG(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE NULL END), 0)::FLOAT as avg_minutes
        FROM qa_test_suites s
        JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_test_runs r ON s.id = r.suite_id
        WHERE uc.project_id = ?
        GROUP BY s.id, s.title
        ORDER BY total_minutes DESC
    `, [projectId]);
    return r.rows;
}

module.exports = {
    create, createReturning, findById, findActiveRunId, findProjectId, findUseCaseId,
    listByUseCase, listByProject, listAvailableForUC, listByStoryIds,
    setActiveRun, clearActiveRun, moveToUC, update, remove, statsByProject, statsByDurationByProject,
};
