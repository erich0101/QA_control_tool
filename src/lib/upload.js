const multer = require('multer');

/**
 * Upload compartido en memoria: el almacenamiento final lo decide cada ruta
 * (evidence-store para evidencias, import para XLSX/CSV).
 */
const upload = multer({ storage: multer.memoryStorage() });

module.exports = { upload };
