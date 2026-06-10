const preconditionsRepo = require('../repositories/preconditions.repository');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    const { us_id } = req.query;
    if (!us_id) throw new ValidationError('us_id requerido');

    const linked = await preconditionsRepo.listLinkedByUS(us_id);
    const all = await preconditionsRepo.listAll();

    return res.json({ linked, all });
};

exports.create = async (req, res) => {
    const { title, description, system_state } = req.body;
    if (!title) throw new ValidationError('title requerido');
    const id = await preconditionsRepo.create({
        title, description: description || '', systemState: system_state || ''
    });
    return created(res, { id });
};

exports.link = async (req, res) => {
    const { tc_id, prc_id } = req.body;
    await preconditionsRepo.tcPreconditions.link(tc_id, prc_id);
    return ok(res);
};

exports.remove = async (req, res) => {
    await preconditionsRepo.remove(req.params.id);
    return ok(res);
};
