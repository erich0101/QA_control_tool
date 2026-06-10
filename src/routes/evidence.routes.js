const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const { uploadEvidence } = require('../middleware/upload');
const ctrl = require('../controllers/evidence.controller');
const {
    uploadEvidenceSchema,
    idParamSchema
} = require('../validators/evidence.schema');

router.get('/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.getEvidence));
router.post('/', requireAuth, uploadEvidence.single('evidence'), validate(uploadEvidenceSchema), asyncHandler(ctrl.uploadEvidence));
router.delete('/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.deleteEvidence));

module.exports = router;
