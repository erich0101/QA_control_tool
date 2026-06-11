const { useCases } = require('../repositories');
const { ForbiddenError, ValidationError } = require('../middleware/errors');
const { checkPermission } = require('../middleware/auth');
const { ok, created } = require('../utils/responses');
const { generateKey } = require('../utils/keyGenerator');

exports.list = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) throw new ValidationError('project_id requerido');

    const rows = await useCases.listByProjectWithUSCount(project_id);

    return res.json({ useCases: rows });
};

exports.create = async (req, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        const allowed = await checkPermission(req.user.id, 'can_create_cu');
        if (!allowed) throw new ForbiddenError('No tienes permiso para crear Casos de Uso');
    }

    const { project_id, key_id, title, description } = req.body;
    if (!project_id || !title) throw new ValidationError('project_id y title requeridos');

    const finalKeyId = key_id || await generateKey(project_id, 'CU');
    const id = await useCases.create({
        projectId: project_id, keyId: finalKeyId, title,
        description: description || '',
        createdBy: req.user.id, updatedBy: req.user.id
    });
    return created(res, { id, key_id: finalKeyId });
};

exports.update = async (req, res) => {
    const { title, description, status, key_id } = req.body;
    await useCases.update(req.params.id, {
        title, description, status, keyId: key_id, updatedBy: req.user.id
    });
    return ok(res);
};

exports.remove = async (req, res) => {
    await useCases.remove(req.params.id);
    return ok(res);
};
