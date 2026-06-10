const { query } = require('../config/db');
const { ForbiddenError, ValidationError } = require('../middleware/errors');
const { checkPermission } = require('../middleware/auth');
const { ok, created } = require('../utils/responses');
const { generateKey, getProjectIdFromUC } = require('../utils/keyGenerator');

exports.list = async (req, res) => {
    const { use_case_id } = req.query;
    if (!use_case_id) throw new ValidationError('use_case_id requerido');

    const stories = await query(`
        SELECT us.*,
            (SELECT COUNT(*) FROM qa_test_cases WHERE us_id = us.id) as test_count,
            COALESCE((
                SELECT json_agg(s ORDER BY s.order_index)
                FROM qa_scenarios s
                WHERE s.us_id = us.id
            ), '[]') as scenarios,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'id', i.id, 'title', i.title, 'description', i.description, 'severity', COALESCE(i.severity, 'Alta')
                ) ORDER BY i.order_index)
                FROM qa_inconsistencias i
                JOIN qa_test_suites s ON i.suite_id = s.id
                JOIN qa_test_cases tc ON tc.suite_id = s.id
                WHERE tc.us_id = us.id
            ), '[]') as inconsistencies,
            us.recommendations
        FROM qa_user_stories us
        WHERE us.use_case_id = ?
        ORDER BY us.id DESC
    `, [use_case_id]);

    return res.json({ userStories: stories.rows });
};

exports.createScenario = async (req, res) => {
    const { us_id, title, description, order_index } = req.body;
    if (!us_id || !title) throw new ValidationError('us_id y title requeridos');

    const result = await query(`
        INSERT INTO qa_scenarios (us_id, title, description, order_index)
        VALUES (?, ?, ?, ?)
    `, [us_id, title, description || '', order_index || 0]);

    return created(res, { id: result.lastID });
};

exports.updateScenario = async (req, res) => {
    const { title, description, order_index } = req.body;
    const scenarioId = req.params.id;

    await query(`
        UPDATE qa_scenarios
        SET title = COALESCE(?, title),
            description = COALESCE(?, description),
            order_index = COALESCE(?, order_index)
        WHERE id = ?
    `, [title, description, order_index, scenarioId]);

    if (title !== undefined) {
        await query(`UPDATE qa_test_cases SET title = ? WHERE scenario_id = ?`, [title, scenarioId]);
    }

    return ok(res);
};

exports.deleteScenario = async (req, res) => {
    await query(`DELETE FROM qa_scenarios WHERE id = ?`, [req.params.id]);
    return ok(res);
};

exports.createInconsistency = async (req, res) => {
    const { suite_id, us_id, title, description, severity, order_index } = req.body;
    if (!title) throw new ValidationError('title requerido');
    if (!suite_id && !us_id) throw new ValidationError('suite_id o us_id requerido');

    const result = await query(`
        INSERT INTO qa_inconsistencias (suite_id, us_id, title, description, severity, order_index)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [suite_id || null, us_id || null, title, description || '', severity || 'Alta', order_index || 0]);

    return created(res, { id: result.lastID });
};

exports.updateInconsistency = async (req, res) => {
    const { title, description, severity, order_index } = req.body;
    await query(`
        UPDATE qa_inconsistencias
        SET title = COALESCE(?, title),
            description = COALESCE(?, description),
            severity = COALESCE(?, severity),
            order_index = COALESCE(?, order_index)
        WHERE id = ?
    `, [title, description, severity, order_index, req.params.id]);
    return ok(res);
};

exports.deleteInconsistency = async (req, res) => {
    await query(`DELETE FROM qa_inconsistencias WHERE id = ?`, [req.params.id]);
    return ok(res);
};

exports.createUserStory = async (req, res) => {
    if (!(await checkPermission(req.user.id, 'can_create_hu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        throw new ForbiddenError('Permisos insuficientes');
    }
    const { use_case_id, key_id, title, hu_detallada, priority, status,
            escenarios_prueba, reglas_negocio, precondiciones, link_documentacion } = req.body;
    if (!use_case_id || !title) throw new ValidationError('use_case_id y title requeridos');

    const projectId = await getProjectIdFromUC(use_case_id);
    const finalKeyId = key_id || await generateKey(projectId, 'HU');
    const result = await query(
        `INSERT INTO qa_user_stories (use_case_id, key_id, title, hu_detallada, priority, status, escenarios_prueba, reglas_negocio, precondiciones, link_documentacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [use_case_id, finalKeyId, title, hu_detallada || '', priority || 'Media', status || 'En Análisis',
         escenarios_prueba || '', reglas_negocio || '', precondiciones || '', link_documentacion || '', req.user.id, req.user.id]
    );
    const usId = result.lastID;

    if (hu_detallada) {
        await query(`INSERT INTO qa_inconsistencias (us_id, title, order_index) VALUES (?, ?, 0)`, [usId, hu_detallada]);
    }

    return created(res, { id: usId, key_id: finalKeyId });
};

exports.updateRecommendations = async (req, res) => {
    const { recommendations } = req.body;
    if (!Array.isArray(recommendations)) throw new ValidationError('recommendations debe ser un array');
    await query(`UPDATE qa_user_stories SET recommendations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [JSON.stringify(recommendations), req.params.id]);
    return ok(res);
};

exports.updateUserStory = async (req, res) => {
    const usId = req.params.id;
    const allowedFields = [
        'title', 'status', 'priority', 'key_id',
        'hu_detallada', 'escenarios_prueba', 'reglas_negocio',
        'precondiciones', 'link_documentacion', 'recommendations'
    ];

    const fields = [];
    const params = [];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(req.body[field]);
        }
    });

    if (fields.length === 0) {
        return ok(res, { message: 'No fields to update' });
    }

    fields.push(`updated_by = ?`);
    params.push(req.user.id);
    params.push(usId);

    await query(`UPDATE qa_user_stories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
    return ok(res);
};

exports.deleteUserStory = async (req, res) => {
    await query(`DELETE FROM qa_user_stories WHERE id = ?`, [req.params.id]);
    return ok(res);
};
