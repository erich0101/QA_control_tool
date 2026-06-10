const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { uploadImport } = require('../middleware/upload');
const ctrl = require('../controllers/import.controller');

router.post(['/test-suites/:id/import-dual', '/use-cases/:id/import-dual'], requireAuth, uploadImport.single('xlsx'), asyncHandler(ctrl.importDual));
router.get('/use-cases/:id/export-excel', requireAuth, asyncHandler(ctrl.exportUseCaseExcel));
router.get('/projects/:id/export-excel', requireAuth, asyncHandler(ctrl.exportProjectExcel));

module.exports = router;
