'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function listByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT d.*, tc.title AS tc_title, tc.key_id AS tc_key, e.tester AS tester_name,
                r.id AS run_id, assignee.name AS assignee_name
         FROM qa_defects d
         JOIN qa_executions e ON d.execution_id = e.id
         JOIN qa_test_cases tc ON e.tc_id = tc.id
         JOIN qa_test_suites s ON tc.suite_id = s.id
         JOIN qa_use_cases cu ON s.use_case_id = cu.id
         JOIN qa_test_runs r ON e.run_id = r.id
         LEFT JOIN qa_users assignee ON d.assigned_to = assignee.id
         WHERE cu.project_id = ? ORDER BY d.id DESC`, [projectId]
    );
    return r.rows;
}

async function findByExecutionAndTitle(executionId, title, exec) {
    const r = await executor(exec).query(
        `SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`, [executionId, title]
    );
    return r.rows[0] || null;
}

async function findEpicKeyByExecution(executionId, exec) {
    const r = await executor(exec).query(
        `SELECT s.jira_epic_key FROM qa_test_suites s
         JOIN qa_test_cases tc ON s.id = tc.suite_id
         JOIN qa_executions e ON tc.id = e.tc_id
         WHERE e.id = ?`, [executionId]
    );
    return r.rows[0]?.jira_epic_key;
}

async function findTrackedByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT d.id, d.title, d.jira_key, d.jira_url, d.created_at
         FROM qa_defects d
         JOIN qa_executions e ON d.execution_id = e.id
         JOIN qa_test_cases tc ON e.tc_id = tc.id
         JOIN qa_test_suites s ON tc.suite_id = s.id
         JOIN qa_use_cases cu ON s.use_case_id = cu.id
         WHERE cu.project_id = ? AND d.jira_key IS NOT NULL`, [projectId]
    );
    return r.rows;
}

async function findDetailById(id, exec) {
    const r = await executor(exec).query(
        `SELECT d.*, tc.title AS tc_title, tc.key_id AS tc_key,
                e.tester AS tester_name, s.use_case_id
         FROM qa_defects d
         JOIN qa_executions e ON d.execution_id = e.id
         JOIN qa_test_cases tc ON e.tc_id = tc.id
         JOIN qa_test_suites s ON tc.suite_id = s.id
         WHERE d.id = ?`, [id]
    );
    return r.rows[0] || null;
}

async function setJiraLink(id, { jiraKey, jiraUrl, rootCause }, exec) {
    await executor(exec).query(
        `UPDATE qa_defects SET jira_key = ?, jira_url = ?, root_cause = ? WHERE id = ?`,
        [jiraKey, jiraUrl, rootCause, id]
    );
}

async function listByExecutionIds(executionIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_defects WHERE execution_id = ANY(?)`, [executionIds]
    );
    return r.rows;
}

async function listByRunId(runId, exec) {
    const r = await executor(exec).query(
        `SELECT b.*, tc.title AS tc_title FROM qa_defects b
         JOIN qa_executions e ON b.execution_id = e.id
         JOIN qa_test_cases tc ON e.tc_id = tc.id
         WHERE e.run_id = ?`, [runId]
    );
    return r.rows;
}

async function create({ executionId, title, description, severity, stepsToReproduce, expectedResult, actualResult, frequency, businessImpact, status, jiraEpicKey }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [executionId, title, description, severity, stepsToReproduce, expectedResult, actualResult, frequency, businessImpact, status || 'OPEN', jiraEpicKey]
    );
    return r.lastID;
}

async function updateStatus(id, status, exec) {
    await executor(exec).query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [status, id]);
}

async function assign(id, userId, exec) {
    await executor(exec).query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ?`, [userId, id]);
}

module.exports = {
    listByProject, findByExecutionAndTitle, findEpicKeyByExecution,
    findTrackedByProject, findDetailById, setJiraLink,
    listByExecutionIds, listByRunId, create, updateStatus, assign,
};
