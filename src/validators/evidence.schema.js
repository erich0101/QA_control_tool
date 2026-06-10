const { z } = require('zod');

exports.uploadEvidenceSchema = z.object({
    tc_id: z.coerce.number().int().positive(),
    category: z.string().min(1).max(50).optional()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
