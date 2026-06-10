const { z } = require('zod');

exports.loginSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(200)
});
