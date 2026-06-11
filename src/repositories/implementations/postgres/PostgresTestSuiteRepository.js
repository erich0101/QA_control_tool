'use strict';

const { TestSuiteRepository, TestCaseRepository, TestRunRepository, ExecutionRepository } = require('../../contracts/TestSuiteRepository');
const { PostgresBaseRepository } = require('./PostgresBaseRepository');

class PostgresTestSuiteRepository extends TestSuiteRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async create({ useCaseId, title, description, createdBy, updatedBy, keyId, jiraEpicKey }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_suites (use_case_id, title, description, created_by, updated_by, key_id, jira_epic_key)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [useCaseId, title, description, createdBy, updatedBy, keyId, jiraEpicKey]
        );
        return r.lastID;
    }
    async createReturning({ useCaseId, title, description, keyId, createdBy }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
             VALUES (?, ?, ?, ?, ?) RETURNING id`,
            [useCaseId, title, description, keyId, createdBy]
        );
        return r.rows[0]?.id;
    }
    async findById(id, exec) {
        const r = await this._query(`SELECT * FROM qa_test_suites WHERE id = ?`, [id]);
        return r.rows[0] || null;
    }
    async findActiveRunId(suiteId, exec) {
        const r = await this._query(
            `SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]
        );
        return r.rows[0]?.active_run_id;
    }
    async findProjectId(suiteId, exec) {
        const r = await this._query(
            `SELECT cu.project_id FROM qa_test_suites ts
             JOIN qa_use_cases cu ON ts.use_case_id = cu.id WHERE ts.id = ?`, [suiteId]
        );
        return r.rows[0]?.project_id;
    }
    async findUseCaseId(suiteId, exec) {
        const r = await this._query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        return r.rows[0]?.use_case_id;
    }
    async listByUseCase(useCaseId, exec) {
        const r = await this._query(
            `SELECT * FROM qa_test_suites WHERE use_case_id = ? ORDER BY id`, [useCaseId]
        );
        return r.rows;
    }
    async listByProject(projectId, exec) {
        const r = await this._query(
            `SELECT s.* FROM qa_test_suites s
             LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
             WHERE s.project_id = ? OR uc.project_id = ? ORDER BY s.id`, [projectId, projectId]
        );
        return r.rows;
    }
    async listAvailableForUC(useCaseId, exec) {
        const r = await this._query(
            `SELECT s.id, s.title, s.key_id FROM qa_test_suites s
             WHERE s.use_case_id = ? AND s.active_run_id IS NULL ORDER BY s.id`, [useCaseId]
        );
        return r.rows;
    }
    async listByStoryIds(storyIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_test_suites WHERE us_id = ANY(?)`, [storyIds]
        );
        return r.rows;
    }
    async setActiveRun(suiteId, runId, exec) {
        await this._query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);
    }
    async clearActiveRun(suiteId, exec) {
        await this._query(`UPDATE qa_test_suites SET active_run_id = NULL WHERE id = ?`, [suiteId]);
    }
    async moveToUC(suiteId, newUseCaseId, updatedBy, exec) {
        const r = await this._query(
            `UPDATE qa_test_suites SET use_case_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newUseCaseId, updatedBy, suiteId]
        );
        return r.changes;
    }
    async update(id, { title, description, assignedTo, jiraEpicKey, updatedBy }, exec) {
        await this._query(
            `UPDATE qa_test_suites
             SET title = COALESCE(?, title), description = COALESCE(?, description),
                 assigned_to = COALESCE(?, assigned_to), jira_epic_key = COALESCE(?, jira_epic_key),
                 updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`, [title, description, assignedTo, jiraEpicKey, updatedBy, id]
        );
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_test_suites WHERE id = ?`, [id]);
    }
    async statsByProject(projectId, exec) {
        const r = await this._query(
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
    async statsByDurationByProject(projectId, exec) {
        const r = await this._query(`
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
}

