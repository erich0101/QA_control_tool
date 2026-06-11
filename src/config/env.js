'use strict';

function fail(msg) {
    console.error(`[config] FATAL: ${msg}`);
    process.exit(1);
}

function requireEnv(name) {
    const v = process.env[name];
    if (!v || String(v).trim() === '') {
        fail(`Variable de entorno requerida no definida o vacía: ${name}`);
    }
    return String(v).trim();
}

const JWT_SECRET = requireEnv('JWT_SECRET');
if (JWT_SECRET.length < 32) {
    fail('JWT_SECRET debe tener al menos 32 caracteres');
}

const JIRA_ENCRYPTION_KEY = requireEnv('JIRA_ENCRYPTION_KEY');
if (!/^[0-9a-fA-F]{64}$/.test(JIRA_ENCRYPTION_KEY)) {
    fail('JIRA_ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales (32 bytes)');
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

function parseDatabaseUrl() {
    const url = requireEnv('DATABASE_URL');
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        fail(`DATABASE_URL no es una URL válida: ${e.message}`);
    }
    const sslMode = parsed.searchParams.get('sslmode') || 'prefer';
    return {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 5432,
        user: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || ''),
        database: (parsed.pathname || '/postgres').replace(/^\//, '') || 'postgres',
        ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false },
        sslMode,
    };
}

const DB = parseDatabaseUrl();

module.exports = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET,
    JIRA_ENCRYPTION_KEY: Buffer.from(JIRA_ENCRYPTION_KEY, 'hex'),
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    DB,
    COOKIE: {
        secure: (process.env.COOKIE_SECURE || 'auto') === 'true' || ((process.env.COOKIE_SECURE || 'auto') === 'auto' && process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true'),
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
    CORS_ORIGIN: process.env.CORS_ORIGIN || false,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
