'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function findById(id, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_test_cases WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function findSlim(id, exec) {
    const r = await executor(exec).query(
        `SELECT title, us_id, scenario_id FROM qa_test_cases WHERE id = ?`, [id]
    );
    return r.rows[0] || null;
}

async function findSuiteId(id, exec) {
    const r = await executor(exec).query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [id]);
    return r.rows[0]?.suite_id;
}

async function findJiraEpicKey(id, exec) {
    const r = await executor(exec).query(
        `SELECT s.jira_epic_key FROM qa_test_suites s
         JOIN qa_test_cases tc ON s.id = tc.suite_id WHERE tc.id = ?`, [id]
    );
    return r.rows[0]?.jira_epic_key;
}

async function listBySuiteIds(suiteIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_test_cases WHERE suite_id = ANY(?) ORDER BY id`, [suiteIds]
    );
    return r.rows;
}

async function findEligibleForExecution({ suiteId, executionType, filters }, exec) {
    let sql = `SELECT id, assigned_to FROM qa_test_cases WHERE suite_id = ?`;
    const params = [suiteId];
    if (executionType === 'SMOKE') sql += ` AND is_smoke = true`;
    else if (executionType === 'REGRESSION') sql += ` AND is_regression = true`;
    else if (executionType === 'INTEGRATION') sql += ` AND is_integration = true`;
    else if (executionType === 'EXPLORATORY') sql += ` AND is_exploratory = true`;
    else if (executionType === 'CUSTOM' && filters) {
        if (filters.priority) { sql += ` AND priority = ?`; params.push(filters.priority); }
        if (filters.is_smoke !== undefined) { sql += ` AND is_smoke = ?`; params.push(filters.is_smoke); }
        if (filters.is_regression !== undefined) { sql += ` AND is_regression = ?`; params.push(filters.is_regression); }
        if (filters.is_integration !== undefined) { sql += ` AND is_integration = ?`; params.push(filters.is_integration); }
        if (filters.is_exploratory !== undefined) { sql += ` AND is_exploratory = ?`; params.push(filters.is_exploratory); }
    }
    const r = await executor(exec).query(sql, params);
    return r.rows;
}

async function countLinkedToUS(suiteId, exec) {
    const r = await executor(exec).query(
        `SELECT COUNT(*)::INT AS cnt FROM qa_test_cases WHERE suite_id = ? AND us_id IS NOT NULL`, [suiteId]
    );
    return r.rows[0].cnt;
}

async function create({
    suiteId, usId, scenarioId, title, steps, expectedResult,
    assignedTo, createdBy, updatedBy, keyId, preconditions, jiraEpicKey,
    assumptions, testData, acceptanceCriteria,
}, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_cases
         (suite_id, us_id, scenario_id, title, steps, expected_result, assigned_to, created_by, updated_by, key_id, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [suiteId, usId, scenarioId, title, steps, expectedResult, assignedTo, createdBy, updatedBy, keyId, preconditions, jiraEpicKey, assumptions, testData, acceptanceCriteria]
    );
    return r.lastID;
}

async function createMinimal({ suiteId, title, keyId }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`,
        [suiteId, title, keyId]
    );
    return r.lastID;
}

async function updateTitle(id, title, exec) {
    await executor(exec).query(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [title, id]);
}

async function updateTitleByScenario(scenarioId, title, exec) {
    await executor(exec).query(`UPDATE qa_test_cases SET title = ? WHERE scenario_id = ?`, [title, scenarioId]);
}

async function setScenario(id, scenarioId, exec) {
    await executor(exec).query(`UPDATE qa_test_cases SET scenario_id = ? WHERE id = ?`, [scenarioId, id]);
}

async function moveToSuite(id, newSuiteId, updatedBy, exec) {
    const r = await executor(exec).query(
        `UPDATE qa_test_cases SET suite_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newSuiteId, updatedBy, id]
    );
    return r.changes;
}

async function assignAllBySuite(suiteId, userId, exec) {
    await executor(exec).query(
        `UPDATE qa_test_cases SET assigned_to = ? WHERE suite_id = ?`, [userId, suiteId]
    );
}

const ALLOWED_UPDATE_FIELDS = new Set([
    'title', 'steps', 'expected_result', 'preconditions', 'assigned_to',
    'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory',
    'assumptions', 'test_data', 'acceptance_criteria', 'jira_epic_key', 'us_id', 'scenario_id',
]);

async function updateDynamic(id, fields, exec) {
    const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
    if (entries.length === 0) return { changes: 0 };
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    const r = await executor(exec).query(
        `UPDATE qa_test_cases SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]
    );
    return { changes: r.changes };
}

async function updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) {
    const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
    if (entries.length === 0) return { changes: 0 };
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    const r = await executor(exec).query(
        `UPDATE qa_test_cases SET ${setClause}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, updatedBy, id]
    );
    return { changes: r.changes };
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_test_cases WHERE id = ?`, [id]);
}

async function exportByUseCase(useCaseId, exec) {
    const r = await executor(exec).query(
        `SELECT tc.*, us.title AS us_title, us.key_id AS us_key, s.title AS suite_title, uc.title AS uc_title,
                e.status AS last_status, e.observations, e.obtained_result, e.tester, e.executed_at
         FROM qa_test_cases tc
         JOIN qa_test_suites s ON tc.suite_id = s.id
         LEFT JOIN qa_user_stories us ON tc.us_id = us.id
         LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
         LEFT JOIN LATERAL (
             SELECT status, observations, obtained_result, tester, executed_at
             FROM qa_executions WHERE tc_id = tc.id ORDER BY executed_at DESC LIMIT 1
         ) e ON true
         WHERE s.use_case_id = ? ORDER BY s.id, us.id, tc.id`, [useCaseId]
    );
    return r.rows;
}

async function exportByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT tc.*, us.title AS us_title, us.key_id AS us_key, s.title AS suite_title, uc.title AS uc_title,
                e.status AS last_status, e.observations, e.obtained_result, e.tester, e.executed_at
         FROM qa_test_cases tc
         JOIN qa_test_suites s ON tc.suite_id = s.id
         JOIN qa_use_cases uc ON s.use_case_id = uc.id
         LEFT JOIN qa_user_stories us ON tc.us_id = us.id
         LEFT JOIN LATERAL (
             SELECT status, observations, obtained_result, tester, executed_at
             FROM qa_executions WHERE tc_id = tc.id ORDER BY executed_at DESC LIMIT 1
         ) e ON true
         WHERE uc.project_id = ? ORDER BY s.id, us.id, tc.id`, [projectId]
    );
    return r.rows;
}

async function statusBreakdownByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT COALESCE(e.status, 'PENDING') AS status, COUNT(*)::INT AS count
         FROM qa_test_cases tc
         JOIN qa_test_suites s ON tc.suite_id = s.id
         JOIN qa_use_cases cu ON s.use_case_id = cu.id
         LEFT JOIN (
             SELECT tc_id, status FROM qa_executions
             WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
         ) e ON tc.id = e.tc_id
         WHERE cu.project_id = ?
         GROUP BY COALESCE(e.status, 'PENDING')`, [projectId]
    );
    return r.rows;
}

module.exports = {
    findById, findSlim, findSuiteId, findJiraEpicKey,
    listBySuiteIds, findEligibleForExecution, countLinkedToUS,
    create, createMinimal, updateTitle, updateTitleByScenario, setScenario,
    moveToSuite, assignAllBySuite, updateDynamic, updateDynamicWithUpdatedBy, remove,
    exportByUseCase, exportByProject, statusBreakdownByProject,
};
