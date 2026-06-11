const JiraService = require('../../jira-service');
const { defects, jiraConfigs, jiraUserConfigs, attachments, projectSequences } = require('../repositories');
const { checkPermission } = require('../services/key.service');
const { ok, created } = require('../utils/responses');
const { ForbiddenError } = require('../middleware/errors');

async function getJiraUserCredentials(projectId, userId) {
    const [proj, userCfg] = await Promise.all([
        jiraConfigs.findByProjectId(projectId),
        jiraUserConfigs.findByProjectAndUser(projectId, userId)
    ]);
    if (!proj) return { error: 'Jira no configurado para este proyecto', code: 'NO_PROJECT_CONFIG' };
    if (!userCfg) return { error: 'Configura tu token de Jira en tu perfil', code: 'NO_USER_TOKEN' };
    return {
        projectKey: proj.jira_project_key,
        domain: proj.jira_domain,
        userCredentials: userCfg
    };
}

exports.list = async (req, res) => {
    const { project_id } = req.query;
    const rows = await defects.listHallazgosByProject(project_id);
    return res.json({ hallazgos: rows });
};

exports.create = async (req, res) => {
    if (!(await checkPermission(req.user.id, 'can_create_cu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        throw new ForbiddenError('Permisos insuficientes');
    }
    const { project_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to } = req.body;

    const id = await defects.create({
        projectId: project_id,
        title,
        description: description || '',
        severity: severity || 'Media',
        stepsToReproduce: steps_to_reproduce || '',
        expectedResult: expected_result || '',
        actualResult: actual_result || '',
        frequency: frequency || 'Siempre',
        businessImpact: business_impact || '',
        preconditions: preconditions || '',
        observations: observations || '',
        assignedTo: assigned_to || null,
        status: 'OPEN',
        createdBy: req.user.id
    });
    return res.json({ ok: true, id });
};

exports.update = async (req, res) => {
    const fields = req.body;
    await defects.update(req.params.id, fields);
    return ok(res);
};

exports.remove = async (req, res) => {
    await defects.remove(req.params.id);
    return ok(res);
};

exports.updateStatus = async (req, res) => {
    const { status } = req.body;
    await defects.updateStatus(req.params.id, status);
    return ok(res);
};

exports.assign = async (req, res) => {
    const { assigned_to } = req.body;
    await defects.assign(req.params.id, assigned_to || null);
    return ok(res);
};

exports.convertToTC = async (req, res) => {
    const { suite_id } = req.body;
    const result = await defects.convertToTC(
        req.params.id,
        suite_id,
        req.user.id,
        (projectId, prefix, exec) => projectSequences.increment(projectId, prefix, exec)
    );
    return res.json({ ok: true, tc_id: result.tc_id, key_id: result.key_id });
};

exports.createJiraTicket = async (req, res) => {
    const hallazgoId = req.params.id;
    const { epicId, assigneeId, priorityId, customFields } = req.body;

    const bug = await defects.findHallazgoById(hallazgoId);
    if (!bug) return res.status(404).json({ error: 'Hallazgo no encontrado.' });

    const projectId = bug.project_id;
    const evidenceRes = await defects.listEvidence(hallazgoId);
    if (evidenceRes.length > 0) {
        bug.evidences = evidenceRes.map(r => r.file_name);
    }

    const creds = await getJiraUserCredentials(projectId, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

    const jiraResult = await JiraService.createIssue(creds.userCredentials, creds.projectKey, creds.domain, bug, epicId, assigneeId, priorityId, customFields);
    const jiraUrl = `${jiraResult.self.split('/rest/')[0]}/browse/${jiraResult.key}`;

    let attachmentCount = 0;
    const attachmentErrors = [];
    if (evidenceRes.length > 0) {
        for (const ev of evidenceRes) {
            try {
                const binary = await attachments.findBinary(ev.id);
                if (!binary) continue;
                await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, binary.file_data, ev.mime_type);
                attachmentCount++;
            } catch (attachErr) {
                attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
            }
        }
    }

    await defects.linkToJiraTicket(hallazgoId, { jiraKey: jiraResult.key, jiraUrl });

    return res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
};

exports.getEvidence = async (req, res) => {
    const rows = await defects.listEvidence(req.params.id);
    return res.json({ evidencia: rows });
};
