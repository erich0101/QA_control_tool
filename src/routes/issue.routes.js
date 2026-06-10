const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const { uploadEvidence } = require('../middleware/upload');
const ctrl = require('../controllers/issue.controller');
const { createIssueSchema } = require('../validators/issue.schema');

router.post('/', requireAuth, uploadEvidence.any(), validate(createIssueSchema), asyncHandler(ctrl.createIssue));

module.exports = router;
