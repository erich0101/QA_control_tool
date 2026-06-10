const { z } = require('zod');

exports.createIssueSchema = z.object({
    suite_id: z.coerce.number().int().positive(),
    test_list_v2: z.string().optional()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
