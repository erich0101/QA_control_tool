const sharp = require('sharp');
const { getClient } = require('../config/db');
const { ok } = require('../utils/responses');
const { generateKey, getProjectIdFromSuite } = require('../utils/keyGenerator');
const { ValidationError } = require('../middleware/errors');

async function saveAttachment(client, execId, defectId, fileObj, category) {
    let finalBuffer = fileObj.buffer;
    let mime = fileObj.mimetype;
    let filename = fileObj.originalname;

    if (mime.startsWith('image/')) {
        finalBuffer = await sharp(fileObj.buffer)
            .webp({ quality: 80 })
            .toBuffer();
        mime = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
    }

    await client.query(
        `INSERT INTO qa_attachments (execution_id, defect_id, file_name, mime_type, evidence_category, file_data) VALUES (?, ?, ?, ?, ?, ?)`,
        [execId, defectId, filename, mime, category, finalBuffer]
    );
}

exports.createIssue = async (req, res, next) => {
    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        const fields = req.body;
        const files = req.files || [];

        const suiteId = fields.suite_id;
        if (!suiteId) throw new ValidationError("suite_id requerido");

        if (fields.test_list_v2) {
            const listV2 = JSON.parse(fields.test_list_v2);
            for (const t of listV2) {
                if (t.isSection) continue;

                let tcId = t.id;
                if (!tcId) {
                    const projectId = await getProjectIdFromSuite(suiteId);
                    const finalKeyId = await generateKey(projectId, 'TC');
                    const tcRes = await q(`INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`, [suiteId, t.title || 'Sin título', finalKeyId]);
                    tcId = tcRes.lastID;
                } else {
                    await q(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [t.title || 'Sin título', tcId]);
                }

                let execId;
                const execRes = await q(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]);
                if (execRes.rows.length > 0) {
                    execId = execRes.rows[0].id;
                    await q(`UPDATE qa_executions SET status = ? WHERE id = ?`, [t.status || 'PENDING', execId]);
                } else {
                    const newExecRes = await q(`INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`, [tcId, t.status || 'PENDING']);
                    execId = newExecRes.rows[0].id;
                }

                if (t.sbs && t.sbs.length > 0) {
                    const row = t.sbs[0];

                    const processCategory = async (attData, category) => {
                        if (!attData) return;
                        if (attData.pending) {
                            await q(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                            const file = files.find(f => f.fieldname === attData.pending);
                            if (file) await saveAttachment(client, execId, null, file, category);
                        } else if (!attData.src) {
                            await q(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                        }
                    };

                    await processCategory(row.figma, 'FIGMA');
                    await processCategory(row.dev, 'DEV');
                }
            }
        }

        await q('COMMIT');
        return ok(res, { message: 'Guardado correctamente' });

    } catch (err) {
        await q('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
};
