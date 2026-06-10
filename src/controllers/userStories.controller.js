const userStoriesRepo = require('../repositories/userStories.repository');
const scenariosRepo = require('../repositories/scenarios.repository');
const inconsistenciasRepo = require('../repositories/inconsistencias.repository');
const { ForbiddenError, ValidationError } = require('../middleware/errors');
const { checkPermission } = require('../middleware/auth');
const { ok, created } = require('../utils/responses');
const { generateKey, getProjectIdFromUC } = require('../utils/keyGenerator');

exports.list = async (req, res) => {
    const { use_case_id } = req.query;
    if (!use_case_id) throw new ValidationError('use_case_id requerido');

    const userStories = await userStoriesRepo.listByUseCase(use_case_id);

    return res.json({ userStories });
};

exports.createScenario = async (req, res) => {
    const { us_id, title, description, order_index } = req.body;
    if (!us_id || !title) throw new ValidationError('us_id y title requeridos');

    const id = await scenariosRepo.create({
        usId: us_id, title, description: description || '', orderIndex: order_index || 0
    });

    return created(res, { id });
};

exports.updateScenario = async (req, res) => {
    const { title, description, order_index } = req.body;
    const scenarioId = req.params.id;

    await scenariosRepo.update(scenarioId, { title, description, orderIndex: order_index });

    if (title !== undefined) {
        await scenariosRepo.updateTitle(scenarioId, title);
    }

    return ok(res);
};

exports.deleteScenario = async (req, res) => {
    await scenariosRepo.remove(req.params.id);
    return ok(res);
};

exports.createInconsistency = async (req, res) => {
    const { suite_id, us_id, title, description, severity, order_index } = req.body;
    if (!title) throw new ValidationError('title requerido');
    if (!suite_id && !us_id) throw new ValidationError('suite_id o us_id requerido');

    const id = await inconsistenciasRepo.create({
        suiteId: suite_id, usId: us_id, title,
        description: description || '', severity: severity || 'Alta', orderIndex: order_index || 0
    });

    return created(res, { id });
};

exports.updateInconsistency = async (req, res) => {
    const { title, description, severity, order_index } = req.body;
    await inconsistenciasRepo.update(req.params.id, { title, description, severity, orderIndex: order_index });
    return ok(res);
};

exports.deleteInconsistency = async (req, res) => {
    await inconsistenciasRepo.remove(req.params.id);
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
    const usId = await userStoriesRepo.create({
        useCaseId: use_case_id, projectId, keyId: finalKeyId, title,
        huDetallada: hu_detallada || '', priority: priority || 'Media', status: status || 'En Análisis',
        escenariosPrueba: escenarios_prueba || '', reglasNegocio: reglas_negocio || '',
        precondiciones: precondiciones || '', linkDocumentacion: link_documentacion || '',
        createdBy: req.user.id, updatedBy: req.user.id
    });

    if (hu_detallada) {
        await inconsistenciasRepo.createForUS(usId, hu_detallada);
    }

    return created(res, { id: usId, key_id: finalKeyId });
};

exports.updateRecommendations = async (req, res) => {
    const { recommendations } = req.body;
    if (!Array.isArray(recommendations)) throw new ValidationError('recommendations debe ser un array');
    await userStoriesRepo.updateRecommendations(req.params.id, JSON.stringify(recommendations));
    return ok(res);
};

exports.updateUserStory = async (req, res) => {
    const usId = req.params.id;
    const allowedFields = [
        'title', 'status', 'priority', 'key_id',
        'hu_detallada', 'escenarios_prueba', 'reglas_negocio',
        'precondiciones', 'link_documentacion', 'recommendations'
    ];

    const fields = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            fields[field] = req.body[field];
        }
    }

    if (Object.keys(fields).length === 0) {
        return ok(res, { message: 'No fields to update' });
    }

    await userStoriesRepo.updateDynamicWithUpdatedBy(usId, fields, req.user.id);
    return ok(res);
};

exports.deleteUserStory = async (req, res) => {
    await userStoriesRepo.remove(req.params.id);
    return ok(res);
};
