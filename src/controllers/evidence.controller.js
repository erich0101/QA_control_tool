const { attachments, executions } = require('../repositories');
const { ok } = require('../utils/responses');
const { ValidationError, NotFoundError } = require('../middleware/errors');

exports.getEvidence = async (req, res) => {
    const row = await attachments.findBinaryAsBase64(req.params.id);
    if (!row) throw new NotFoundError('Evidencia no encontrada');

    res.setHeader('Content-Type', row.mime_type);
    res.send(Buffer.from(row.file_b64, 'base64'));
};

exports.uploadEvidence = async (req, res) => {
    const { tc_id, category } = req.body;
    const file = req.file;
    if (!file) throw new ValidationError('No se recibió ningún archivo. Asegurate de enviar el campo "evidence".');

    const latestExec = await executions.findLatestByTc(tc_id);
    if (!latestExec) {
        throw new ValidationError(
            'No hay una ejecución reciente para este Test Case',
            { tc_id, hint: 'Ejecutá el caso de prueba antes de adjuntar evidencia' }
        );
    }

    const executionId = latestExec.id;
    const attachmentId = await attachments.create({
        executionId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileData: file.buffer,
        evidenceCategory: category || 'GENERAL',
    });

    return ok(res, {
        id: attachmentId,
        executionId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        category: category || 'GENERAL',
    });
};

exports.deleteEvidence = async (req, res) => {
    const existing = await attachments.findBinary(req.params.id);
    if (!existing) throw new NotFoundError('Evidencia no encontrada');
    await attachments.remove(req.params.id);
    return ok(res, { id: parseInt(req.params.id, 10) });
};
