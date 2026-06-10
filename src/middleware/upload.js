const multer = require('multer');

const ALLOWED_EVIDENCE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf'];
const ALLOWED_IMPORT = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
];

const uploadEvidence = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => ALLOWED_EVIDENCE.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Tipo no permitido: ${file.mimetype}`), false)
});

const uploadImport = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => ALLOWED_IMPORT.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Tipo no permitido: ${file.mimetype}`), false)
});

module.exports = { uploadEvidence, uploadImport, ALLOWED_EVIDENCE, ALLOWED_IMPORT };
