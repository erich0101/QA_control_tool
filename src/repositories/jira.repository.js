'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

const jiraConfigs = {
    async findByProjectId(projectId, exec) {
        const r = await executor(exec).query(
            `SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]
        );
        return r.rows[0] || null;
    },
    async existsForProject(projectId, exec) {
        const r = await executor(exec).query(
            `SELECT project_id FROM qa_jira_configs WHERE project_id = ?`, [projectId]
        );
        return r.rows.length > 0;
    },
    async create({ projectId, jiraDomain, jiraProjectKey }, exec) {
        await executor(exec).query(
            `INSERT INTO qa_jira_configs (project_id, jira_domain, jira_project_key) VALUES (?, ?, ?)`,
            [projectId, jiraDomain, jiraProjectKey]
        );
    },
    async updateByProject({ projectId, jiraDomain, jiraProjectKey }, exec) {
        await executor(exec).query(
            `UPDATE qa_jira_configs SET jira_domain = ?, jira_project_key = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`,
            [jiraDomain, jiraProjectKey, projectId]
        );
    }
};

const jiraUserConfigs = {
    async findByProjectAndUser(projectId, userId, exec) {
        const r = await executor(exec).query(
            `SELECT jira_user_email, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0] || null;
    },
    async existsForProjectAndUser(projectId, userId, exec) {
        const r = await executor(exec).query(
            `SELECT id FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]
        );
        return r.rows.length > 0;
    },
    async findEmailByProjectAndUser(projectId, userId, exec) {
        const r = await executor(exec).query(
            `SELECT jira_user_email FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0]?.jira_user_email || null;
    },
    async findTokenByProjectAndUser(projectId, userId, exec) {
        const r = await executor(exec).query(
            `SELECT id, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return r.rows[0] || null;
    },
    async create({ projectId, userId, jiraUserEmail, encryptedToken }, exec) {
        await executor(exec).query(
            `INSERT INTO qa_jira_user_configs (project_id, user_id, jira_user_email, encrypted_token) VALUES (?, ?, ?, ?)`,
            [projectId, userId, jiraUserEmail, encryptedToken]
        );
    },
    async updateByProjectAndUser({ projectId, userId, jiraUserEmail, encryptedToken }, exec) {
        await executor(exec).query(
            `UPDATE qa_jira_user_configs SET jira_user_email = ?, encrypted_token = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND user_id = ?`,
            [jiraUserEmail, encryptedToken, projectId, userId]
        );
    },
    async deleteByProjectAndUser(projectId, userId, exec) {
        await executor(exec).query(
            `DELETE FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]
        );
    }
};

module.exports = { jiraConfigs, jiraUserConfigs };
