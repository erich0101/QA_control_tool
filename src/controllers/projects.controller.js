const { projects } = require('../repositories');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    if (req.user.role === 'Admin' || req.user.role === 'Analista QA') {
        const rows = await projects.listAll();
        return res.json({ projects: rows });
    } else {
        const rows = await projects.listForUser(req.user.id);
        return res.json({ projects: rows });
    }
};

exports.create = async (req, res) => {
    const { name, description } = req.body;
    if (!name) throw new ValidationError('Nombre requerido');
    const id = await projects.create({ name, description: description || '' });
    return created(res, { id });
};

exports.update = async (req, res) => {
    const { name, description, status } = req.body;
    await projects.update(req.params.id, { name, description, status });
    return ok(res);
};

exports.remove = async (req, res) => {
    await projects.remove(req.params.id);
    return ok(res);
};
