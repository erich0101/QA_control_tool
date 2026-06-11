const sharp = require('sharp');
const db = require('../db');
const { attachments, testCases, executions } = require('../repositories');
const { ok } = require('../utils/responses');
const { generateKey, getProjectIdFromSuite } = require('../utils/keyGenerator');
const { ValidationError } = require('../middleware/errors');

async function saveAttachment(exec, execId, defectId, fileObj, category) {
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

    await attachments.createWithDefect({
        executionId: execId, defectId, fileName: filename, mimeType: mime,
        evidenceCategory: category, fileData: finalBuffer
    }, exec);
}

exports.createIssue = async (req, res, next) => {
    try {
        const fields = req.body;
        const files = req.files || [];

        const suiteId = fields.suite_id;
        if (!suiteId) throw new ValidationError("suite_id requerido");

        await db.withTransaction(async (tx) => {
            if (fields.test_list_v2) {
                const listV2 = JSON.parse(fields.test_list_v2);
                for (const t of listV2) {
                    if (t.isSection) continue;

                    let tcId = t.id;
                    if (!tcId) {
                        const projectId = await getProjectIdFromSuite(suiteId);
                        const finalKeyId = await generateKey(projectId, 'TC');
                        tcId = await testCases.createMinimal({ suiteId, title: t.title || 'Sin título', keyId: finalKeyId }, tx);
                    } else {
                        await testCases.updateTitle(tcId, t.title || 'Sin título', tx);
                    }

                    let execId;
                    const latestExec = await executions.findLatestByTc(tcId, tx);
                    if (latestExec) {
                        execId = latestExec.id;
                        await executions.updateStatus(execId, t.status || 'PENDING', tx);
                    } else {
                        execId = await executions.createMinimal({ tcId, status: t.status || 'PENDING' }, tx);
                    }

                    if (t.sbs && t.sbs.length > 0) {
                        const row = t.sbs[0];

                        const processCategory = async (attData, category) => {
                            if (!attData) return;
                            if (attData.pending) {
                                await attachments.deleteByExecutionAndCategory(execId, category, tx);
                                const file = files.find(f => f.fieldname === attData.pending);
                                if (file) await saveAttachment(tx, execId, null, file, category);
                            } else if (!attData.src) {
                                await attachments.deleteByExecutionAndCategory(execId, category, tx);
                            }
                        };

                        await processCategory(row.figma, 'FIGMA');
                        await processCategory(row.dev, 'DEV');
                    }
                }
            }
        });

        return ok(res, { message: 'Guardado correctamente' });
    } catch (err) {
        next(err);
    }
};
