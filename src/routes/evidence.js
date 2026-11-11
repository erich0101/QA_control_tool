const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../lib/upload');
const evidenceStore = require('../../modules/evidence-store');

const router = express.Router();

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, mime_type, storage_kind, storage_path, sha256, size_bytes
               FROM qa_attachments WHERE id = ?`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
        const r = result.rows[0];

        // Fallback legacy: el binario sigue en BYTEA (transición pre-migration).
        if (r.storage_kind === 'legacy_pg' || !r.storage_kind || !r.storage_path) {
            const legacy = await query(
                `SELECT mime_type, encode(file_data, 'base64') as file_b64
                   FROM qa_attachments WHERE id = ?`,
                [req.params.id]
            );
            if (legacy.rows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
            const lr = legacy.rows[0];
            res.setHeader('Content-Type', lr.mime_type);
            res.setHeader('Cache-Control', 'no-store');
            return res.send(Buffer.from(lr.file_b64, 'base64'));
        }

        // Local: stream desde disco con headers de caché inmutables.
        const abs = evidenceStore.absolutePath(r.storage_path);
        if (!fs.existsSync(abs)) {
            return res.status(410).json({ error: 'Archivo no disponible localmente' });
        }
        const stat = fs.statSync(abs);
        res.setHeader('Content-Type', r.mime_type);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('ETag', `"${r.sha256}"`);
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.setHeader('Last-Modified', stat.mtime.toUTCString());
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(abs).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, upload.single('evidence'), async (req, res) => {
    try {
        const { tc_id, defect_id, suggestion_id, execution_id, category } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        // Resolver parentType / parentId / projectId antes de almacenar.
        let projectId = null;
        let parentType = 'unknown';
        let parentId = null;
        let resolvedExecutionId = null;

        if (defect_id) {
            const r = await query(`SELECT d.project_id, d.execution_id FROM qa_defects d WHERE d.id = ?`, [defect_id]);
            if (r.rows.length > 0) {
                projectId = r.rows[0].project_id;
                parentType = 'defect';
                parentId = parseInt(defect_id, 10);
                resolvedExecutionId = r.rows[0].execution_id;
            }
        } else if (suggestion_id) {
            const r = await query(`SELECT project_id FROM qa_suggestions WHERE id = ?`, [suggestion_id]);
            if (r.rows.length > 0) {
                projectId = r.rows[0].project_id;
                parentType = 'suggestion';
                parentId = parseInt(suggestion_id, 10);
            }
        } else if (execution_id) {
            const r = await query(`
                SELECT uc.project_id
                  FROM qa_executions e
                  JOIN qa_test_cases tc ON e.tc_id = tc.id
                  JOIN qa_test_suites s  ON tc.suite_id = s.id
                  JOIN qa_use_cases uc    ON s.use_case_id = uc.id
                 WHERE e.id = ?
            `, [parseInt(execution_id, 10)]);
            if (r.rows.length > 0) projectId = r.rows[0].project_id;
            parentType = 'execution';
            parentId = parseInt(execution_id, 10);
            resolvedExecutionId = parentId;
        } else {
            const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc_id]);
            if (execRes.rows.length === 0) return res.status(400).json({ error: 'No hay una ejecución reciente para este Test Case' });
            resolvedExecutionId = execRes.rows[0].id;
            const r = await query(`
                SELECT uc.project_id
                  FROM qa_executions e
                  JOIN qa_test_cases tc ON e.tc_id = tc.id
                  JOIN qa_test_suites s  ON tc.suite_id = s.id
                  JOIN qa_use_cases uc    ON s.use_case_id = uc.id
                 WHERE e.id = ?
            `, [resolvedExecutionId]);
            if (r.rows.length > 0) projectId = r.rows[0].project_id;
            parentType = 'execution';
            parentId = resolvedExecutionId;
        }

        // 1) Escribir binario al store local y obtener storagePath + sha256.
        const stored = evidenceStore.store({
            buffer: file.buffer,
            mime: file.mimetype,
            fileName: file.originalname,
            projectId,
            parentType,
            parentId,
            category: category || 'GENERAL',
            pgAttachmentId: null
        });

        // 2) Insertar fila en PG SIN file_data. lastID viene del RETURNING id que
        //    añade buildSql (db.js:67) automáticamente.
        let insertSql, insertParams;
        if (defect_id) {
            insertSql = `INSERT INTO qa_attachments
                (defect_id, file_name, mime_type, evidence_category, project_id,
                 storage_path, sha256, size_bytes, storage_kind)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local')`;
            insertParams = [defect_id, file.originalname, file.mimetype, category || 'GENERAL',
                            projectId, stored.storagePath, stored.sha256, stored.size];
        } else if (suggestion_id) {
            insertSql = `INSERT INTO qa_attachments
                (suggestion_id, file_name, mime_type, evidence_category, project_id,
                 storage_path, sha256, size_bytes, storage_kind)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local')`;
            insertParams = [suggestion_id, file.originalname, file.mimetype, category || 'GENERAL',
                            projectId, stored.storagePath, stored.sha256, stored.size];
        } else {
            insertSql = `INSERT INTO qa_attachments
                (execution_id, file_name, mime_type, evidence_category, project_id,
                 storage_path, sha256, size_bytes, storage_kind)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local')`;
            insertParams = [resolvedExecutionId, file.originalname, file.mimetype, category || 'GENERAL',
                            projectId, stored.storagePath, stored.sha256, stored.size];
        }
        const ins = await query(insertSql, insertParams);
        const newId = ins.lastID;

        // 3) Asociar el row SQLite con el id de PG.
        if (newId && stored.indexId) {
            evidenceStore.setPgAttachmentId(stored.indexId, newId);
        }

        res.json({ ok: true, id: newId, storage: { path: stored.storagePath, sha256: stored.sha256, size: stored.size } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await query(`DELETE FROM qa_attachments WHERE id = ?`, [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
        try { evidenceStore.deleteIndex(parseInt(req.params.id, 10)); } catch (_) { /* best-effort */ }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
