const { query } = require('../config/db');
const { ok } = require('../utils/responses');

exports.list = async (req, res) => {
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
};

exports.create = async (req, res) => {
    const { execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact } = req.body;
    if (!execution_id || !title) return res.status(400).json({ error: 'execution_id y title son requeridos' });

    const suiteRes = await query(`
        SELECT s.jira_epic_key
        FROM qa_test_suites s
        JOIN qa_test_cases tc ON s.id = tc.suite_id
        JOIN qa_executions e ON tc.id = e.tc_id
        WHERE e.id = ?
    `, [execution_id]);
    const jira_epic_key = suiteRes.rows[0]?.jira_epic_key || '';

    const result = await query(
        `INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
        [execution_id, title, description || '', severity || 'Media', steps_to_reproduce || '', expected_result || '', actual_result || '', frequency || 'Siempre', business_impact || '', jira_epic_key]
    );
    res.json({ ok: true, defect_id: result.lastID });
};

exports.updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status requerido' });
    await query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [status, req.params.id]);
    return ok(res);
};

exports.assign = async (req, res) => {
    const { assigned_to } = req.body;
    await query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ?`, [assigned_to || null, req.params.id]);
    return ok(res);
};
