const { query } = require('../config/db');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    if (req.user.role === 'Admin' || req.user.role === 'Analista QA') {
        const result = await query(`SELECT * FROM qa_projects ORDER BY id DESC`);
        return res.json({ projects: result.rows });
    } else {
        const result = await query(`
            SELECT p.* FROM qa_projects p
            JOIN qa_project_users pu ON p.id = pu.project_id
            WHERE pu.user_id = ? ORDER BY p.id DESC
        `, [req.user.id]);
        return res.json({ projects: result.rows });
    }
};

exports.create = async (req, res) => {
    const { name, description } = req.body;
    if (!name) throw new ValidationError('Nombre requerido');
    const result = await query(`INSERT INTO qa_projects (name, description) VALUES (?, ?)`, [name, description || '']);
    return created(res, { id: result.lastID });
};

exports.update = async (req, res) => {
    const { name, description, status } = req.body;
    await query(`UPDATE qa_projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
        [name, description, status, req.params.id]);
    return ok(res);
};

exports.remove = async (req, res) => {
    await query(`DELETE FROM qa_projects WHERE id = ?`, [req.params.id]);
    return ok(res);
};
