const required = ['JWT_SECRET', 'JIRA_ENCRYPTION_KEY'];

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

function parseDatabaseConfig() {
    const url = process.env.DATABASE_URL;
    if (url && url.trim() !== '') {
        try {
            const parsed = new URL(url);
            const sslMode = parsed.searchParams.get('sslmode') || 'prefer';
            const channelBinding = parsed.searchParams.get('channel_binding') || 'prefer';
            const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
            return {
                source: 'DATABASE_URL',
                connectionString: url,
                host: parsed.hostname,
                port,
                user: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || ''),
                database: (parsed.pathname || '/postgres').replace(/^\//, '') || 'postgres',
                ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false },
                sslMode,
                channelBinding,
            };
        } catch (e) {
            fail(`DATABASE_URL no es una URL válida: ${e.message}`);
        }
    }

    const missing = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].filter(k => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length > 0) {
        fail(`Falta DATABASE_URL o las variables libpq: ${missing.join(', ')}`);
    }

    return {
        source: 'libpq',
        connectionString: null,
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        ssl: process.env.PGSSLMODE && process.env.PGSSLMODE !== 'disable'
            ? { rejectUnauthorized: process.env.PGSSLMODE === 'verify-full' }
            : false,
        sslMode: process.env.PGSSLMODE || 'prefer',
        channelBinding: process.env.PGCHANNELBINDING || 'prefer',
    };
}

const db = parseDatabaseConfig();

module.exports = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET: process.env.JWT_SECRET,
    JIRA_ENCRYPTION_KEY: Buffer.from(encryptionKeyHex, 'hex'),
    DB: db,
    DB_DRIVER: process.env.DB_DRIVER || 'pg',
    COOKIE: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
    CORS_ORIGIN: process.env.CORS_ORIGIN || false,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
