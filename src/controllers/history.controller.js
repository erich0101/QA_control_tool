const { query } = require('../config/db');

exports.getHistory = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

    const runs = await query(`
        SELECT r.*, s.title as suite_title, u.name as tester_name
        FROM qa_test_runs r
        JOIN qa_test_suites s ON r.suite_id = s.id
        JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_users u ON r.created_by = u.id
        WHERE uc.project_id = ? AND r.status = 'FINISHED'
        ORDER BY r.finished_at DESC
    `, [project_id]);

    const result = [];
    for (const run of runs.rows) {
        const execs = await query(`SELECT status FROM qa_executions WHERE run_id = ?`, [run.id]);
        result.push({
            ...run,
            stats: {
                total: execs.rows.length,
                pass: execs.rows.filter(e => e.status === 'PASS' || e.status === 'OK').length,
                fail: execs.rows.filter(e => e.status === 'FAIL').length,
                warn: execs.rows.filter(e => e.status === 'WARNING').length,
                block: execs.rows.filter(e => e.status === 'BLOCK').length,
                skipped: execs.rows.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
            }
        });
    }

    res.json({ runs: result });
};

exports.getRunBugs = async (req, res) => {
    const bugs = await query(`
        SELECT b.*, tc.title as tc_title
        FROM qa_defects b
        JOIN qa_executions e ON b.execution_id = e.id
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        WHERE e.run_id = ?
    `, [req.params.id]);
    res.json({ bugs: bugs.rows });
};
