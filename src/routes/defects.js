const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getJiraUserCredentials } = require('../lib/jira-credentials');
const JiraService = require('../../jira-service');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
    try {
        const { execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact } = req.body;
        if (!execution_id || !title) return res.status(400).json({ error: 'execution_id y title son requeridos' });

        // Heredar jira_epic_key de la suite
        const suiteRes = await query(`
            SELECT s.jira_epic_key 
            FROM qa_test_suites s
            JOIN qa_test_cases tc ON s.id = tc.suite_id
            JOIN qa_executions e ON tc.id = e.tc_id
            WHERE e.id = ?
        `, [execution_id]);
        const jira_epic_key = suiteRes.rows[0]?.jira_epic_key || '';

        const result = await query(
            `INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key, created_by, project_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
            [execution_id, title, description || '', severity || 'Media', steps_to_reproduce || '', expected_result || '', actual_result || '', frequency || 'Siempre', business_impact || '', jira_epic_key, req.user.id, req.body.project_id || null]
        );
        res.json({ ok: true, defect_id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status requerido' });
        await query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/dismiss', requireAuth, async (req, res) => {
    try {
        const { dismissed } = req.body;
        const newStatus = dismissed ? 'DISMISSED' : 'OPEN';
        const upd = await query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [newStatus, req.params.id]);
        if (upd.changes === 0) {
            return res.status(404).json({ error: 'Bug no encontrado' });
        }
        res.json({ ok: true, status: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const sql = `
            SELECT 
                d.*, 
                tc.title as tc_title, 
                tc.key_id as tc_key,
                e.tester as tester_name,
                r.id as run_id,
                assignee.name as assignee_name
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            JOIN qa_test_runs r ON e.run_id = r.id
            LEFT JOIN qa_users assignee ON d.assigned_to = assignee.id
            WHERE cu.project_id = ?
            ORDER BY d.id DESC
        `;
        const result = await query(sql, [project_id]);
        res.json({ defects: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/jira-status', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const defectsRes = await query(`
            SELECT DISTINCT d.jira_key
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            WHERE cu.project_id = ? AND d.jira_key IS NOT NULL
            UNION
            SELECT d.jira_key
            FROM qa_defects d
            WHERE d.project_id = ? AND d.jira_key IS NOT NULL
        `, [project_id, project_id]);

        if (defectsRes.rows.length === 0) return res.json({ statuses: {} });

        const configRes = await query(`
            SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?
        `, [project_id]);

        if (configRes.rows.length === 0) return res.json({ statuses: {} });
        const config = configRes.rows[0];

        const userCreds = await getJiraUserCredentials(project_id, req.user.id);
        if (userCreds.error) return res.json({ statuses: {} });

        const keys = defectsRes.rows.map(d => d.jira_key);
        const jql = `key in (${keys.map(k => `"${k}"`).join(',')})`;
        const issues = await JiraService.searchIssues(
            userCreds.userCredentials,
            config.jira_domain,
            jql,
            null,
            ['status', 'statusCategory']
        );

        const statuses = {};
        for (const issue of issues) {
            statuses[issue.key] = {
                status: issue.fields.status?.name || 'Unknown',
                statusCategory: issue.fields.statusCategory?.name || 'Unknown'
            };
        }

        res.json({ statuses });
    } catch (err) {
        console.error('Error fetching JIRA statuses:', err.message);
        res.json({ statuses: {} });
    }
});

router.put('/:id/assign', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        await query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ?`, [assigned_to || null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