class PostgresTestCaseRepository extends TestCaseRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findById(id, exec) {
        const r = await this._query(`SELECT * FROM qa_test_cases WHERE id = ?`, [id]);
        return r.rows[0] || null;
    }
    async findSlim(id, exec) {
        const r = await this._query(
            `SELECT title, us_id, scenario_id FROM qa_test_cases WHERE id = ?`, [id]
        );
        return r.rows[0] || null;
    }
    async findSuiteId(id, exec) {
        const r = await this._query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [id]);
        return r.rows[0]?.suite_id;
    }
    async findJiraEpicKey(id, exec) {
        const r = await this._query(
            `SELECT s.jira_epic_key FROM qa_test_suites s
             JOIN qa_test_cases tc ON s.id = tc.suite_id WHERE tc.id = ?`, [id]
        );
        return r.rows[0]?.jira_epic_key;
    }
    async listBySuiteIds(suiteIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_test_cases WHERE suite_id = ANY(?) ORDER BY id`, [suiteIds]
        );
        return r.rows;
    }
    async findEligibleForExecution({ suiteId, executionType, filters }, exec) {
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
        const r = await this._query(sql, params);
        return r.rows;
    }
    async countLinkedToUS(suiteId, exec) {
        const r = await this._query(
            `SELECT COUNT(*)::INT AS cnt FROM qa_test_cases WHERE suite_id = ? AND us_id IS NOT NULL`, [suiteId]
        );
        return r.rows[0].cnt;
    }
    async create({
        suiteId, usId, scenarioId, title, steps, expectedResult,
        assignedTo, createdBy, updatedBy, keyId, preconditions, jiraEpicKey,
        assumptions, testData, acceptanceCriteria,
    }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_cases
             (suite_id, us_id, scenario_id, title, steps, expected_result, assigned_to, created_by, updated_by, key_id, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [suiteId, usId, scenarioId, title, steps, expectedResult, assignedTo, createdBy, updatedBy, keyId, preconditions, jiraEpicKey, assumptions, testData, acceptanceCriteria]
        );
        return r.lastID;
    }
    async createMinimal({ suiteId, title, keyId }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`,
            [suiteId, title, keyId]
        );
        return r.lastID;
    }
    async updateTitle(id, title, exec) {
        await this._query(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [title, id]);
    }
    async updateTitleByScenario(scenarioId, title, exec) {
        await this._query(`UPDATE qa_test_cases SET title = ? WHERE scenario_id = ?`, [title, scenarioId]);
    }
    async setScenario(id, scenarioId, exec) {
        await this._query(`UPDATE qa_test_cases SET scenario_id = ? WHERE id = ?`, [scenarioId, id]);
    }
    async moveToSuite(id, newSuiteId, updatedBy, exec) {
        const r = await this._query(
            `UPDATE qa_test_cases SET suite_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newSuiteId, updatedBy, id]
        );
        return r.changes;
    }
    async assignAllBySuite(suiteId, userId, exec) {
        await this._query(
            `UPDATE qa_test_cases SET assigned_to = ? WHERE suite_id = ?`, [userId, suiteId]
        );
    }
    async updateDynamic(id, fields, exec) {
        const ALLOWED_UPDATE_FIELDS = new Set([
            'title', 'steps', 'expected_result', 'preconditions', 'assigned_to',
            'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory',
            'assumptions', 'test_data', 'acceptance_criteria', 'jira_epic_key', 'us_id', 'scenario_id',
        ]);
        const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
        if (entries.length === 0) return { changes: 0 };
        const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await this._query(
            `UPDATE qa_test_cases SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]
        );
        return { changes: r.changes };
    }
    async updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) {
        const ALLOWED_UPDATE_FIELDS = new Set([
            'title', 'steps', 'expected_result', 'preconditions', 'assigned_to',
            'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory',
            'assumptions', 'test_data', 'acceptance_criteria', 'jira_epic_key', 'us_id', 'scenario_id',
        ]);
        const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
        if (entries.length === 0) return { changes: 0 };
        const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await this._query(
            `UPDATE qa_test_cases SET ${setClause}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, updatedBy, id]
        );
        return { changes: r.changes };
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_test_cases WHERE id = ?`, [id]);
    }
    async exportByUseCase(useCaseId, exec) {
        const r = await this._query(
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
    async exportByProject(projectId, exec) {
        const r = await this._query(
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
    async statusBreakdownByProject(projectId, exec) {
        const r = await this._query(
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
}

class PostgresTestRunRepository extends TestRunRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async create({ suiteId, createdBy, runType, lastResumeAt = null, accumulatedSeconds = 0 }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
             VALUES (?, 'RUNNING', ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
            [suiteId, createdBy, runType || 'FULL', lastResumeAt, accumulatedSeconds]
        );
        return r.lastID;
    }
    async createRetest({ suiteId, createdBy, parentRunId }, exec) {
        const r = await this._query(
            `INSERT INTO qa_test_runs (suite_id, status, created_by, parent_run_id, run_type)
             VALUES (?, 'RUNNING', ?, ?, 'RETEST')`, [suiteId, createdBy, parentRunId]
        );
        return r.lastID;
    }
    async findActive(runId, exec) {
        const r = await this._query(
            `SELECT last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ? AND status = 'RUNNING'`,
            [runId]
        );
        return r.rows[0] || null;
    }
    async findPaused(runId, exec) {
        const r = await this._query(
            `SELECT id FROM qa_test_runs WHERE id = ? AND status = 'PAUSED'`, [runId]
        );
        return r.rows[0] || null;
    }
    async findById(runId, exec) {
        const r = await this._query(
            `SELECT status, last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ?`, [runId]
        );
        return r.rows[0] || null;
    }
    async findSuiteId(runId, exec) {
        const r = await this._query(`SELECT suite_id FROM qa_test_runs WHERE id = ?`, [runId]);
        return r.rows[0]?.suite_id;
    }
    async listActiveByIds(runIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status = 'ACTIVE'`, [runIds]
        );
        return r.rows;
    }
    async listActiveByIdsWithStatuses(runIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status IN ('ACTIVE', 'RUNNING', 'PAUSED')`,
            [runIds]
        );
        return r.rows;
    }
    async listFinishedByProject(projectId, exec) {
        const r = await this._query(
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
    async pause(runId, accumulatedSeconds, exec) {
        await this._query(
            `UPDATE qa_test_runs SET status = 'PAUSED', accumulated_seconds = ?, last_resume_at = NULL WHERE id = ?`,
            [accumulatedSeconds, runId]
        );
    }
    async resume(runId, exec) {
        await this._query(
            `UPDATE qa_test_runs SET status = 'RUNNING', last_resume_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId]
        );
    }
    async finish(runId, accumulatedSeconds, exec) {
        await this._query(
            `UPDATE qa_test_runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP, accumulated_seconds = ? WHERE id = ?`,
            [accumulatedSeconds, runId]
        );
    }
}

class PostgresExecutionRepository extends ExecutionRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findByTcAndRun(tcId, runId, exec) {
        const r = await this._query(
            `SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`, [tcId, runId]
        );
        return r.rows[0] || null;
    }
    async findLatestByTc(tcId, exec) {
        const r = await this._query(
            `SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]
        );
        return r.rows[0] || null;
    }
    async findStatusesByRunId(runId, exec) {
        const r = await this._query(`SELECT status FROM qa_executions WHERE run_id = ?`, [runId]);
        return r.rows;
    }
    async findFailedTcIds(runId, exec) {
        const r = await this._query(
            `SELECT DISTINCT e.tc_id FROM qa_executions e
             WHERE e.run_id = ? AND e.status IN ('FAIL', 'WARNING', 'BLOCKED', 'BLOCK')`, [runId]
        );
        return r.rows.map(row => row.tc_id);
    }
    async findLatestBySuiteIds(suiteIds, exec) {
        const r = await this._query(
            `SELECT DISTINCT ON (tc_id) * FROM qa_executions
             WHERE tc_id IN (SELECT id FROM qa_test_cases WHERE suite_id = ANY(?))
             ORDER BY tc_id, id DESC`, [suiteIds]
        );
        return r.rows;
    }
    async listByRunIds(runIds, exec) {
        const r = await this._query(`SELECT * FROM qa_executions WHERE run_id = ANY(?)`, [runIds]);
        return r.rows;
    }
    async findLatestByRunIds(runIds, exec) {
        const r = await this._query(
            `SELECT DISTINCT ON (tc_id, run_id) * FROM qa_executions
             WHERE run_id = ANY(?) ORDER BY tc_id, run_id, id DESC`, [runIds]
        );
        return r.rows;
    }
    async listByTcIds(tcIds, exec) {
        const r = await this._query(`SELECT * FROM qa_executions WHERE tc_id = ANY(?)`, [tcIds]);
        return r.rows;
    }
    async create({ tcId, runId, tester, status, observations, obtainedResult }, exec) {
        const r = await this._query(
            `INSERT INTO qa_executions (tc_id, run_id, tester, status, observations, obtained_result)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tcId, runId, tester, status || 'PENDING', observations || '', obtainedResult || '']
        );
        return r.lastID;
    }
    async createMinimal({ tcId, status }, exec) {
        const r = await this._query(
            `INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`,
            [tcId, status]
        );
        return r.rows[0]?.id;
    }
    async updateStatus(id, status, exec) {
        await this._query(`UPDATE qa_executions SET status = ? WHERE id = ?`, [status, id]);
    }
    async updateDynamic(id, fields, exec) {
        const ALLOWED_UPDATE_FIELDS = new Set(['status', 'observations', 'obtained_result']);
        const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
        if (entries.length === 0) return;
        const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
        const values = entries.map(([, v]) => v);
        await this._query(
            `UPDATE qa_executions SET ${setClause} WHERE id = ?`, [...values, id]
        );
    }
}

module.exports = {
    PostgresTestSuiteRepository,
    PostgresTestCaseRepository,
    PostgresTestRunRepository,
    PostgresExecutionRepository,
};
