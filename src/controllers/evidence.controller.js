const { query } = require('../config/db');

exports.getEvidence = async (req, res) => {
    const result = await query(`SELECT mime_type, file_data FROM qa_attachments WHERE id = ?`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });

    const row = result.rows[0];
    res.setHeader('Content-Type', row.mime_type);
    res.send(row.file_data);
};

exports.uploadEvidence = async (req, res) => {
    const { tc_id, category } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

    const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc_id]);
    if (execRes.rows.length === 0) return res.status(400).json({ error: 'No hay una ejecución reciente para este Test Case' });

    const executionId = execRes.rows[0].id;

    await query(`
        INSERT INTO qa_attachments (execution_id, file_name, mime_type, file_data, evidence_category)
        VALUES (?, ?, ?, ?, ?)
    `, [executionId, file.originalname, file.mimetype, file.buffer, category || 'GENERAL']);

    res.json({ ok: true });
};

exports.deleteEvidence = async (req, res) => {
    const result = await query(`DELETE FROM qa_attachments WHERE id = ?`, [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
    res.json({ ok: true });
};
