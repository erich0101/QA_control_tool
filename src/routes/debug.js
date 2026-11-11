const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getJiraUserCredentials } = require('../lib/jira-credentials');
const JiraService = require('../../jira-service');

const router = express.Router();

router.get('/jira-test', requireAuth, async (req, res) => {
    try {
        const { projectId, jql } = req.query;
        if (!projectId || !jql) {
            return res.status(400).json({ error: 'projectId y jql son requeridos' });
        }
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const results = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
        const first = results.length > 0 ? results[0] : null;
        res.json({ total: results.length, jqlUsed: jql, creds: { projectKey: creds.projectKey, domain: creds.domain }, firstIssue: first ? { key: first.key, id: first.id, projectKey: first.fields?.project?.key, fields: first.fields } : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
