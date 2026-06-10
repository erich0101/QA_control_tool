const defectsRepo = require('../repositories/defects.repository');
const { ok } = require('../utils/responses');

exports.list = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

    const defects = await defectsRepo.listByProject(project_id);
    res.json({ defects });
};

exports.create = async (req, res) => {
    const { execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact } = req.body;
    if (!execution_id || !title) return res.status(400).json({ error: 'execution_id y title son requeridos' });

    const jira_epic_key = await defectsRepo.findEpicKeyByExecution(execution_id) || '';

    const defect_id = await defectsRepo.create({
        executionId: execution_id, title, description: description || '', severity: severity || 'Media',
        stepsToReproduce: steps_to_reproduce || '', expectedResult: expected_result || '',
        actualResult: actual_result || '', frequency: frequency || 'Siempre',
        businessImpact: business_impact || '', status: 'OPEN', jiraEpicKey: jira_epic_key
    });
    res.json({ ok: true, defect_id });
};

exports.updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status requerido' });
    await defectsRepo.updateStatus(req.params.id, status);
    return ok(res);
};

exports.assign = async (req, res) => {
    const { assigned_to } = req.body;
    await defectsRepo.assign(req.params.id, assigned_to || null);
    return ok(res);
};
