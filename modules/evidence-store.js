'use strict';
/**
 * Local evidence store
 * -------------------
 * Persists binary evidence (photos, videos, gifs, files of any type) on the
 * local filesystem, indexed by a SQLite database (better-sqlite3). The
 * metadata row in `qa_attachments` (Supabase / PostgreSQL) keeps the
 * filename, mime type, category, foreign keys and timestamps. The binary
 * payload and its SHA-256 are tracked here.
 *
 * Layout:
 *   <rootDir>/<project_id_or_-1>/YYYY-MM/<sha256>.<ext>
 *
 * storage_path stored in SQLite and in qa_attachments.storage_path is a
 * POSIX-style RELATIVE path from rootDir, e.g. `12/2026-08/abc...def.png`.
 *
 * Public API:
 *   init({ rootDir?, dbPath? })
 *   close()
 *   store({ buffer, mime, fileName, projectId, parentType, parentId,
 *           category, originalPgId })
 *     -> { storagePath, sha256, size, ext, storageKind: 'local', indexId }
 *   read(storagePath) -> Buffer
 *   readAsBase64(storagePath) -> string
 *   exists(storagePath) -> boolean
 *   absolutePath(storagePath) -> string
 *   deleteIndex(pgAttachmentId) -> void
 *   verifyAll() -> { ok, missing, count }
 *   inferExt(mime) -> string
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let _db = null;
let _rootDir = null;
let _dbPath = null;
let _insertStmt = null;
let _setPgAttachmentIdStmt = null;
let _deleteStmt = null;
let _getByStoragePathStmt = null;

const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/json': 'json',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

function inferExt(mime) {
    if (!mime || typeof mime !== 'string') return 'bin';
    const key = mime.toLowerCase().split(';')[0].trim();
    if (MIME_TO_EXT[key]) return MIME_TO_EXT[key];
    // Last-ditch: try /<subtype>
    const slash = key.indexOf('/');
    if (slash > 0) {
        const sub = key.slice(slash + 1);
        if (sub && /^[a-z0-9+.-]{1,8}$/.test(sub)) return sub;
    }
    return 'bin';
}

function ensureInit() {
    if (!_db) {
        throw new Error('evidenceStore: init() must be called before use');
    }
}

function init(opts = {}) {
    if (_db) return; // idempotent

    let baseDir;
    if (opts.baseDir) {
        baseDir = path.resolve(opts.baseDir);
    } else {
        // Por defecto: el padre de este módulo (project root cuando el módulo
        // vive en <root>/modules/evidence-store.js). No añadimos un ".." extra.
        baseDir = path.resolve(__dirname, '..');
    }
    _rootDir = path.resolve(opts.rootDir || path.join(baseDir, 'data', 'evidences'));
    _dbPath = path.resolve(opts.dbPath || path.join(baseDir, 'data', 'evidences.sqlite'));

    fs.mkdirSync(_rootDir, { recursive: true });
    fs.mkdirSync(path.dirname(_dbPath), { recursive: true });

    // eslint-disable-next-line global-require
    const Database = require('better-sqlite3');
    _db = new Database(_dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('foreign_keys = ON');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS evidence_index (
            pg_attachment_id   INTEGER PRIMARY KEY,
            sha256             VARCHAR(64) NOT NULL,
            size_bytes         INTEGER NOT NULL,
            mime_type          VARCHAR(120) NOT NULL,
            ext                VARCHAR(16) NOT NULL,
            project_id         INTEGER,
            parent_type        VARCHAR(16) NOT NULL,
            parent_id          INTEGER,
            evidence_category  VARCHAR(50),
            storage_path       TEXT NOT NULL,
            stored_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            source             VARCHAR(16) NOT NULL,
            original_pg_id     INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_evi_sha256      ON evidence_index(sha256);
        CREATE INDEX IF NOT EXISTS idx_evi_project_id  ON evidence_index(project_id);
        CREATE INDEX IF NOT EXISTS idx_evi_parent      ON evidence_index(parent_type, parent_id);
        CREATE INDEX IF NOT EXISTS idx_evi_source      ON evidence_index(source);
    `);

    const curVersion = _db.pragma('user_version', { simple: true });
    if (curVersion === 0) {
        _db.pragma('user_version = 1');
    }

    _insertStmt = _db.prepare(`
        INSERT INTO evidence_index (
            pg_attachment_id, sha256, size_bytes, mime_type, ext,
            project_id, parent_type, parent_id, evidence_category,
            storage_path, source, original_pg_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    _setPgAttachmentIdStmt = _db.prepare(`
        UPDATE evidence_index SET pg_attachment_id = ? WHERE rowid = ?
    `);
    _deleteStmt = _db.prepare(`DELETE FROM evidence_index WHERE pg_attachment_id = ?`);
    _getByStoragePathStmt = _db.prepare(`
        SELECT pg_attachment_id, sha256, size_bytes, mime_type, ext, project_id,
               parent_type, parent_id, evidence_category, storage_path, source, original_pg_id
          FROM evidence_index WHERE storage_path = ? LIMIT 1
    `);

    process.stdout.write(`[evidence-store] root=${_rootDir} db=${_dbPath}\n`);
}

function close() {
    if (_db) {
        try { _db.close(); } catch (_) { /* ignore */ }
        _db = null;
        _insertStmt = null;
        _setPgAttachmentIdStmt = null;
        _deleteStmt = null;
        _getByStoragePathStmt = null;
    }
}

