const { preconditions } = require('../repositories');
const { ValidationError } = require('../middleware/errors');
const { ok, created } = require('../utils/responses');

exports.list = async (req, res) => {
    const { us_id } = req.query;
    if (!us_id) throw new ValidationError('us_id requerido');

    const linked = await preconditions.listLinkedByUS(us_id);
    const all = await preconditions.listAll();

    return res.json({ linked, all });
};

exports.create = async (req, res) => {
    const { title, description, system_state } = req.body;
    if (!title) throw new ValidationError('title requerido');
    const id = await preconditions.create({
        title, description: description || '', systemState: system_state || ''
    });
    return created(res, { id });
};

exports.link = async (req, res) => {
    const { tc_id, prc_id } = req.body;
    await preconditions.tcPreconditions.link(tc_id, prc_id);
    return ok(res);
};

exports.remove = async (req, res) => {
    await preconditions.remove(req.params.id);
    return ok(res);
};
