'use strict';

const {
    AttachmentRepository,
    DefectRepository,
    PreconditionRepository,
    TcPreconditionsRepository,
    ProjectSequenceRepository,
    JiraConfigsRepository,
    JiraUserConfigsRepository,
} = require('../../contracts/AttachmentRepository');
const { PostgresBaseRepository } = require('./PostgresBaseRepository');

class PostgresAttachmentRepository extends AttachmentRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findBinary(id, exec) {
        const r = await this._query(`SELECT mime_type, file_data FROM qa_attachments WHERE id = ?`, [id]);
        return r.rows[0] || null;
    }
    async listByExecutionIds(execIds, exec) {
        const r = await this._query(
            `SELECT id, execution_id, evidence_category FROM qa_attachments WHERE execution_id = ANY(?)`,
            [execIds]
        );
        return r.rows;
    }
    async listByExecution(executionId, exec) {
        const r = await this._query(
            `SELECT file_name, mime_type, file_data FROM qa_attachments WHERE execution_id = ?`, [executionId]
        );
        return r.rows;
    }
    async create({ executionId, fileName, mimeType, fileData, evidenceCategory }, exec) {
        const r = await this._query(
            `INSERT INTO qa_attachments (execution_id, file_name, mime_type, file_data, evidence_category)
             VALUES (?, ?, ?, ?, ?)`, [executionId, fileName, mimeType, fileData, evidenceCategory]
        );
        return r.lastID;
    }
    async createWithDefect({ executionId, defectId, fileName, mimeType, fileData, evidenceCategory }, exec) {
        await this._query(
            `INSERT INTO qa_attachments (execution_id, defect_id, file_name, mime_type, evidence_category, file_data)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [executionId, defectId, fileName, mimeType, evidenceCategory, fileData]
        );
    }
    async deleteByExecutionAndCategory(executionId, category, exec) {
        await this._query(
            `DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [executionId, category]
        );
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_attachments WHERE id = ?`, [id]);
    }
}

class PostgresDefectRepository extends DefectRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async listByProject(projectId, exec) {
        const r = await this._query(
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
    async findByExecutionAndTitle(executionId, title, exec) {
        const r = await this._query(
            `SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`, [executionId, title]
        );
        return r.rows[0] || null;
    }
    async findEpicKeyByExecution(executionId, exec) {
        const r = await this._query(
            `SELECT s.jira_epic_key FROM qa_test_suites s
             JOIN qa_test_cases tc ON s.id = tc.suite_id
             JOIN qa_executions e ON tc.id = e.tc_id
             WHERE e.id = ?`, [executionId]
        );
        return r.rows[0]?.jira_epic_key;
    }
    async findTrackedByProject(projectId, exec) {
        const r = await this._query(
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
    async findDetailById(id, exec) {
        const r = await this._query(
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
    async setJiraLink(id, { jiraKey, jiraUrl, rootCause }, exec) {
        await this._query(
            `UPDATE qa_defects SET jira_key = ?, jira_url = ?, root_cause = ? WHERE id = ?`,
            [jiraKey, jiraUrl, rootCause, id]
        );
    }
    async listByExecutionIds(executionIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_defects WHERE execution_id = ANY(?)`, [executionIds]
        );
        return r.rows;
    }
    async listByRunId(runId, exec) {
        const r = await this._query(
            `SELECT b.*, tc.title AS tc_title FROM qa_defects b
             JOIN qa_executions e ON b.execution_id = e.id
             JOIN qa_test_cases tc ON e.tc_id = tc.id
             WHERE e.run_id = ?`, [runId]
        );
        return r.rows;
    }
    async create({ executionId, title, description, severity, stepsToReproduce, expectedResult, actualResult, frequency, businessImpact, status, jiraEpicKey }, exec) {
        const r = await this._query(
            `INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [executionId, title, description, severity, stepsToReproduce, expectedResult, actualResult, frequency, businessImpact, status || 'OPEN', jiraEpicKey]
        );
        return r.lastID;
    }
    async updateStatus(id, status, exec) {
        await this._query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [status, id]);
    }
    async assign(id, userId, exec) {
        await this._query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ?`, [userId, id]);
    }
}

