const required = ['JWT_SECRET', 'JIRA_ENCRYPTION_KEY', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];

function fail(msg) {
    console.error(`[config] FATAL: ${msg}`);
    process.exit(1);
}

for (const key of required) {
    if (!process.env[key] || String(process.env[key]).trim() === '') {
        fail(`Variable de entorno requerida no definida o vacía: ${key}`);
    }
}

if (process.env.JWT_SECRET.length < 32) {
    fail('JWT_SECRET debe tener al menos 32 caracteres');
}

const encryptionKeyHex = process.env.JIRA_ENCRYPTION_KEY;
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
    fail('JIRA_ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales (32 bytes)');
}

module.exports = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET: process.env.JWT_SECRET,
    JIRA_ENCRYPTION_KEY: Buffer.from(encryptionKeyHex, 'hex'),
    PG: {
        host: process.env.PGHOST || 'db',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    },
    COOKIE: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
    CORS_ORIGIN: process.env.CORS_ORIGIN || false,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
