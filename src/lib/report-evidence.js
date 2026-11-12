const fs = require('fs');
const sharp = require('sharp');
const { query } = require('../../db');
const evidenceStore = require('../../modules/evidence-store');

async function getEvidenceBase64(attachmentId) {
    try {
        const result = await query(
            `SELECT id, mime_type, storage_kind, storage_path, file_data FROM qa_attachments WHERE id = ?`,
            [attachmentId]
        );
        if (result.rows.length === 0) return null;
        const r = result.rows[0];

        let buffer;
        if (r.storage_kind === 'legacy_pg' || !r.storage_kind || !r.storage_path) {
            if (!r.file_data) return null;
            buffer = Buffer.from(r.file_data, 'base64');
        } else {
            const abs = evidenceStore.absolutePath(r.storage_path);
            if (!fs.existsSync(abs)) return null;
            buffer = fs.readFileSync(abs);
        }

        const isVideo = (r.mime_type || '').startsWith('video/');
        if (isVideo) {
            return { type: 'video', mime: r.mime_type, data: `data:${r.mime_type};base64,${buffer.toString('base64')}` };
        }

        const compressed = await sharp(buffer)
            .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toBuffer();

        return { type: 'image', mime: 'image/jpeg', data: `data:image/jpeg;base64,${compressed.toString('base64')}` };
    } catch (e) {
        return null;
    }
}

function evidenceHTML(ev, maxWidth = 200) {
    if (!ev) return '';
    if (ev.type === 'video') {
        return `<video src="${ev.data}" controls preload="none" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer;" title="Click para reproducir"></video>`;
    }
    return `<img src="${ev.data}" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer; transition:transform 0.2s;" onclick="openLightbox(this.src)" onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'" title="Click para ampliar">`;
}

function lightboxHTML() {
    return `
        <div id="lightbox" onclick="closeLightbox()" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; cursor:pointer; align-items:center; justify-content:center;">
            <img id="lightbox-img" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px;">
            <button onclick="closeLightbox()" style="position:absolute; top:20px; right:20px; background:white; border:none; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer; font-weight:700;">✕</button>
        </div>
        <script>
            function openLightbox(src) {
                document.getElementById('lightbox-img').src = src;
                document.getElementById('lightbox').style.display = 'flex';
            }
            function closeLightbox() {
                document.getElementById('lightbox').style.display = 'none';
                document.getElementById('lightbox-img').src = '';
            }
            document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
        </script>
    `;
}

async function saveAttachment(execId, defectId, fileObj, category) {
    let finalBuffer = fileObj.buffer;
    let mime = fileObj.mimetype;
    let filename = fileObj.originalname;

    // Solo comprimir si es imagen (ignorar videos/pdfs)
    if (mime.startsWith('image/')) {
        finalBuffer = await sharp(fileObj.buffer)
            .webp({ quality: 80 })
            .toBuffer();
        mime = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
    }

    // Resolver project_id para el path layout.
    let projectId = null;
    if (execId) {
        const r = await query(`
            SELECT uc.project_id
              FROM qa_executions e
              JOIN qa_test_cases tc ON e.tc_id = tc.id
              JOIN qa_test_suites s  ON tc.suite_id = s.id
              JOIN qa_use_cases uc    ON s.use_case_id = uc.id
             WHERE e.id = ?
        `, [execId]);
        if (r.rows.length > 0) projectId = r.rows[0].project_id;
    } else if (defectId) {
        const r = await query(`SELECT project_id FROM qa_defects WHERE id = ?`, [defectId]);
        if (r.rows.length > 0) projectId = r.rows[0].project_id;
    }

    const stored = evidenceStore.store({
        buffer: finalBuffer,
        mime,
        fileName: filename,
        projectId,
        parentType: defectId ? 'defect' : 'execution',
        parentId: defectId || execId,
        category: category || 'GENERAL',
        pgAttachmentId: null
    });

    const ins = await query(
        `INSERT INTO qa_attachments
            (execution_id, defect_id, file_name, mime_type, evidence_category, project_id,
             storage_path, sha256, size_bytes, storage_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
        [execId, defectId, filename, mime, category || 'GENERAL', projectId,
         stored.storagePath, stored.sha256, stored.size]
    );
    if (ins.lastID && stored.indexId) {
        evidenceStore.setPgAttachmentId(stored.indexId, ins.lastID);
    }
}

module.exports = { getEvidenceBase64, evidenceHTML, lightboxHTML, saveAttachment };