class PostgresPreconditionRepository extends PreconditionRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
        this.tcPreconditions = new PostgresTcPreconditionsRepository({ base: this._base });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async listLinkedByUS(usId, exec) {
        const r = await this._query(
            `SELECT DISTINCT p.* FROM qa_preconditions p
             JOIN qa_tc_preconditions tp ON tp.prc_id = p.id
             JOIN qa_test_cases tc ON tc.id = tp.tc_id
             JOIN qa_test_suites ts ON ts.id = tc.suite_id
             WHERE ts.us_id = ? ORDER BY p.id`, [usId]
        );
        return r.rows;
    }
    async listAll(exec) {
        const r = await this._query(`SELECT * FROM qa_preconditions ORDER BY id`);
        return r.rows;
    }
    async create({ title, description, systemState }, exec) {
        const r = await this._query(
            `INSERT INTO qa_preconditions (title, description, system_state) VALUES (?, ?, ?)`,
            [title, description || '', systemState || '']
        );
        return r.lastID;
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_preconditions WHERE id = ?`, [id]);
    }
}

class PostgresTcPreconditionsRepository extends TcPreconditionsRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async link(tcId, prcId, exec) {
        await this._query(
            `INSERT INTO qa_tc_preconditions (tc_id, prc_id) VALUES (?, ?)
             ON CONFLICT (tc_id, prc_id) DO NOTHING`, [tcId, prcId]
        );
    }
}

class PostgresProjectSequenceRepository extends ProjectSequenceRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async increment(projectId, prefix, exec) {
        const r = await this._query(
            `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, 1)
             ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
             RETURNING last_number`, [projectId, prefix]
        );
        return r.rows[0].last_number;
    }
    async incrementBy(projectId, prefix, count, exec) {
        const r = await this._query(
            `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, ?)
             ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + ?
             RETURNING last_number`, [projectId, prefix, count, count]
        );
        return r.rows[0].last_number;
    }
}

class PostgresJiraConfigsRepository extends JiraConfigsRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findByProjectId(projectId, exec) {
        const r = await this._query(
            `SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]
        );
        return r.rows[0] || null;
    }
    async existsForProject(projectId, exec) {
        const r = await this._query(
            `SELECT project_id FROM qa_jira_configs WHERE project_id = ?`, [projectId]
        );
        return r.rows.length > 0;
    }
    async create({ projectId, jiraDomain, jiraProjectKey }, exec) {
        await this._query(
            `INSERT INTO qa_jira_configs (project_id, jira_domain, jira_project_key) VALUES (?, ?, ?)`,
            [projectId, jiraDomain, jiraProjectKey]
        );
    }
    async updateByProject({ projectId, jiraDomain, jiraProjectKey }, exec) {
        await this._query(
            `UPDATE qa_jira_configs SET jira_domain = ?, jira_project_key = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`,
            [jiraDomain, jiraProjectKey, projectId]
        );
    }
}

class PostgresJiraUserConfigsRepository extends JiraUserConfigsRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async findByProjectAndUser(projectId, userId, exec) {
        const r = await this._query(
            `SELECT jira_user_email, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0] || null;
    }
    async existsForProjectAndUser(projectId, userId, exec) {
        const r = await this._query(
            `SELECT id FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]
        );
        return r.rows.length > 0;
    }
    async findEmailByProjectAndUser(projectId, userId, exec) {
        const r = await this._query(
            `SELECT jira_user_email FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0]?.jira_user_email || null;
    }
    async findTokenByProjectAndUser(projectId, userId, exec) {
        const r = await this._query(
            `SELECT id, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0] || null;
    }
    async create({ projectId, userId, jiraUserEmail, encryptedToken }, exec) {
        await this._query(
            `INSERT INTO qa_jira_user_configs (project_id, user_id, jira_user_email, encrypted_token) VALUES (?, ?, ?, ?)`,
            [projectId, userId, jiraUserEmail, encryptedToken]
        );
    }
    async updateByProjectAndUser({ projectId, userId, jiraUserEmail, encryptedToken }, exec) {
        await this._query(
            `UPDATE qa_jira_user_configs SET jira_user_email = ?, encrypted_token = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND user_id = ?`,
            [jiraUserEmail, encryptedToken, projectId, userId]
        );
    }
    async deleteByProjectAndUser(projectId, userId, exec) {
        await this._query(
            `DELETE FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]
        );
    }
}

module.exports = {
    PostgresAttachmentRepository,
    PostgresDefectRepository,
    PostgresPreconditionRepository,
    PostgresTcPreconditionsRepository,
    PostgresProjectSequenceRepository,
    PostgresJiraConfigsRepository,
    PostgresJiraUserConfigsRepository,
};