function _projectKey(projectId) {
    if (projectId === null || projectId === undefined || projectId === 0) return -1;
    return projectId;
}

function absolutePath(storagePath) {
    ensureInit();
    // storage_path is POSIX-style relative; resolve against rootDir
    const rel = String(storagePath).replace(/\\/g, '/');
    return path.join(_rootDir, rel);
}

function exists(storagePath) {
    try {
        return fs.existsSync(absolutePath(storagePath));
    } catch (_) {
        return false;
    }
}

function read(storagePath) {
    ensureInit();
    const abs = absolutePath(storagePath);
    if (!fs.existsSync(abs)) {
        const err = new Error(`evidenceStore: file not found at ${abs}`);
        err.code = 'EVIDENCE_NOT_FOUND';
        throw err;
    }
    return fs.readFileSync(abs);
}

function readAsBase64(storagePath) {
    return read(storagePath).toString('base64');
}

function _yyyymmFromDate(d) {
    const dt = d instanceof Date ? d : new Date(d || Date.now());
    return dt.toISOString().slice(0, 7);
}

function store({ buffer, mime, fileName, projectId, parentType, parentId, category, originalPgId = null, yyyymm = null, pgAttachmentId = null }) {
    ensureInit();
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('evidenceStore.store: buffer must be a Buffer');
    }
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = inferExt(mime);
    const projectKey = _projectKey(projectId);
    const month = yyyymm || _yyyymmFromDate(new Date());
    const relativePath = path.posix.join(String(projectKey), month, `${sha256}.${ext}`);
    const absPath = path.join(_rootDir, relativePath);

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    if (!fs.existsSync(absPath)) {
        fs.writeFileSync(absPath, buffer);
    }

    const info = _insertStmt.run(
        pgAttachmentId,
        sha256,
        buffer.length,
        mime || 'application/octet-stream',
        ext,
        projectKey === -1 ? null : projectKey,
        parentType || 'unknown',
        parentId == null ? null : parentId,
        category || null,
        relativePath,
        pgAttachmentId ? 'migrated' : 'new',
        originalPgId
    );

    return {
        storagePath: relativePath,
        sha256,
        size: buffer.length,
        ext,
        storageKind: 'local',
        indexId: info.lastInsertRowid
    };
}

function setPgAttachmentId(indexId, pgAttachmentId) {
    ensureInit();
    if (!indexId || !pgAttachmentId) return;
    _setPgAttachmentIdStmt.run(pgAttachmentId, indexId);
}

function deleteIndex(pgAttachmentId) {
    ensureInit();
    if (!pgAttachmentId) return;
    _deleteStmt.run(pgAttachmentId);
}

function verifyAll() {
    ensureInit();
    const stmt = _db.prepare(`
        SELECT pg_attachment_id, storage_path, sha256
          FROM evidence_index
    `);
    const missing = [];
    let count = 0;
    for (const row of stmt.iterate()) {
        count += 1;
        const abs = absolutePath(row.storage_path);
        if (!fs.existsSync(abs)) {
            missing.push({ pgAttachmentId: row.pg_attachment_id, storagePath: row.storage_path, reason: 'missing' });
            continue;
        }
        const buf = fs.readFileSync(abs);
        const actual = crypto.createHash('sha256').update(buf).digest('hex');
        if (actual !== row.sha256) {
            missing.push({ pgAttachmentId: row.pg_attachment_id, storagePath: row.storage_path, reason: 'sha_mismatch' });
        }
    }
    return { ok: missing.length === 0, missing, count };
}

function _getByStoragePath(storagePath) {
    ensureInit();
    return _getByStoragePathStmt.get(storagePath);
}

function _isReady() {
    return _db !== null;
}

module.exports = {
    init,
    close,
    store,
    read,
    readAsBase64,
    exists,
    absolutePath,
    deleteIndex,
    verifyAll,
    inferExt,
    setPgAttachmentId,
    getByStoragePath: _getByStoragePath,
    isReady: _isReady
};
