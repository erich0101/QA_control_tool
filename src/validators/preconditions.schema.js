const { z } = require('zod');

exports.listPreconditionsSchema = z.object({
    us_id: z.coerce.number().int().positive()
});

exports.createPreconditionSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    system_state: z.string().max(5000).optional()
});

exports.linkPreconditionSchema = z.object({
    tc_id: z.coerce.number().int().positive(),
    prc_id: z.coerce.number().int().positive()
});

exports.idParamSchema = z.object({
    id: z.coerce.number().int().positive()
});
