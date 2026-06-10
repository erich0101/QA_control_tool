const projectsRepo = require('../repositories/projects.repository');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    if (req.user.role === 'Admin' || req.user.role === 'Analista QA') {
        const projects = await projectsRepo.listAll();
        return res.json({ projects });
    } else {
        const projects = await projectsRepo.listForUser(req.user.id);
        return res.json({ projects });
    }
};

exports.create = async (req, res) => {
    const { name, description } = req.body;
    if (!name) throw new ValidationError('Nombre requerido');
    const id = await projectsRepo.create({ name, description: description || '' });
    return created(res, { id });
};

exports.update = async (req, res) => {
    const { name, description, status } = req.body;
    await projectsRepo.update(req.params.id, { name, description, status });
    return ok(res);
};

exports.remove = async (req, res) => {
    await projectsRepo.remove(req.params.id);
    return ok(res);
};
