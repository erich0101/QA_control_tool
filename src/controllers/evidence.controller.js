const { attachments, executions } = require('../repositories');

exports.getEvidence = async (req, res) => {
    const row = await attachments.findBinaryAsBase64(req.params.id);
    if (!row) return res.status(404).json({ error: 'Evidencia no encontrada' });

    res.setHeader('Content-Type', row.mime_type);
    res.send(Buffer.from(row.file_b64, 'base64'));
};

exports.uploadEvidence = async (req, res) => {
    const { tc_id, category } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

    const latestExec = await executions.findLatestByTc(tc_id);
    if (!latestExec) return res.status(400).json({ error: 'No hay una ejecución reciente para este Test Case' });

    const executionId = latestExec.id;

    await attachments.create({
        executionId, fileName: file.originalname, mimeType: file.mimetype,
        fileData: file.buffer, evidenceCategory: category || 'GENERAL'
    });

    res.json({ ok: true });
};

exports.deleteEvidence = async (req, res) => {
    const existing = await attachments.findBinary(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Evidencia no encontrada' });
    await attachments.remove(req.params.id);
    res.json({ ok: true });
};
