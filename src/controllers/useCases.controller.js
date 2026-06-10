const { query } = require('../config/db');
const { ForbiddenError, ValidationError } = require('../middleware/errors');
const { checkPermission } = require('../middleware/auth');
const { ok, created } = require('../utils/responses');
const { generateKey } = require('../utils/keyGenerator');

exports.list = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) throw new ValidationError('project_id requerido');

    const result = await query(`
        SELECT cu.*,
            (SELECT COUNT(*) FROM qa_user_stories WHERE use_case_id = cu.id) as us_count
        FROM qa_use_cases cu
        WHERE cu.project_id = ?
        ORDER BY cu.id DESC
    `, [project_id]);

    return res.json({ useCases: result.rows });
};

exports.create = async (req, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        const allowed = await checkPermission(req.user.id, 'can_create_cu');
        if (!allowed) throw new ForbiddenError('No tienes permiso para crear Casos de Uso');
    }

    const { project_id, key_id, title, description } = req.body;
    if (!project_id || !title) throw new ValidationError('project_id y title requeridos');

    const finalKeyId = key_id || await generateKey(project_id, 'CU');
    const result = await query(
        `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [project_id, finalKeyId, title, description || '', req.user.id, req.user.id]
    );
    return created(res, { id: result.lastID, key_id: finalKeyId });
};

exports.update = async (req, res) => {
    const { title, description, status, key_id } = req.body;
    await query(`UPDATE qa_use_cases SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), key_id = COALESCE(?, key_id), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, description, status, key_id, req.user.id, req.params.id]);
    return ok(res);
};

exports.remove = async (req, res) => {
    await query(`DELETE FROM qa_use_cases WHERE id = ?`, [req.params.id]);
    return ok(res);
};
