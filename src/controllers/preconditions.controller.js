const { query } = require('../config/db');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    const { us_id } = req.query;
    if (!us_id) throw new ValidationError('us_id requerido');

    const result = await query(`
        SELECT DISTINCT p.* FROM qa_preconditions p
        JOIN qa_tc_preconditions tp ON tp.prc_id = p.id
        JOIN qa_test_cases tc ON tc.id = tp.tc_id
        JOIN qa_test_suites ts ON ts.id = tc.suite_id
        WHERE ts.us_id = ?
        ORDER BY p.id
    `, [us_id]);

    const all = await query(`SELECT * FROM qa_preconditions ORDER BY id`);

    return res.json({ linked: result.rows, all: all.rows });
};

exports.create = async (req, res) => {
    const { title, description, system_state } = req.body;
    if (!title) throw new ValidationError('title requerido');
    const result = await query(`INSERT INTO qa_preconditions (title, description, system_state) VALUES (?, ?, ?)`,
        [title, description || '', system_state || '']);
    return created(res, { id: result.lastID });
};

exports.link = async (req, res) => {
    const { tc_id, prc_id } = req.body;
    await query(`INSERT INTO qa_tc_preconditions (tc_id, prc_id) VALUES (?, ?) ON CONFLICT (tc_id, prc_id) DO NOTHING`, [tc_id, prc_id]);
    return ok(res);
};

exports.remove = async (req, res) => {
    await query(`DELETE FROM qa_preconditions WHERE id = ?`, [req.params.id]);
    return ok(res);
};
