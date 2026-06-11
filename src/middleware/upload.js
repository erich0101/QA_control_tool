const multer = require('multer');
const { AppError } = require('./errors');

const ALLOWED_EVIDENCE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf'];
const ALLOWED_IMPORT = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
];

const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

const uploadEvidence = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: EVIDENCE_MAX_BYTES },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_EVIDENCE.includes(file.mimetype)) {
            return cb(new AppError(
                `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan imágenes (jpeg/png/webp/gif), videos (mp4/webm) o PDF.`,
                400,
                'UNSUPPORTED_MEDIA_TYPE',
                { field: file.fieldname, mimetype: file.mimetype, allowed: ALLOWED_EVIDENCE }
            ));
        }
        cb(null, true);
    }
});

const uploadImport = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMPORT_MAX_BYTES },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMPORT.includes(file.mimetype)) {
            return cb(new AppError(
                `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan XLSX, XLS o CSV.`,
                400,
                'UNSUPPORTED_MEDIA_TYPE',
                { field: file.fieldname, mimetype: file.mimetype, allowed: ALLOWED_IMPORT }
            ));
        }
        cb(null, true);
    }
});

module.exports = {
    uploadEvidence,
    uploadImport,
    ALLOWED_EVIDENCE,
    ALLOWED_IMPORT,
    EVIDENCE_MAX_BYTES,
    IMPORT_MAX_BYTES,
};
