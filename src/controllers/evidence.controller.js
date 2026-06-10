const attachmentsRepo = require('../repositories/attachments.repository');
const executionsRepo = require('../repositories/executions.repository');

exports.getEvidence = async (req, res) => {
    const row = await attachmentsRepo.findBinary(req.params.id);
    if (!row) return res.status(404).json({ error: 'Evidencia no encontrada' });

    res.setHeader('Content-Type', row.mime_type);
    res.send(row.file_data);
};

exports.uploadEvidence = async (req, res) => {
    const { tc_id, category } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

    const latestExec = await executionsRepo.findLatestByTc(tc_id);
    if (!latestExec) return res.status(400).json({ error: 'No hay una ejecución reciente para este Test Case' });

    const executionId = latestExec.id;

    await attachmentsRepo.create({
        executionId, fileName: file.originalname, mimeType: file.mimetype,
        fileData: file.buffer, evidenceCategory: category || 'GENERAL'
    });

    res.json({ ok: true });
};

exports.deleteEvidence = async (req, res) => {
    const existing = await attachmentsRepo.findBinary(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Evidencia no encontrada' });
    await attachmentsRepo.remove(req.params.id);
    res.json({ ok: true });
};
