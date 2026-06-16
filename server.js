require('dns').setDefaultResultOrder('ipv4first'); // Fix: forzar IPv4 en redes sin soporte IPv6
require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const sharp = require('sharp');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { query, getClient, setupRealtimeChannel } = require('./db');
const { encrypt, decrypt } = require('./utils/crypto-utils');
const http = require('http');
const WebSocket = require('ws');
const JiraService = require('./jira-service');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

// Migración de columnas (Auto-ejecución al iniciar con IF NOT EXISTS)
(async () => {
    try {
        await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS jira_key VARCHAR(50)`);
        await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS jira_url TEXT`);

        // Crear tablas de configuración Jira (proyecto + usuario por proyecto)
        await query(`
            CREATE TABLE IF NOT EXISTS qa_jira_configs (
                project_id INTEGER PRIMARY KEY REFERENCES qa_projects(id) ON DELETE CASCADE,
                jira_domain VARCHAR(255) NOT NULL,
                jira_project_key VARCHAR(50) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS qa_jira_user_configs (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES qa_projects(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES qa_users(id) ON DELETE CASCADE,
                jira_user_email VARCHAR(255) NOT NULL,
                encrypted_token TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id)
            )
        `);

        await query(`ALTER TABLE qa_jira_configs ADD COLUMN IF NOT EXISTS jira_project_key TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS jira_epic_key TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS steps_to_reproduce TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS expected_result TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS actual_result TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS frequency VARCHAR(50)`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS business_impact TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES qa_users(id) ON DELETE SET NULL`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS preconditions TEXT`);
await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS observations TEXT`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS accumulated_seconds INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS last_resume_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'RUNNING'`);
        
        // Migraciones para qa_user_stories
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS hu_detallada TEXT`);
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        
        // Migraciones para qa_test_cases
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS key_id VARCHAR(50)`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS steps TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS assumptions TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS test_data TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS scenario_id INTEGER REFERENCES qa_scenarios(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS preconditions TEXT`);

        // Migraciones para qa_test_suites
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS key_id VARCHAR(50)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS jira_epic_key TEXT`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS inconsistencies TEXT DEFAULT '[]'`);
        
        // Nueva tabla para Escenarios (Refactorización del modelo de datos)
        await query(`
            CREATE TABLE IF NOT EXISTS qa_scenarios (
                id SERIAL PRIMARY KEY,
                us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Nueva tabla para Análisis de Inconsistencias
        await query(`
            CREATE TABLE IF NOT EXISTS qa_inconsistencias (
                id SERIAL PRIMARY KEY,
                us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                order_index INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Nuevos permisos
        await query(`ALTER TABLE qa_user_permissions ADD COLUMN IF NOT EXISTS can_execute_test INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_user_permissions ADD COLUMN IF NOT EXISTS can_manage_projects INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_user_permissions ADD COLUMN IF NOT EXISTS can_manage_users INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_user_permissions ADD COLUMN IF NOT EXISTS can_configure_jira INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_execute_test DROP DEFAULT`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_execute_test TYPE BOOLEAN USING can_execute_test::BOOLEAN`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_execute_test SET DEFAULT false`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_projects DROP DEFAULT`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_projects TYPE BOOLEAN USING can_manage_projects::BOOLEAN`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_projects SET DEFAULT false`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_users DROP DEFAULT`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_users TYPE BOOLEAN USING can_manage_users::BOOLEAN`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_manage_users SET DEFAULT false`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_configure_jira DROP DEFAULT`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_configure_jira TYPE BOOLEAN USING can_configure_jira::BOOLEAN`);
        await query(`ALTER TABLE qa_user_permissions ALTER COLUMN can_configure_jira SET DEFAULT false`);

        // Campo perfil para clasificación simple de usuarios (admin / user)
        await query(`ALTER TABLE qa_users ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) DEFAULT 'user'`);

        // ── Índices de Performance (PostgreSQL estándar — seguros con IF NOT EXISTS) ──
        await query(`CREATE INDEX IF NOT EXISTS idx_tc_suite_id       ON qa_test_cases (suite_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_tc_us_id          ON qa_test_cases (us_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_tc_scenario_id    ON qa_test_cases (scenario_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_exec_tc_id        ON qa_executions (tc_id, id DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_exec_run_id       ON qa_executions (run_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_exec_run_status   ON qa_executions (run_id, status)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_defects_exec_id   ON qa_defects (execution_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_defects_jira_key  ON qa_defects (jira_key) WHERE jira_key IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_defects_project_id ON qa_defects (project_id)`);
await query(`CREATE INDEX IF NOT EXISTS idx_defects_proj_exec ON qa_defects (project_id, execution_id)`);
        await query(`CREATE TABLE IF NOT EXISTS qa_hallazgo_tc (
            hallazgo_id INTEGER REFERENCES qa_defects(id) ON DELETE CASCADE,
            tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (hallazgo_id, tc_id)
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_tc_hallazgo ON qa_hallazgo_tc (hallazgo_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_tc_tc       ON qa_hallazgo_tc (tc_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_suites_uc_id      ON qa_test_suites (use_case_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_suites_active_run ON qa_test_suites (active_run_id) WHERE active_run_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_uc_project_id     ON qa_use_cases (project_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_us_uc_id          ON qa_user_stories (use_case_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_scenarios_us_id       ON qa_scenarios (us_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_inconsistencias_us_id ON qa_inconsistencias (us_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_perms_user_id     ON qa_user_permissions (user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_proj_users_uid    ON qa_project_users (user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_proj_users_pid    ON qa_project_users (project_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_runs_suite_id     ON qa_test_runs (suite_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_runs_status       ON qa_test_runs (id, status)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_tc_prec_tc_id     ON qa_tc_preconditions (tc_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_tc_prec_prc_id    ON qa_tc_preconditions (prc_id)`);

        // ── Seed del usuario admin por defecto ──
        const bcrypt = require('bcryptjs');
        const adminExists = await query(`SELECT id, perfil FROM qa_users WHERE email = ?`, ['erich@qa.local']);
        if (adminExists.rows.length === 0) {
            const adminHash = bcrypt.hashSync('admin123', 10);
            const adminRes = await query(
                `INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`,
                ['erich@qa.local', adminHash, 'Erich Petrocelli', 'Admin', 'admin']
            );
            const adminId = adminRes.lastID;
            await query(
                `INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
                [adminId]
            );
            console.log('✅ Usuario admin Erich Petrocelli (erich@qa.local / admin123) creado.');
        } else if (!adminExists.rows[0].perfil || adminExists.rows[0].perfil !== 'admin') {
            await query(`UPDATE qa_users SET role = 'Admin', perfil = 'admin' WHERE email = ?`, ['erich@qa.local']);
            console.log('✅ Perfil de Erich Petrocelli actualizado a admin.');
        }

        console.log("✅ Esquema de base de datos verificado y actualizado.");
    } catch (e) {
        console.error("⚠️ Error en verificación de esquema:", e.message);
    }
    setupRealtime();
    server.listen(PORT, () => {
        console.log(`Manual QA Tool (JIRA Edition) -> http://localhost:${PORT}`);
    });
})();

const app = express();
const PORT = process.env.PORT || 3333;
const BASE_DIR = __dirname;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_not_safe';

// Configuración de Multer en memoria
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(BASE_DIR, 'public')));

// ── Middlewares de Auth ──
// ── HELPERS DE SEGURIDAD ──
function sanitizeInput(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    
    // 1. Prevenir XSS básico (reemplazar etiquetas HTML)
    str = str.replace(/<[^>]*>?/gm, '');

    // 2. Prevenir Excel/CSV Formula Injection
    // Si empieza con =, +, -, @, le anteponemos una comilla simple
    if (['=', '+', '-', '@'].includes(str[0])) {
        str = "'" + str;
    }

    return str;
}

const requireAuth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch(err) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    next();
};

// ══════════════════════════════════════════════════════════════
// ── AUTH & USERS ──
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await query(`SELECT * FROM qa_users WHERE email = ?`, [email]);
        const user = result.rows[0];
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email, perfil: user.perfil || 'user' }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true });
        res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, perfil: user.perfil || 'user' } });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const perms = await query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [req.user.id]);
        res.json({ user: req.user, permissions: perms.rows[0] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
});

app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const users = await query(`
            SELECT u.id, u.email, u.name, u.role, u.perfil, p.can_create_cu, p.can_create_hu, p.can_create_suite, p.can_create_test, p.can_assign_cu, p.can_assign_hu, p.can_assign_suite, p.can_execute_test, p.can_manage_projects, p.can_manage_users, p.can_configure_jira
            FROM qa_users u 
            LEFT JOIN qa_user_permissions p ON u.id = p.user_id
        `);
        // Obtener proyectos asignados
        const projs = await query(`SELECT * FROM qa_project_users`);
        
        const usersWithProjs = users.rows.map(u => ({
            ...u,
            projects: projs.rows.filter(p => p.user_id === u.id).map(p => p.project_id)
        }));
        
        res.json({ users: usersWithProjs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, role, perfil, permissions, projects } = req.body;
        const hash = bcrypt.hashSync(password, 10);
        const result = await query(`INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)`, [email, hash, name, role, perfil || 'user']);
        const userId = result.lastID;
        
        await query(`INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, !!permissions.can_create_cu, !!permissions.can_create_hu, !!permissions.can_create_suite, !!permissions.can_create_test, !!permissions.can_assign_cu, !!permissions.can_assign_hu, !!permissions.can_assign_suite, !!permissions.can_execute_test, !!permissions.can_manage_projects, !!permissions.can_manage_users, !!permissions.can_configure_jira]);
            
        if (projects && projects.length > 0) {
            for (let pid of projects) {
                await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
            }
        }
        
        res.json({ ok: true, id: userId });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, role, perfil, permissions, projects } = req.body;
        const userId = req.params.id;
        
        let updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ? WHERE id = ?`;
        let updateParams = [email, name, role, perfil || 'user', userId];
        
        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            updateQuery = `UPDATE qa_users SET email = ?, name = ?, role = ?, perfil = ?, password_hash = ? WHERE id = ?`;
            updateParams = [email, name, role, perfil || 'user', hash, userId];
        }
        
        await query(updateQuery, updateParams);
        
        await query(`INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET can_create_cu = EXCLUDED.can_create_cu, can_create_hu = EXCLUDED.can_create_hu, can_create_suite = EXCLUDED.can_create_suite, can_create_test = EXCLUDED.can_create_test, can_assign_cu = EXCLUDED.can_assign_cu, can_assign_hu = EXCLUDED.can_assign_hu, can_assign_suite = EXCLUDED.can_assign_suite, can_execute_test = EXCLUDED.can_execute_test, can_manage_projects = EXCLUDED.can_manage_projects, can_manage_users = EXCLUDED.can_manage_users, can_configure_jira = EXCLUDED.can_configure_jira`,
            [userId, !!permissions.can_create_cu, !!permissions.can_create_hu, !!permissions.can_create_suite, !!permissions.can_create_test, !!permissions.can_assign_cu, !!permissions.can_assign_hu, !!permissions.can_assign_suite, !!permissions.can_execute_test, !!permissions.can_manage_projects, !!permissions.can_manage_users, !!permissions.can_configure_jira]);
            
        await query(`DELETE FROM qa_project_users WHERE user_id = ?`, [userId]);
        if (projects && projects.length > 0) {
            for (let pid of projects) {
                await query(`INSERT INTO qa_project_users (project_id, user_id) VALUES (?, ?)`, [pid, userId]);
            }
        }
        res.json({ ok: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// Middleware global para proteger todas las rutas siguientes
app.use('/api', requireAuth);

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ── HELPERS DE SECUENCIAS Y PROYECTOS (ISTQB) ──
// ══════════════════════════════════════════════════════════════

const generateKey = async (projectId, prefix, queryFn) => {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`,
        [projectId, prefix]
    );
    const num = res.rows[0].last_number;
    return `${prefix}-${num.toString().padStart(4, '0')}`;
};

const generateKeyBatch = async (projectId, prefix, count, queryFn) => {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, ?)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + ?
         RETURNING last_number`,
        [projectId, prefix, count, count]
    );
    const endNum = res.rows[0].last_number;
    return endNum - count + 1;
};

const getProjectIdFromUC = async (ucId) => {
    const res = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
    return res.rows[0]?.project_id;
};

const getProjectIdFromSuite = async (suiteId) => {
    const res = await query(`
        SELECT cu.project_id FROM qa_test_suites ts
        JOIN qa_use_cases cu ON ts.use_case_id = cu.id
        WHERE ts.id = ?
    `, [suiteId]);
    return res.rows[0]?.project_id;
};

// ── PROYECTOS ──
// ══════════════════════════════════════════════════════════════

const checkPermission = async (userId, permission) => {
    const result = await query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [userId]);
    return result.rows.length > 0 && !!result.rows[0][permission];
};

app.get('/api/projects', requireAuth, async (req, res) => {
    try {
        if (req.user.role === 'Admin' || req.user.role === 'Analista QA') {
            const result = await query(`SELECT * FROM qa_projects ORDER BY id DESC`);
            res.json({ projects: result.rows });
        } else {
            const result = await query(`
                SELECT p.* FROM qa_projects p
                JOIN qa_project_users pu ON p.id = pu.project_id
                WHERE pu.user_id = ? ORDER BY p.id DESC
            `, [req.user.id]);
            res.json({ projects: result.rows });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre requerido' });
        const result = await query(`INSERT INTO qa_projects (name, description) VALUES (?, ?)`, [name, description || '']);
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, description, status } = req.body;
        await query(`UPDATE qa_projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
            [name, description, status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_projects WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── JIRA CONFIG ──
// ── JIRA CONFIG (Admin: domain + key) ──

app.get('/api/projects/:id/jira-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await query(`SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]);
        if (result.rows.length === 0) {
            return res.json({ config: null, userHasToken: false });
        }
        const row = result.rows[0];

        const userConfig = await query(`SELECT id FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, req.user.id]);
        const userHasToken = userConfig.rows.length > 0;

        res.json({
            config: {
                jira_domain: row.jira_domain,
                jira_project_key: row.jira_project_key
            },
            userHasToken
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects/:id/jira-config', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { jira_domain, jira_project_key } = req.body;
        const projectId = req.params.id;

        if (!jira_domain || !jira_project_key) {
            return res.status(400).json({ error: 'Faltan campos requeridos: jira_domain y jira_project_key' });
        }

        const existing = await query(`SELECT project_id FROM qa_jira_configs WHERE project_id = ?`, [projectId]);
        
        if (existing.rows.length > 0) {
            await query(`
                UPDATE qa_jira_configs 
                SET jira_domain = ?, jira_project_key = ?, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?
            `, [jira_domain, jira_project_key, projectId]);
        } else {
            await query(`
                INSERT INTO qa_jira_configs (project_id, jira_domain, jira_project_key)
                VALUES (?, ?, ?)
            `, [projectId, jira_domain, jira_project_key]);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── JIRA USER CONFIG (Per-user credentials) ──

app.get('/api/projects/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const result = await query(`SELECT jira_user_email FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
        if (result.rows.length === 0) {
            return res.json({ hasConfig: false });
        }
        res.json({ hasConfig: true, email: result.rows[0].jira_user_email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const { jira_user_email, jira_api_token } = req.body;

        if (!jira_user_email) {
            return res.status(400).json({ error: 'El email de Jira es obligatorio' });
        }

        const existing = await query(`SELECT id, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);

        let encToken;
        if (jira_api_token) {
            encToken = encrypt(jira_api_token);
        } else if (existing.rows.length > 0) {
            encToken = existing.rows[0].encrypted_token;
        } else {
            return res.status(400).json({ error: 'El API Token es obligatorio para una nueva configuración' });
        }

        if (existing.rows.length > 0) {
            await query(`
                UPDATE qa_jira_user_configs 
                SET jira_user_email = ?, encrypted_token = ?, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ? AND user_id = ?
            `, [jira_user_email, encToken, projectId, userId]);
        } else {
            await query(`
                INSERT INTO qa_jira_user_configs (project_id, user_id, jira_user_email, encrypted_token)
                VALUES (?, ?, ?, ?)
            `, [projectId, userId, jira_user_email, encToken]);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── JIRA INTEGRATION (Bugs & Epics) ──

async function getJiraUserCredentials(projectId, userId) {
    const [projRes, userRes] = await Promise.all([
        query(`SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]),
        query(`SELECT jira_user_email, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId])
    ]);
    if (projRes.rows.length === 0) return { error: 'Jira no configurado para este proyecto', code: 'NO_PROJECT_CONFIG' };
    if (userRes.rows.length === 0) return { error: 'Configura tu token de Jira en tu perfil', code: 'NO_USER_TOKEN' };
    return {
        projectKey: projRes.rows[0].jira_project_key,
        domain: projRes.rows[0].jira_domain,
        userCredentials: userRes.rows[0]
    };
}

function normalizeStatus(name, cat) {
    const n = (name || '').toLowerCase();
    const c = cat || '';
    if (c === 'new' || n.includes('to do') || n.includes('por hacer') || n.includes('tareas')) return 'To Do';
    if (c === 'indeterminate' || n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso')) return 'In Progress';
    if (n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión')) return 'In Review';
    if (c === 'done' || n.includes('done') || n.includes('finaliz') || n.includes('cerrad') || n.includes('resolved')) return 'Done';
    return 'Other';
}

function matchTransition(toName, targetStatus) {
    const n = (toName || '').toLowerCase();
    if (targetStatus === 'To Do') return n.includes('to do') || n.includes('por hacer') || n.includes('tareas');
    if (targetStatus === 'In Progress') return n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso');
    if (targetStatus === 'In Review') return n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión');
    return false;
}

function getLastStatusChange(issue, targetStatus) {
    const histories = issue.changelog?.histories || [];
    let lastDate = null;
    histories.forEach(h => {
        h.items.forEach(item => {
            if (item.field === 'status') {
                const toName = item.toString || '';
                if (matchTransition(toName, targetStatus)) {
                    const d = new Date(h.created);
                    if (!lastDate || d > lastDate) lastDate = d;
                }
            }
        });
    });
    return lastDate;
}

app.get('/api/jira/projects/:id/epics', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const epics = await JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain);
        res.json({ epics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/epic-stats', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const { epicKey, from, to } = req.query;
        if (!epicKey || !from || !to) {
            return res.status(400).json({ error: 'epicKey, from y to son requeridos' });
        }

        const dateFrom = new Date(from);
        const dateTo = new Date(to);
        dateTo.setHours(23, 59, 59, 999);

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (parent = "${epicKey}" OR "Epic Link" = "${epicKey}")`;
        const allBugs = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);

        if (allBugs.length === 0) {
            return res.json({ error: 'No se encontraron bugs para esta épica' });
        }

        const bugsInPeriod = allBugs.filter(b => {
            const created = new Date(b.fields.created);
            return created >= dateFrom && created <= dateTo;
        });

        const resolvedInPeriod = allBugs.filter(b => {
            const resDate = b.fields.resolutiondate;
            if (!resDate) return false;
            const d = new Date(resDate);
            return d >= dateFrom && d <= dateTo;
        });

        const openAtStart = allBugs.filter(b => {
            const created = new Date(b.fields.created) < dateFrom;
            const resolved = b.fields.resolutiondate ? new Date(b.fields.resolutiondate) < dateFrom : true;
            return created && !resolved;
        });

        const stillOpen = allBugs.filter(b => !b.fields.resolutiondate);
        const resolved = allBugs.filter(b => !!b.fields.resolutiondate);

        // === AGING BUCKETS ===
        const now = new Date();
        const agingBuckets = { '0-3d': 0, '4-7d': 0, '8-15d': 0, '+15d': 0 };
        stillOpen.forEach(b => {
            const created = new Date(b.fields.created);
            const lastStatus = getLastStatusChange(b, 'To Do') || getLastStatusChange(b, 'In Progress') || created;
            const days = (now - lastStatus) / (1000 * 60 * 60 * 24);
            if (days <= 3) agingBuckets['0-3d']++;
            else if (days <= 7) agingBuckets['4-7d']++;
            else if (days <= 15) agingBuckets['8-15d']++;
            else agingBuckets['+15d']++;
        });

        // === SLA ADVANCED (solo bugs del período) ===
        const resolutionDays = resolvedInPeriod.map(b => {
            return (new Date(b.fields.resolutiondate) - new Date(b.fields.created)) / (1000 * 60 * 60 * 24);
        }).filter(d => d >= 0);

        const sortedDays = [...resolutionDays].sort((a, b) => a - b);
        const medianResolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length / 2)] : 0;
        const p90Resolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length * 0.9)] : 0;
        const avgResolutionDays = resolutionDays.length > 0 ? resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length : 0;
        const slaTarget = 5;
        const withinSLA = resolutionDays.filter(d => d <= slaTarget).length;
        const slaCompliance = resolutionDays.length > 0 ? Math.round((withinSLA / resolutionDays.length) * 100) : 0;

        // === WEEKLY TREND ===
        const weeks = [];
        let cur = new Date(dateFrom);
        cur.setHours(0, 0, 0, 0);
        while (cur <= dateTo) {
            const weekEnd = new Date(cur);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (weekEnd > dateTo) weekEnd.setTime(dateTo.getTime());
            const weekStartStr = cur.toISOString().split('T')[0];
            const weekEndStr = weekEnd.toISOString().split('T')[0];
            const createdThisWeek = bugsInPeriod.filter(b => {
                const d = new Date(b.fields.created);
                return d >= cur && d <= weekEnd;
            }).length;
            const resolvedThisWeek = allBugs.filter(b => {
                if (!b.fields.resolutiondate) return false;
                const d = new Date(b.fields.resolutiondate);
                return d >= cur && d <= weekEnd;
            }).length;
            const openAtWeekStart = allBugs.filter(b => {
                const created = new Date(b.fields.created) < cur;
                const resolved = b.fields.resolutiondate ? new Date(b.fields.resolutiondate) < cur : true;
                return created && !resolved;
            }).length;
            const backlogEnd = Math.max(0, openAtWeekStart + createdThisWeek - resolvedThisWeek);
            weeks.push({
                label: weekStartStr,
                created: createdThisWeek,
                resolved: resolvedThisWeek,
                backlogStart: openAtWeekStart,
                backlogEnd: backlogEnd,
                delta: createdThisWeek - resolvedThisWeek
            });
            cur.setDate(cur.getDate() + 7);
        }

        // === BACKLOG TREND ===
        const firstWeek = weeks[0];
        const lastWeek = weeks[weeks.length - 1];
        const backlogDelta = firstWeek && lastWeek ? lastWeek.backlogEnd - firstWeek.backlogStart : 0;
        const backlogDeltaPercent = firstWeek && firstWeek.backlogStart > 0 
            ? Math.round(((lastWeek.backlogEnd - firstWeek.backlogStart) / firstWeek.backlogStart) * 100) 
            : 0;

        // === RESOLUTION RATE (solo bugs del período) ===
        const bugResolutionRate = bugsInPeriod.length > 0 
            ? Math.round((resolvedInPeriod.length / bugsInPeriod.length) * 100) 
            : 0;

        // === STATUS BREAKDOWN ===
        const statusBreakdown = { 'To Do': 0, 'In Progress': 0, 'In Review': 0, 'Done': 0, 'Other': 0 };
        const priorityBreakdown = {};
        const criticalOpen = { count: 0, oldestDays: 0 };
        bugsInPeriod.forEach(b => {
            const statusName = b.fields.status?.name || '';
            const statusCat = b.fields.status?.statusCategory?.key || '';
            const normalized = normalizeStatus(statusName, statusCat);
            statusBreakdown[normalized] = (statusBreakdown[normalized] || 0) + 1;
            const prio = b.fields.priority?.name || 'Unknown';
            priorityBreakdown[prio] = (priorityBreakdown[prio] || 0) + 1;
            if (b.fields.priority?.name === 'Highest' && !b.fields.resolutiondate) {
                const days = (now - new Date(b.fields.created)) / (1000 * 60 * 60 * 24);
                criticalOpen.count++;
                if (days > criticalOpen.oldestDays) criticalOpen.oldestDays = days;
            }
        });

        // === AVG AGE BY STATUS ===
        const avgAgeByStatus = {};
        ['To Do', 'In Progress', 'In Review'].forEach(s => {
            const statusBugs = bugsInPeriod.filter(b => normalizeStatus(b.fields.status?.name, b.fields.status?.statusCategory?.key) === s);
            if (statusBugs.length === 0) { avgAgeByStatus[s] = 0; return; }
            const totalDays = statusBugs.reduce((sum, b) => {
                const created = new Date(b.fields.created);
                const lastStatus = getLastStatusChange(b, s);
                const fromDate = lastStatus || created;
                return sum + (now - fromDate) / (1000 * 60 * 60 * 24);
            }, 0);
            avgAgeByStatus[s] = parseFloat((totalDays / statusBugs.length).toFixed(1));
        });

        // === RELEASE RISK SCORE ===
        const backlogGrowthFactor = Math.abs(backlogDeltaPercent) / 100;
        const criticalFactor = criticalOpen.count * 0.3;
        const agingFactor = (agingBuckets['+15d'] / Math.max(stillOpen.length, 1)) * 0.3;
        const slaFactor = (100 - slaCompliance) / 100 * 0.25;
        const openFactor = (stillOpen.length / Math.max(bugsInPeriod.length, 1)) * 0.15;
        const rawRisk = (criticalFactor + backlogGrowthFactor * 0.25 + agingFactor + slaFactor + openFactor);
        const riskScore = Math.min(100, Math.round(rawRisk * 100));
        const riskLabel = riskScore < 30 ? 'low' : riskScore < 60 ? 'moderate' : 'high';

        // === QA HEALTH SCORE ===
        const healthScore = Math.max(0, Math.min(100, Math.round(
            (slaCompliance * 0.25) +
            (Math.min(bugResolutionRate, 100) * 0.25) +
            (Math.max(0, 100 - riskScore) * 0.30) +
            (Math.max(0, 100 - (criticalOpen.count * 10)) * 0.20)
        )));

        // === INSIGHTS ===
        const insights = [];
        if (backlogDeltaPercent < 0) {
            insights.push({ type: 'success', text: `Backlog disminuyendo ${Math.abs(backlogDeltaPercent)}% — tendencia positiva` });
        } else if (backlogDeltaPercent > 0) {
            insights.push({ type: 'warning', text: `Backlog creciendo ${backlogDeltaPercent}% — riesgo de acumulación` });
        }
        if (criticalOpen.count > 0) {
            insights.push({ type: 'critical', text: `${criticalOpen.count} bug(s) crítico(s) abierto(s) — ${criticalOpen.oldestDays > slaTarget ? 'excede(n) SLA de ' + slaTarget + ' días' : 'dentro de SLA'}` });
        }
        if (slaCompliance < 70) {
            insights.push({ type: 'warning', text: `SLA compliance al ${slaCompliance}% — ${slaTarget} días como target` });
        } else if (slaCompliance >= 90) {
            insights.push({ type: 'success', text: `SLA compliance al ${slaCompliance}% — excelente resolución` });
        }
        if (bugResolutionRate > 100) {
            insights.push({ type: 'success', text: `Resolution rate ${bugResolutionRate}% — el equipo resolve más de lo que entra` });
        } else if (bugResolutionRate < 50 && bugsInPeriod.length > 5) {
            insights.push({ type: 'warning', text: `Resolution rate ${bugResolutionRate}% — backlog acumulándose` });
        }
        if (agingBuckets['+15d'] > 0) {
            insights.push({ type: 'warning', text: `${agingBuckets['+15d']} bug(s) con más de 15 días sin resolver — possible deuda técnica` });
        }

        // === QA METRICS (local testing data) ===
        const qaCasesRes = await query(`
            SELECT tc.id, tc.title, tc.assigned_to
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            WHERE s.jira_epic_key = ?
        `, [epicKey]);

        const qaCaseIds = qaCasesRes.rows.map(c => c.id);

        let qaExecsByStatus = { PASS: 0, FAIL: 0, PENDING: 0, BLOCKED: 0 };
        let qaTotalExecutions = 0;
        let qaTotalMinutes = 0;
        let qaRunCount = 0;

        if (qaCaseIds.length > 0) {
            const qaExecsRes = await query(`
                SELECT e.status, COUNT(*)::INT as cnt
                FROM qa_executions e
                WHERE e.tc_id = ANY(?)
                GROUP BY e.status
            `, [qaCaseIds]);

            qaExecsRes.rows.forEach(r => {
                qaExecsByStatus[r.status] = (qaExecsByStatus[r.status] || 0) + r.cnt;
                qaTotalExecutions += r.cnt;
            });

            const qaRunsRes = await query(`
                SELECT r.accumulated_seconds, r.started_at, r.finished_at
                FROM qa_test_runs r
                JOIN qa_test_suites s ON r.suite_id = s.id
                WHERE s.jira_epic_key = ? AND r.status = 'FINISHED'
            `, [epicKey]);

            qaRunCount = qaRunsRes.rows.length;
            qaRunsRes.rows.forEach(r => {
                if (r.accumulated_seconds && r.accumulated_seconds > 0) {
                    qaTotalMinutes += r.accumulated_seconds / 60;
                } else if (r.started_at && r.finished_at) {
                    const diff = (new Date(r.finished_at) - new Date(r.started_at)) / 60000;
                    if (diff > 0) qaTotalMinutes += diff;
                }
            });
        }

        // Defects found during QA
        let qaDefectsRes = { rows: [] };
        if (qaCaseIds.length > 0) {
            qaDefectsRes = await query(`
                SELECT d.id, d.title, d.severity
                FROM qa_defects d
                JOIN qa_executions e ON d.execution_id = e.id
                WHERE e.tc_id = ANY(?)
            `, [qaCaseIds]);
        }

        const qaPassRate = (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) > 0
            ? Math.round((qaExecsByStatus.PASS / (qaExecsByStatus.PASS + qaExecsByStatus.FAIL)) * 100)
            : 0;

        const qaDefectDensity = (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) > 0
            ? parseFloat(((qaDefectsRes?.rows?.length || 0) / (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) * 100).toFixed(1))
            : 0;

        const qaDefectsBySeverity = {};
        if (qaCaseIds.length > 0) {
            const qaDefectsBySevRes = await query(`
                SELECT d.severity, COUNT(*)::INT as cnt
                FROM qa_defects d
                JOIN qa_executions e ON d.execution_id = e.id
                WHERE e.tc_id = ANY(?)
                GROUP BY d.severity
            `, [qaCaseIds]);
            qaDefectsBySevRes.rows.forEach(r => {
                qaDefectsBySeverity[r.severity] = r.cnt;
            });
        }

        // QA Insights
        if (qaTotalExecutions > 0) {
            if (qaPassRate < 50) {
                insights.push({ type: 'critical', text: `Pass rate de QA al ${qaPassRate}% — calidad comprometida` });
            } else if (qaPassRate < 80) {
                insights.push({ type: 'warning', text: `Pass rate de QA al ${qaPassRate}% — revisar casos fallidos` });
            } else if (qaPassRate >= 95) {
                insights.push({ type: 'success', text: `Pass rate de QA al ${qaPassRate}% — excelente calidad` });
            }
            if (qaDefectDensity > 0.5) {
                insights.push({ type: 'warning', text: `Defect density: ${qaDefectDensity}% — alta tasa de defectos por ejecución` });
            }
        } else if (qaCaseIds.length > 0) {
            insights.push({ type: 'warning', text: `${qaCaseIds.length} casos de prueba definidos sin ejecuciones registradas` });
        }

        // Actualizar health score con QA
        const healthScoreQA = Math.max(0, Math.min(100, Math.round(
            (slaCompliance * 0.20) +
            (Math.min(bugResolutionRate, 100) * 0.20) +
            (qaPassRate * 0.25) +
            (Math.max(0, 100 - riskScore) * 0.20) +
            (Math.max(0, 100 - (criticalOpen.count * 10)) * 0.15)
        )));

        res.json({
            summary: {
                total: bugsInPeriod.length,
                created: bugsInPeriod.length,
                resolved: resolvedInPeriod.length,
                open: stillOpen.length,
                openAtStart: openAtStart.length,
                avgResolutionDays: parseFloat(avgResolutionDays.toFixed(1)),
                medianResolution: parseFloat(medianResolution.toFixed(1)),
                p90Resolution: parseFloat(p90Resolution.toFixed(1)),
                slaCompliance,
                bugResolutionRate,
                backlogDelta,
                backlogDeltaPercent
            },
            healthScore: healthScoreQA,
            riskScore,
            riskLabel,
            statusBreakdown,
            priorityBreakdown,
            trend: weeks,
            avgAgeByStatus,
            agingBuckets,
            insights,
            sla: {
                target: slaTarget,
                median: parseFloat(medianResolution.toFixed(1)),
                p90: parseFloat(p90Resolution.toFixed(1)),
                compliance: slaCompliance,
                withinSLA,
                total: resolutionDays.length
            },
            qaMetrics: {
                totalTestCases: qaCaseIds.length,
                executionsByStatus: qaExecsByStatus,
                passRate: qaPassRate,
                defectDensity: qaDefectDensity,
                totalExecutions: qaTotalExecutions,
                executionTime: {
                    totalMinutes: parseFloat(qaTotalMinutes.toFixed(1)),
                    avgMinutes: qaTotalExecutions > 0 ? parseFloat((qaTotalMinutes / qaRunCount).toFixed(1)) : 0,
                    runCount: qaRunCount
                },
                defectsFound: qaDefectsRes?.rows?.length || 0,
                defectsBySeverity: qaDefectsBySeverity
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/my-tickets', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const { filter } = req.query;
        const maxResults = parseInt(req.query.maxResults) || 50;

        let issues = [];
        if (filter === 'assigned') {
            issues = await JiraService.getMyAssignedIssues(creds.userCredentials, creds.domain, creds.projectKey, maxResults);
        } else if (filter === 'created') {
            issues = await JiraService.getMyCreatedIssues(creds.userCredentials, creds.domain, creds.projectKey, maxResults);
        } else if (filter === 'mentions') {
            issues = await JiraService.getIssuesWhereMentioned(creds.userCredentials, creds.domain, creds.projectKey, 30);
        } else {
            return res.status(400).json({ error: 'filter debe ser: assigned, created, o mentions' });
        }

        const result = issues.map(i => ({
            key: i.key,
            id: i.id,
            summary: i.fields?.summary,
            status: i.fields?.status?.name,
            statusCategory: i.fields?.status?.statusCategory?.key,
            priority: i.fields?.priority?.name,
            assignee: i.fields?.assignee?.displayName,
            assigneeAvatar: i.fields?.assignee?.avatarUrls?.['24x24'],
            reporter: i.fields?.reporter?.displayName,
            created: i.fields?.created,
            updated: i.fields?.updated,
            issueType: i.fields?.issuetype?.name,
            parent: i.fields?.parent?.key,
            mentions: i.mentions || null,
            comments: i.comments || null
        }));

        res.json({ total: result.length, tickets: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/debug/jira-test', requireAuth, async (req, res) => {
    try {
        const { projectId, jql } = req.query;
        if (!projectId || !jql) {
            return res.status(400).json({ error: 'projectId y jql son requeridos' });
        }
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const results = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
        const first = results.length > 0 ? results[0] : null;
        res.json({ total: results.length, jqlUsed: jql, creds: { projectKey: creds.projectKey, domain: creds.domain }, firstIssue: first ? { key: first.key, id: first.id, projectKey: first.fields?.project?.key, fields: first.fields } : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/context', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error, epics: [], users: [], priorities: [], customFields: [] });
        
        const [epics, users, priorities, customFields] = await Promise.all([
            JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain),
            JiraService.getAssignableUsers(creds.userCredentials, creds.projectKey, creds.domain),
            JiraService.getPriorities(creds.userCredentials, creds.domain),
            JiraService.getCreateMetadata(creds.userCredentials, creds.projectKey, creds.domain)
        ]);

        res.json({ epics, users, priorities, customFields });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/tracking', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const dbBugs = await query(`
            SELECT d.id, d.title, d.jira_key, d.jira_url, d.created_at
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            WHERE cu.project_id = ? AND d.jira_key IS NOT NULL
        `, [projectId]);

        if (dbBugs.rows.length === 0) return res.json({ tracking: [] });

        const keys = dbBugs.rows.map(b => b.jira_key);
        const jiraIssues = await JiraService.getTicketsDetails(creds.userCredentials, creds.domain, keys);

        const tracking = dbBugs.rows.map(bug => {
            const jira = jiraIssues.find(j => j.key === bug.jira_key);
            return {
                ...bug,
                jira_status: jira?.fields?.status?.name || 'Desconocido',
                jira_assignee: jira?.fields?.assignee?.displayName || 'Sin asignar',
                jira_avatar: jira?.fields?.assignee?.avatarUrls?.['32x32'] || null,
                jira_priority: jira?.fields?.priority?.name || '—',
                jira_epic_key: jira?.fields?.parent?.key || 'Otras',
                jira_epic_name: jira?.fields?.parent?.fields?.summary || 'Tickets sin épica'
            };
        });

        res.json({ tracking });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/issues/:key/comments', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });
        
        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const comments = await JiraService.getIssueComments(creds.userCredentials, creds.domain, req.params.key);
        res.json({ comments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jira/issues/:key/comments', requireAuth, async (req, res) => {
    try {
        const { project_id, text, mentionId } = req.body;
        if (!text) return res.status(400).json({ error: 'El texto del comentario es requerido.' });

        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const result = await JiraService.addIssueComment(creds.userCredentials, creds.domain, req.params.key, text, mentionId);
        res.json({ ok: true, comment: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jira/defects/:id/create-ticket', requireAuth, async (req, res) => {
    try {
        const defectId = req.params.id;
        const { epicId, assigneeId, priorityId, customFields } = req.body;

        // 1. Obtener datos del defecto y su proyecto
        const bugRes = await query(`
            SELECT d.*, tc.title as tc_title, tc.key_id as tc_key, e.tester as tester_name, s.use_case_id
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            WHERE d.id = ?
        `, [defectId]);

        if (bugRes.rows.length === 0) return res.status(404).json({ error: 'Defecto no encontrado.' });
        const bug = bugRes.rows[0];

        // 2. Obtener el project_id real desde el caso de uso
        const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [bug.use_case_id]);
        const projectId = ucRes.rows[0].project_id;

        // 3. Obtener evidencias del defecto
        const evidenceRes = await query(`SELECT file_name, mime_type, file_data FROM qa_attachments WHERE execution_id = ?`, [bug.execution_id]);
        if (evidenceRes.rows.length > 0) {
            bug.evidences = evidenceRes.rows.map(r => r.file_name);
        }

        // 4. Obtener credenciales del usuario
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        // 5. Crear Ticket
        const jiraResult = await JiraService.createIssue(creds.userCredentials, creds.projectKey, creds.domain, bug, epicId, assigneeId, priorityId, customFields);
        
        // Generar URL del ticket
        const jiraUrl = `${jiraResult.self.split('/rest/')[0]}/browse/${jiraResult.key}`;

        // 6. Adjuntar evidencias
        let attachmentCount = 0;
        const attachmentErrors = [];
        if (evidenceRes.rows.length > 0) {
            for (const ev of evidenceRes.rows) {
                try {
                    const fileBuffer = Buffer.from(ev.file_data.replace(/^\\x/, ''), 'hex');
                    await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, fileBuffer, ev.mime_type);
                    attachmentCount++;
                } catch (attachErr) {
                    attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
                }
            }
        }

        // 7. Persistir en BBDD
        await query(`
            UPDATE qa_defects 
            SET jira_key = ?, jira_url = ?, root_cause = ? 
            WHERE id = ?
        `, [jiraResult.key, jiraUrl, `JIRA: ${jiraResult.key}`, defectId]);

        res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
    } catch (err) {
        console.error("Error al crear ticket en Jira:", err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ── CASOS DE USO ──
// ══════════════════════════════════════════════════════════════

app.get('/api/use-cases', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const result = await query(`
            SELECT cu.*,
                (SELECT COUNT(*) FROM qa_user_stories WHERE use_case_id = cu.id) as us_count
            FROM qa_use_cases cu
            WHERE cu.project_id = ?
            ORDER BY cu.id DESC
        `, [project_id]);

        res.json({ useCases: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/use-cases', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            const allowed = await checkPermission(req.user.id, 'can_create_cu');
            if (!allowed) return res.status(403).json({ error: 'No tienes permiso para crear Casos de Uso' });
        }

        const { project_id, key_id, title, description } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title requeridos' });

        const finalKeyId = key_id || await generateKey(project_id, 'CU');
        const result = await query(
            `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, finalKeyId, title, description || '', req.user.id, req.user.id]
        );
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/use-cases/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, status, key_id } = req.body;
        await query(`UPDATE qa_use_cases SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), key_id = COALESCE(?, key_id), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, description, status, key_id, req.user.id, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/use-cases/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_use_cases WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── USER STORIES (hijas de Caso de Uso) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/user-stories', requireAuth, async (req, res) => {
    try {
        const { use_case_id } = req.query;
        if (!use_case_id) return res.status(400).json({ error: 'use_case_id requerido' });

        const stories = await query(`
            SELECT us.*,
                (SELECT COUNT(*) FROM qa_test_cases WHERE us_id = us.id) as test_count,
                COALESCE((
                    SELECT json_agg(s ORDER BY s.order_index)
                    FROM qa_scenarios s
                    WHERE s.us_id = us.id
                ), '[]') as scenarios,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', i.id, 'title', i.title, 'description', i.description, 'severity', COALESCE(i.severity, 'Alta')
                    ) ORDER BY i.order_index)
                    FROM qa_inconsistencias i
                    JOIN qa_test_suites s ON i.suite_id = s.id
                    JOIN qa_test_cases tc ON tc.suite_id = s.id
                    WHERE tc.us_id = us.id
                ), '[]') as inconsistencies,
                us.recommendations
            FROM qa_user_stories us
            WHERE us.use_case_id = ?
            ORDER BY us.id DESC
        `, [use_case_id]);

        res.json({ userStories: stories.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── SCENARIOS ──
app.post('/api/scenarios', requireAuth, async (req, res) => {
    try {
        const { us_id, title, description, order_index } = req.body;
        if (!us_id || !title) return res.status(400).json({ error: 'us_id y title requeridos' });
        
        const result = await query(`
            INSERT INTO qa_scenarios (us_id, title, description, order_index)
            VALUES (?, ?, ?, ?)
        `, [us_id, title, description || '', order_index || 0]);
        
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/scenarios/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, order_index } = req.body;
        const scenarioId = req.params.id;
        
        await query(`
            UPDATE qa_scenarios 
            SET title = COALESCE(?, title), 
                description = COALESCE(?, description), 
                order_index = COALESCE(?, order_index)
            WHERE id = ?
        `, [title, description, order_index, scenarioId]);

        // --- NUEVA LÓGICA: Sincronizar hacia el Test Case ---
        if (title !== undefined) {
            await query(`UPDATE qa_test_cases SET title = ? WHERE scenario_id = ?`, [title, scenarioId]);
        }
        // ---------------------------------------------------

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/scenarios/:id', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_scenarios WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── INCONSISTENCIAS ──
app.post('/api/inconsistencies', requireAuth, async (req, res) => {
    try {
        const { suite_id, us_id, title, description, severity, order_index } = req.body;
        if (!title) return res.status(400).json({ error: 'title requerido' });
        if (!suite_id && !us_id) return res.status(400).json({ error: 'suite_id o us_id requerido' });

        const result = await query(`
            INSERT INTO qa_inconsistencias (suite_id, us_id, title, description, severity, order_index)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [suite_id || null, us_id || null, title, description || '', severity || 'Alta', order_index || 0]);

        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inconsistencies/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, severity, order_index } = req.body;
        await query(`
            UPDATE qa_inconsistencias
            SET title = COALESCE(?, title),
                description = COALESCE(?, description),
                severity = COALESCE(?, severity),
                order_index = COALESCE(?, order_index)
            WHERE id = ?
        `, [title, description, severity, order_index, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inconsistencies/:id', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_inconsistencias WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/user-stories', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_hu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { use_case_id, key_id, title, hu_detallada, priority, status,
                escenarios_prueba, reglas_negocio, precondiciones, link_documentacion } = req.body;
        if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });

        const projectId = await getProjectIdFromUC(use_case_id);
        const finalKeyId = key_id || await generateKey(projectId, 'HU');
        const result = await query(
            `INSERT INTO qa_user_stories (use_case_id, key_id, title, hu_detallada, priority, status, escenarios_prueba, reglas_negocio, precondiciones, link_documentacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [use_case_id, finalKeyId, title, hu_detallada || '', priority || 'Media', status || 'En Análisis',
             escenarios_prueba || '', reglas_negocio || '', precondiciones || '', link_documentacion || '', req.user.id, req.user.id]
        );
        const usId = result.lastID;

        // Si se envió detalle, lo creamos como la primera inconsistencia
        if (hu_detallada) {
            await query(`INSERT INTO qa_inconsistencias (us_id, title, order_index) VALUES (?, ?, 0)`, [usId, hu_detallada]);
        }

        res.json({ ok: true, id: usId, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/user-stories/:id/recommendations', requireAuth, async (req, res) => {
    try {
        const { recommendations } = req.body;
        if (!Array.isArray(recommendations)) return res.status(400).json({ error: 'recommendations debe ser un array' });
        await query(`UPDATE qa_user_stories SET recommendations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [JSON.stringify(recommendations), req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/user-stories/:id', requireAuth, async (req, res) => {
    try {
        const usId = req.params.id;
        const allowedFields = [
            'title', 'status', 'priority', 'key_id',
            'hu_detallada', 'escenarios_prueba', 'reglas_negocio',
            'precondiciones', 'link_documentacion', 'recommendations'
        ];

        const fields = [];
        const params = [];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                fields.push(`${field} = ?`);
                params.push(req.body[field]);
            }
        });

        if (fields.length === 0) {
            return res.json({ ok: true, message: 'No fields to update' });
        }

        fields.push(`updated_by = ?`);
        params.push(req.user.id);
        params.push(usId);

        await query(`UPDATE qa_user_stories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/user-stories/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_user_stories WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── PRECONDICIONES ──
// ══════════════════════════════════════════════════════════════

app.get('/api/preconditions', requireAuth, async (req, res) => {
    try {
        const { us_id } = req.query;
        if (!us_id) return res.status(400).json({ error: 'us_id requerido' });

        // Precondiciones vinculadas a TCs de las suites de esta US
        const result = await query(`
            SELECT DISTINCT p.* FROM qa_preconditions p
            JOIN qa_tc_preconditions tp ON tp.prc_id = p.id
            JOIN qa_test_cases tc ON tc.id = tp.tc_id
            JOIN qa_test_suites ts ON ts.id = tc.suite_id
            WHERE ts.us_id = ?
            ORDER BY p.id
        `, [us_id]);

        // También obtener precondiciones no vinculadas (globales disponibles)
        const all = await query(`SELECT * FROM qa_preconditions ORDER BY id`);

        res.json({ linked: result.rows, all: all.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/preconditions', requireAuth, async (req, res) => {
    try {
        const { title, description, system_state } = req.body;
        if (!title) return res.status(400).json({ error: 'title requerido' });
        const result = await query(`INSERT INTO qa_preconditions (title, description, system_state) VALUES (?, ?, ?)`,
            [title, description || '', system_state || '']);
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/preconditions/link', requireAuth, async (req, res) => {
    try {
        const { tc_id, prc_id } = req.body;
        await query(`INSERT INTO qa_tc_preconditions (tc_id, prc_id) VALUES (?, ?) ON CONFLICT (tc_id, prc_id) DO NOTHING`, [tc_id, prc_id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/preconditions/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_preconditions WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── TEST SUITES ──
// ══════════════════════════════════════════════════════════════

app.get('/api/test-suites', requireAuth, async (req, res) => {
    const start = Date.now();
    try {
        const { use_case_id, project_id } = req.query;
        let suitesRes;
        
        if (use_case_id) {
            suitesRes = await query(`SELECT * FROM qa_test_suites WHERE use_case_id = ? ORDER BY id`, [use_case_id]);
        } else if (project_id) {
            suitesRes = await query(`
                SELECT s.* FROM qa_test_suites s
                LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
                WHERE s.project_id = ? OR uc.project_id = ?
                ORDER BY s.id
            `, [project_id, project_id]);
        } else {
            return res.status(400).json({ error: 'use_case_id o project_id REQUERIDO' });
        }
        const suites = suitesRes.rows;
        if (suites.length === 0) return res.json({ testSuites: [] });

        const suiteIds = suites.map(s => s.id);
        const activeRunIds = suites.map(s => s.active_run_id).filter(id => id !== null);

        // 1. Fetch all Test Cases for these suites
        const casesRes = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ANY(?) ORDER BY id`, [suiteIds]);
        const allTestCases = casesRes.rows;

        // 2. Fetch all Active Runs info (Including RUNNING and PAUSED)
        let activeRuns = [];
        if (activeRunIds.length > 0) {
            const runsRes = await query(`SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status IN ('ACTIVE', 'RUNNING', 'PAUSED')`, [activeRunIds]);
            activeRuns = runsRes.rows;
        }

        // 3. Fetch Latest Executions (DISTINCT ON tc_id)
        const latestExecsRes = await query(`
            SELECT DISTINCT ON (tc_id) * 
            FROM qa_executions 
            WHERE tc_id IN (SELECT id FROM qa_test_cases WHERE suite_id = ANY(?))
            ORDER BY tc_id, id DESC
        `, [suiteIds]);
        const latestExecs = latestExecsRes.rows;

        // 4. Fetch Active Run Executions
        let activeRunExecs = [];
        if (activeRuns.length > 0) {
            const runIds = activeRuns.map(r => r.id);
            const runExecsRes = await query(`SELECT * FROM qa_executions WHERE run_id = ANY(?)`, [runIds]);
            activeRunExecs = runExecsRes.rows;
        }

        // 5. Fetch Parent Executions (RETEST)
        const parentRunIds = activeRuns.map(r => r.parent_run_id).filter(id => id !== null);
        let parentExecs = [];
        if (parentRunIds.length > 0) {
            const pExecsRes = await query(`
                SELECT DISTINCT ON (tc_id, run_id) *
                FROM qa_executions
                WHERE run_id = ANY(?)
                ORDER BY tc_id, run_id, id DESC
            `, [parentRunIds]);
            parentExecs = pExecsRes.rows;
        }

        // Bulk fetch attachments and defects
        const allExecIds = [...new Set([
            ...latestExecs.map(e => e.id),
            ...activeRunExecs.map(e => e.id),
            ...parentExecs.map(e => e.id)
        ])];

        let allAttachments = [];
        let allDefects = [];
        if (allExecIds.length > 0) {
            const attRes = await query(`SELECT id, execution_id, evidence_category FROM qa_attachments WHERE execution_id = ANY(?)`, [allExecIds]);
            allAttachments = attRes.rows;

            const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ANY(?)`, [allExecIds]);
            allDefects = defRes.rows;
        }

        // 6. Fetch Inconsistencies for all suites
        const incRes = await query(`
            SELECT id, suite_id, title, description, severity, order_index
            FROM qa_inconsistencias
            WHERE suite_id = ANY(?)
            ORDER BY suite_id, order_index
        `, [suiteIds]);
        const allInconsistencies = incRes.rows;

        const result = suites.map(suite => {
            const activeRun = activeRuns.find(r => r.id === suite.active_run_id) || null;
            const suiteCases = allTestCases.filter(tc => tc.suite_id === suite.id);
            const suiteInconsistencies = allInconsistencies.filter(inc => inc.suite_id === suite.id);
            
            const processedCases = suiteCases.map(tc => {
                let exec = null;
                if (activeRun) {
                    exec = activeRunExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.id) || null;
                    if (!exec && activeRun.run_type !== 'RETEST' && activeRun.parent_run_id) {
                        const pExec = parentExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.parent_run_id);
                        if (pExec) exec = { ...pExec, is_from_parent: true };
                    }
                } else {
                    exec = latestExecs.find(e => e.tc_id === tc.id) || null;
                }

                if (activeRun && !exec) return null;

                const attachments = allAttachments
                    .filter(a => a.execution_id === (exec ? exec.id : -1))
                    .map(a => ({ id: a.id, category: a.evidence_category, src: `api/evidence/${a.id}` }));

                const defects = allDefects.filter(d => d.execution_id === (exec ? exec.id : -1));

                if (activeRun && activeRun.run_type === 'RETEST' && exec && exec.status === 'PENDING' && activeRun.parent_run_id) {
                    const pExec = parentExecs.find(e => e.tc_id === tc.id && e.run_id === activeRun.parent_run_id);
                    if (pExec) {
                        allDefects.filter(d => d.execution_id === pExec.id).forEach(hd => {
                            if (!defects.find(d => d.id === hd.id)) defects.push({ ...hd, is_historical: true });
                        });
                    }
                }

                return {
                    id: tc.id, us_id: tc.us_id, scenario_id: tc.scenario_id, assigned_to: tc.assigned_to, title: tc.title,
                    steps: tc.steps || tc.description, expected_result: tc.expected_result, preconditions: tc.preconditions,
                    status: exec ? exec.status : 'PENDING', execution_id: exec ? exec.id : null,
                    is_from_parent: exec ? !!exec.is_from_parent : false,
                    observations: exec ? exec.observations : '', obtained_result: exec ? exec.obtained_result : '',
                    attachments, defects, key_id: tc.key_id, priority: tc.priority,
                    assumptions: tc.assumptions, test_data: tc.test_data, acceptance_criteria: tc.acceptance_criteria,
                    is_smoke: !!tc.is_smoke, is_regression: !!tc.is_regression, is_integration: !!tc.is_integration,
                    is_exploratory: !!tc.is_exploratory,
                    last_execution_at: exec ? exec.executed_at : null
                };
            }).filter(tc => tc !== null);

            return { ...suite, activeRun, test_cases: processedCases, inconsistencies: suiteInconsistencies };
        });

        console.log(`GET /api/test-suites optimized: ${Date.now() - start}ms`);
        res.json({ testSuites: result });
    } catch (err) {
        console.error('Error in GET /api/test-suites:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/test-suites', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_suite')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { use_case_id, title, description, jira_epic_key } = req.body;
        if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });
        
        const projectId = await getProjectIdFromUC(use_case_id);
        const finalKeyId = await generateKey(projectId, 'TS');
        
        const result = await query(`INSERT INTO qa_test_suites (use_case_id, title, description, created_by, updated_by, key_id, jira_epic_key) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [use_case_id, title, description || '', req.user.id, req.user.id, finalKeyId, jira_epic_key || '']);
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── IMPORTACIÓN DUAL XLSX/CSV (US + TESTS) ──
app.post(['/api/test-suites/:id/import-dual', '/api/use-cases/:id/import-dual'], requireAuth, upload.single('xlsx'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        let workbook;
        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer' });
        } catch (e) {
            const content = file.buffer.toString('utf-8');
            workbook = XLSX.read(content, { type: 'string' });
        }

        const normalize = (str) => {
            if (!str) return '';
            return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };

        const tryFindColIndex = (headers, keywords) => {
            if (!headers || headers.length === 0) return -1;
            for (let i = 0; i < headers.length; i++) {
                const nh = normalize(headers[i]);
                if (keywords.every(k => nh.includes(k))) return i;
            }
            return -1;
        };

        // Detectar formato: hoja plana (unificada) vs dual (2 hojas)
        const isCSV = file.originalname.toLowerCase().endsWith('.csv');
        let isFlatFormat = false;
        let dataFlat = null;
        let headersFlat = null;

        if (!isCSV && workbook.SheetNames.length === 1) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > 0) {
                const headers = data[0].map(h => normalize(h));
                const hasCU = headers.some(h => h.includes('cu') && h.includes('vinculad'));
                const hasHU = headers.some(h => h.includes('hu') || h.includes('requerimiento'));
                const hasEscenario = headers.some(h => h.includes('escenario'));
                const hasPasos = headers.some(h => h.includes('paso'));
                if (hasCU && hasHU && hasEscenario && hasPasos) {
                    isFlatFormat = true;
                    dataFlat = data;
                    headersFlat = data[0].map(h => String(h || '').trim());
                }
            }
        }

        // Obtener contexto del UC
        let ucId = req.params.id;
        const isUseCasePath = req.url.includes('/use-cases/');

        if (!isUseCasePath) {
            const sRes = await query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [ucId]);
            if (sRes.rows.length > 0) ucId = sRes.rows[0].use_case_id;
            else return res.status(404).json({ error: 'Suite no encontrada' });
        }

        const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const projectId = ucRes.rows[0].project_id;

        if (isFlatFormat) {
            // FORMATO UNIFICADO (hoja plana)
            return await processFlatImport(req, res, dataFlat, headersFlat, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
        }

        // FORMATO DUAL (2 hojas) - compatibilidad hacia atras
        return await processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
    } catch (err) {
        console.error('Error crítico en importación:', err);
        res.status(500).json({
            error: 'Error al procesar el archivo.',
            detalle: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

async function processFlatImport(req, res, data, headers, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
    const colMap = {
        uc_title: tryFindColIndex(headers, ['cu', 'vinculad']),
        suite: tryFindColIndex(headers, ['suite', 'grupo']),
        key_id: tryFindColIndex(headers, ['id test']),
        us_title: tryFindColIndex(headers, ['hu', 'requerimiento']),
        title: tryFindColIndex(headers, ['escenario']),
        pre: tryFindColIndex(headers, ['precondicion']),
        steps: tryFindColIndex(headers, ['paso']),
        data: tryFindColIndex(headers, ['datos de prueba']),
        expected: tryFindColIndex(headers, ['resultado esperado']),
        criteria: tryFindColIndex(headers, ['criterio', 'aceptacion']),
        assumptions: tryFindColIndex(headers, ['assumption', 'suposicion']),
        status: tryFindColIndex(headers, ['estado']),
        obtained: tryFindColIndex(headers, ['resultado obtenid']),
        obs: tryFindColIndex(headers, ['observacion', 'hallazgo']),
        tester: tryFindColIndex(headers, ['tester']),
        date: tryFindColIndex(headers, ['fecha ejecucion'])
    };

    if (colMap.title === -1 || colMap.steps === -1 || colMap.expected === -1 || colMap.us_title === -1) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias en formato unificado',
            detalle: 'Se requieren: CU Vinculado, HU/Requerimiento, Escenario, Pasos, Resultado Esperado'
        });
    }

    // Agrupar por HU
    const groups = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let usTitle = String(row[colMap.us_title] || '').trim();
        if (!usTitle || usTitle === 'Sin HU vinculada') continue;
        // Limpiar prefijo [US-XXX] si existe
        usTitle = usTitle.replace(/^\[.*?\]\s*/, '');
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const getVal = (row, idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

            // Crear Suite para esta HU
            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteRes = await q(`
                INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteRes.rows[0].id;

            // Crear HU
            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = getVal(firstRow, colMap.data) || '';
            const usBR = '';
            const usPre = getVal(firstRow, colMap.pre) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => getVal(row, colMap.title));
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const title = getVal(row, colMap.title);
                if (!title) continue;

                const steps = getVal(row, colMap.steps);
                const pre = getVal(row, colMap.pre);
                const expected = getVal(row, colMap.expected);
                const assumptions = getVal(row, colMap.assumptions);
                const testData = getVal(row, colMap.data);
                const criteria = getVal(row, colMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa (formato unificado). ${usCount} historias de usuario y ${totalImported} tests importados.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}

async function processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
    let sheetUSName, sheetTCName;

    if (isCSV) {
        sheetUSName = workbook.SheetNames[0];
        sheetTCName = workbook.SheetNames[0];
    } else {
        sheetUSName = 'historia de usuario';
        sheetTCName = 'Casos de Prueba';
        const realUS = workbook.SheetNames.find(n => n.toLowerCase() === sheetUSName);
        const realTC = workbook.SheetNames.find(n => n.toLowerCase() === sheetTCName);
        if (realUS) sheetUSName = realUS;
        if (realTC) sheetTCName = realTC;

        if (!workbook.SheetNames.includes(sheetUSName) || !workbook.SheetNames.includes(sheetTCName)) {
            return res.status(400).json({ error: `El archivo XLSX debe contener las hojas "${sheetUSName}" y "${sheetTCName}"` });
        }
    }

    let dataUS = XLSX.utils.sheet_to_json(workbook.Sheets[sheetUSName], { header: 1 });
    let dataTC = XLSX.utils.sheet_to_json(workbook.Sheets[sheetTCName], { header: 1 });

    if (dataUS.length < 2) return res.status(400).json({ error: 'El archivo está vacío o no tiene datos suficientes' });

    const tryFindCol = (data, keywords) => {
        if (!data || data.length === 0) return null;
        let headers = data[0].map(h => normalize(h));

        let found = data[0].find(h => {
            const nh = normalize(h);
            return keywords.every(k => nh.includes(k));
        });
        if (found) return found;

        if (isCSV && data[0].length === 1) {
            const line = String(data[0][0]);
            const delims = [',', ';'];
            for (let d of delims) {
                if (line.includes(d)) {
                    const parts = line.split(d);
                    const nhParts = parts.map(p => normalize(p));
                    if (keywords.every(k => nhParts.some(p => p.includes(k)))) {
                        if (data === dataUS) {
                            dataUS.forEach((r, idx) => {
                                if (r.length === 1) dataUS[idx] = String(r[0]).split(d);
                            });
                        }
                        if (data === dataTC) {
                            dataTC.forEach((r, idx) => {
                                if (r.length === 1) dataTC[idx] = String(r[0]).split(d);
                            });
                        }
                        return parts.find(p => keywords.every(k => normalize(p).includes(k)));
                    }
                }
            }
        }
        return null;
    };

    const colUS_Title = tryFindCol(dataUS, ['titulo', 'historia']);

    const headersUS = dataUS[0].map(h => String(h || '').trim());
    const headersTC = dataTC[0].map(h => String(h || '').trim());

    if (!colUS_Title) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias (Título de la HU)',
            detalle: `Columnas detectadas: [${headersUS.join(' | ')}]`
        });
    }

    const tcColMap = {
        us_title: headersTC.indexOf(colUS_Title),
        title: tryFindCol(dataTC, ['escenario']),
        pre: tryFindCol(dataTC, ['precondicion']),
        data: tryFindCol(dataTC, ['datos de prueba']),
        steps: tryFindCol(dataTC, ['paso']),
        criteria: tryFindCol(dataTC, ['criterio']),
        expected: tryFindCol(dataTC, ['resultado esperado']),
        assumptions: tryFindCol(dataTC, ['suposicion']),
        us_desc: headersUS.find(h => normalize(h).includes('descripcion')),
        us_br: headersUS.find(h => normalize(h).includes('reglas de negocio')),
        us_pre: headersUS.find(h => normalize(h).includes('precondiciones'))
    };

    Object.keys(tcColMap).forEach(k => {
        if (typeof tcColMap[k] === 'string') tcColMap[k] = headersTC.indexOf(tcColMap[k]);
    });

    if (tcColMap.title === -1 || tcColMap.steps === -1 || tcColMap.expected === -1) {
        return res.status(400).json({ error: 'Faltan columnas obligatorias (Escenario, Pasos, Resultado Esperado)' });
    }

    const groups = {};
    for (let i = 1; i < dataTC.length; i++) {
        const row = dataTC[i];
        const usTitle = sanitizeInput(row[tcColMap.us_title]);
        if (!usTitle) continue;
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteResNew = await q(`
                INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteResNew.rows[0].id;

            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = sanitizeInput(firstRow[tcColMap.us_desc]) || '';
            const usBR = sanitizeInput(firstRow[tcColMap.us_br]) || '';
            const usPre = sanitizeInput(firstRow[tcColMap.us_pre]) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';
                return getVal(tcColMap.title);
            });
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

                const title = getVal(tcColMap.title);
                if (!title) continue;

                const steps = getVal(tcColMap.steps);
                const pre = getVal(tcColMap.pre);
                const expected = getVal(tcColMap.expected);
                const assumptions = getVal(tcColMap.assumptions);
                const testData = getVal(tcColMap.data);
                const criteria = getVal(tcColMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;
                escenariosText.push(title);

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa. Se creó la suite "${file.originalname}" con ${usCount} historias de usuario y ${totalImported} tests.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}
// Exportar Matriz de Pruebas Completa (Todas las suites del CU) a Excel unificado
app.get('/api/use-cases/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const useCaseId = req.params.id;

        // 1. Obtener datos del Caso de Uso y Proyecto
        const ucRes = await query(`
            SELECT uc.*, p.name as project_name
            FROM qa_use_cases uc
            JOIN qa_projects p ON uc.project_id = p.id
            WHERE uc.id = ?
        `, [useCaseId]);

        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const useCase = ucRes.rows[0];

        // 2. Obtener Test Cases de TODAS las suites de este CU y sus ejecuciones más recientes
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE s.use_case_id = ?
            ORDER BY s.id, us.id, tc.id
        `, [useCaseId]);

        // 3. Construir workbook con SheetJS (compatible con import)
        const wb = XLSX.utils.book_new();

        // Encabezados unificados
        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        // Construir array de datos
        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || useCase.title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Ajustar ancho de columnas
        ws['!cols'] = [
            { wch: 30 }, // CU Vinculado
            { wch: 25 }, // Suite / Grupo
            { wch: 15 }, // ID Test
            { wch: 35 }, // HU / Requerimiento
            { wch: 45 }, // Escenario / Título
            { wch: 40 }, // Precondiciones
            { wch: 55 }, // Pasos de Reproducción
            { wch: 40 }, // Datos de Prueba
            { wch: 45 }, // Resultado Esperado
            { wch: 40 }, // Criterios Aceptación
            { wch: 40 }, // Assumptions
            { wch: 15 }, // Estado
            { wch: 45 }, // Resultado Obtenido
            { wch: 45 }, // Observaciones / Hallazgos
            { wch: 15 }, // Tester
            { wch: 22 }  // Fecha Ejecución
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        // Generar buffer xlsx
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_${useCase.key_id || 'CU'}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación Excel:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte Excel.', detalle: err.message });
    }
});

// Exportar Matriz de Pruebas de TODO el Proyecto (todos los CU) a Excel unificado
app.get('/api/projects/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;

        // 1. Obtener datos del Proyecto
        const projRes = await query(`SELECT * FROM qa_projects WHERE id = ?`, [projectId]);
        if (projRes.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
        const project = projRes.rows[0];

        // 2. Obtener TODOS los Test Cases de TODOS los CU del proyecto
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title, uc.key_id as uc_key,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE uc.project_id = ?
            ORDER BY uc.id, s.id, us.id, tc.id
        `, [projectId]);

        // 3. Construir workbook con SheetJS
        const wb = XLSX.utils.book_new();

        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        ws['!cols'] = [
            { wch: 30 },
            { wch: 25 },
            { wch: 15 },
            { wch: 35 },
            { wch: 45 },
            { wch: 40 },
            { wch: 55 },
            { wch: 40 },
            { wch: 45 },
            { wch: 40 },
            { wch: 40 },
            { wch: 15 },
            { wch: 45 },
            { wch: 45 },
            { wch: 15 },
            { wch: 22 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_Proyecto_${project.key_id || project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación de proyecto:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte del proyecto.', detalle: err.message });
    }
});

// Iniciar ciclo de ejecución inteligente
app.post('/api/test-suites/:id/start-execution', requireAuth, async (req, res) => {
    try {
        const suiteId = req.params.id;
        const { execution_type, filters } = req.body; // execution_type: 'SMOKE', 'REGRESSION', 'CUSTOM'

        // 1. Construir query de filtrado de tests
        let filterSql = `SELECT id, assigned_to FROM qa_test_cases WHERE suite_id = ?`;
        let params = [suiteId];

        if (execution_type === 'SMOKE') {
            filterSql += ` AND is_smoke = true`;
        } else if (execution_type === 'REGRESSION') {
            filterSql += ` AND is_regression = true`;
        } else if (execution_type === 'INTEGRATION') {
            filterSql += ` AND is_integration = true`;
        } else if (execution_type === 'EXPLORATORY') {
            filterSql += ` AND is_exploratory = true`;
        } else if (execution_type === 'CUSTOM' && filters) {
            if (filters.priority) { filterSql += ` AND priority = ?`; params.push(filters.priority); }
            if (filters.is_smoke !== undefined) { filterSql += ` AND is_smoke = ?`; params.push(filters.is_smoke); }
            if (filters.is_regression !== undefined) { filterSql += ` AND is_regression = ?`; params.push(filters.is_regression); }
            if (filters.is_integration !== undefined) { filterSql += ` AND is_integration = ?`; params.push(filters.is_integration); }
            if (filters.is_exploratory !== undefined) { filterSql += ` AND is_exploratory = ?`; params.push(filters.is_exploratory); }
        }

        const eligibleTests = await query(filterSql, params);

        // Filtro adicional: Solo asignados al usuario si se solicita
        let finalEligible = eligibleTests.rows;
        if (req.body.only_assigned) {
            finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
        }

        if (finalEligible.length === 0) {
            return res.status(400).json({ error: 'No hay tests asignados a tu usuario en esta suite o no coinciden con los filtros.' });
        }

        // 2. Crear el run en estado RUNNING
        const runRes = await query(`
            INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds) 
            VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
        `, [suiteId, req.user.id, execution_type || 'FULL']);
        const runId = runRes.lastID;

        // 3. Actualizar la suite
        await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);

        // 4. Crear ejecuciones PENDING solo para los tests filtrados
        for (const tc of finalEligible) {
            await query(`
                INSERT INTO qa_executions (tc_id, run_id, tester, status) 
                VALUES (?, ?, ?, 'PENDING')
            `, [tc.id, runId, req.user.name]);
        }
        
        res.json({ ok: true, runId, testCount: finalEligible.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/test-cases/:id/start-execution', requireAuth, async (req, res) => {
    try {
        const tcId = req.params.id;
        const tcRes = await query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [tcId]);
        if (tcRes.rows.length === 0) return res.status(404).json({ error: 'Test case no encontrado' });
        const suiteId = tcRes.rows[0].suite_id;

        const suiteRes = await query(`SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        if (suiteRes.rows[0]?.active_run_id) {
            return res.status(400).json({ error: 'La suite ya tiene un ciclo activo.' });
        }

        const runRes = await query(`
            INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds) 
            VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
        `, [suiteId, req.user.id, 'INDIVIDUAL']);
        const runId = runRes.lastID;

        await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suiteId]);

        await query(`
            INSERT INTO qa_executions (tc_id, run_id, tester, status) 
            VALUES (?, ?, ?, 'PENDING')
        `, [tcId, runId, req.user.name]);

        res.json({ ok: true, runId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/use-cases/:id/start-all', requireAuth, async (req, res) => {
    try {
        const ucId = parseInt(req.params.id);
        const onlyAssigned = req.body.only_assigned !== false;
        const executionType = req.body.execution_type || 'REGRESSION';

        const suitesRes = await query(`
            SELECT s.id, s.title, s.key_id
            FROM qa_test_suites s
            WHERE s.use_case_id = ? AND s.active_run_id IS NULL
            ORDER BY s.id
        `, [ucId]);

        if (suitesRes.rows.length === 0) {
            return res.status(400).json({ error: 'No hay suites disponibles para ejecutar en este Caso de Uso' });
        }

        const results = [];
        let totalTests = 0;

        for (const suite of suitesRes.rows) {
            try {
let filterSql = `SELECT id, assigned_to FROM qa_test_cases WHERE suite_id = ?`;
                let params = [suite.id];

                if (executionType === 'SMOKE') {
                    filterSql += ` AND is_smoke = true`;
                } else if (executionType === 'REGRESSION') {
                    filterSql += ` AND is_regression = true`;
                } else if (executionType === 'INTEGRATION') {
                    filterSql += ` AND is_integration = true`;
                } else if (executionType === 'EXPLORATORY') {
                    filterSql += ` AND is_exploratory = true`;
                }

                const eligibleTests = await query(filterSql, params);

                let finalEligible = eligibleTests.rows;
                if (onlyAssigned) {
                    finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
                }

                if (finalEligible.length === 0) {
                    results.push({ suiteId: suite.id, title: suite.title, error: 'Sin tests asignados o que coincidan con el filtro', status: 'skip' });
                    continue;
                }

                const runRes = await query(`
                    INSERT INTO qa_test_runs (suite_id, status, created_by, run_type, last_resume_at, accumulated_seconds)
                    VALUES (?, 'RUNNING', ?, ?, CURRENT_TIMESTAMP, 0)
                `, [suite.id, req.user.id, executionType]);
                const runId = runRes.lastID;

                await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [runId, suite.id]);

                for (const tc of finalEligible) {
                    await query(`INSERT INTO qa_executions (tc_id, run_id, tester, status) VALUES (?, ?, ?, 'PENDING')`, [tc.id, runId, req.user.name]);
                }

                results.push({ suiteId: suite.id, title: suite.title, runId, testCount: finalEligible.length, status: 'ok' });
                totalTests += finalEligible.length;
            } catch (err) {
                results.push({ suiteId: suite.id, title: suite.title, error: err.message, status: 'error' });
            }
        }

        const executed = results.filter(r => r.status === 'ok').length;
        const skipped = results.filter(r => r.status === 'skip').length;
        const failed = results.filter(r => r.status === 'error').length;

        res.json({
            ok: true,
            totalSuites: suitesRes.rows.length,
            executedSuites: executed,
            skippedSuites: skipped,
            failedSuites: failed,
            totalTests,
            results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pausar ciclo de ejecución
app.post('/api/runs/:id/pause', requireAuth, async (req, res) => {
    try {
        const runId = req.params.id;
        const runRes = await query(`SELECT last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ? AND status = 'RUNNING'`, [runId]);
        if (runRes.rows.length === 0) return res.status(400).json({ error: 'El ciclo no está en ejecución o no existe.' });
        
        const run = runRes.rows[0];
        const lastResume = new Date(run.last_resume_at);
        const now = new Date();
        const deltaSeconds = Math.floor((now - lastResume) / 1000);
        const newAccumulated = (run.accumulated_seconds || 0) + deltaSeconds;

        await query(`UPDATE qa_test_runs SET status = 'PAUSED', accumulated_seconds = ?, last_resume_at = NULL WHERE id = ?`, [newAccumulated, runId]);
        res.json({ ok: true, accumulated_seconds: newAccumulated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reanudar ciclo de ejecución
app.post('/api/runs/:id/resume', requireAuth, async (req, res) => {
    try {
        const runId = req.params.id;
        const runRes = await query(`SELECT id FROM qa_test_runs WHERE id = ? AND status = 'PAUSED'`, [runId]);
        if (runRes.rows.length === 0) return res.status(400).json({ error: 'El ciclo no está pausado o no existe.' });

        await query(`UPDATE qa_test_runs SET status = 'RUNNING', last_resume_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalizar ciclo de ejecución con cálculo de estadísticas
app.post('/api/test-suites/:id/finish-execution', requireAuth, async (req, res) => {
    try {
        const suiteId = req.params.id;
        const suiteRes = await query(`SELECT active_run_id, assigned_to FROM qa_test_suites WHERE id = ?`, [suiteId]);
        const suite = suiteRes.rows[0];
        
        if (!suite) return res.status(404).json({ error: 'Suite no encontrada' });

        const runId = suite.active_run_id;
        if (!runId) return res.status(400).json({ error: 'No hay un ciclo activo para esta suite' });

        // Calcular estadísticas finales del run
        const execs = await query(`SELECT status FROM qa_executions WHERE run_id = ?`, [runId]);
        const stats = {
            total: execs.rows.length,
            pass: execs.rows.filter(e => e.status === 'PASS' || e.status === 'OK').length,
            fail: execs.rows.filter(e => e.status === 'FAIL').length,
            warn: execs.rows.filter(e => e.status === 'WARNING').length,
            block: execs.rows.filter(e => e.status === 'BLOCK').length,
            skipped: execs.rows.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
        };

        // Consolidar tiempo si estaba RUNNING antes de finalizar
        const runInfo = await query(`SELECT status, last_resume_at, accumulated_seconds FROM qa_test_runs WHERE id = ?`, [runId]);
        const run = runInfo.rows[0];
        let finalSeconds = run.accumulated_seconds || 0;
        
        if (run.status === 'RUNNING') {
            const lastResume = new Date(run.last_resume_at);
            finalSeconds += Math.floor((new Date() - lastResume) / 1000);
        }

        await query(`UPDATE qa_test_runs SET status = 'FINISHED', finished_at = CURRENT_TIMESTAMP, accumulated_seconds = ? WHERE id = ?`, [finalSeconds, runId]);
        await query(`UPDATE qa_test_suites SET active_run_id = NULL WHERE id = ?`, [suiteId]);
        
        res.json({ ok: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- HISTORIAL & BUGS ---

app.get('/api/history', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const runs = await query(`
            SELECT r.*, s.title as suite_title, u.name as tester_name
            FROM qa_test_runs r
            JOIN qa_test_suites s ON r.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_users u ON r.created_by = u.id
            WHERE uc.project_id = ? AND r.status = 'FINISHED'
            ORDER BY r.finished_at DESC
        `, [project_id]);

        const result = [];
        for (const run of runs.rows) {
            // Calcular stats al vuelo para el historial
            const execs = await query(`SELECT status FROM qa_executions WHERE run_id = ?`, [run.id]);
            result.push({
                ...run,
                stats: {
                    total: execs.rows.length,
                    pass: execs.rows.filter(e => e.status === 'PASS' || e.status === 'OK').length,
                    fail: execs.rows.filter(e => e.status === 'FAIL').length,
                    warn: execs.rows.filter(e => e.status === 'WARNING').length,
                    block: execs.rows.filter(e => e.status === 'BLOCK').length,
                    skipped: execs.rows.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
                }
            });
        }

        res.json({ runs: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/runs/:id/bugs', requireAuth, async (req, res) => {
    try {
        const bugs = await query(`
            SELECT b.*, tc.title as tc_title 
            FROM qa_defects b
            JOIN qa_executions e ON b.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            WHERE e.run_id = ?
        `, [req.params.id]);
        res.json({ bugs: bugs.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats/jira-daily', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) {
            return res.json({ issues: [], assigneeCounts: {}, closedToday: 0, openCount: 0, avgResolutionDays: 0, error: creds.error });
        }

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (updated >= "-2d" OR statusCategory != Done)`;
        const jiraIssues = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql, 'changelog');

        let totalResolutionTime = 0;
        let resolvedCount = 0;
        let openCount = 0;
        let closedToday = 0;
        let closedYesterday = 0;
        const severityCounts = { Alta: 0, Media: 0, Baja: 0, Crítica: 0 };
        const assigneeCounts = {}; // { "Nombre": count }
        const epicCounts = {};     // { "Nombre Epica": count }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const processedIssues = jiraIssues.map(issue => {
            const f = issue.fields;
            const isResolved = f.status?.statusCategory?.key === 'done';
            
            // 1. Estadísticas básicas (solo si es Bug)
            // Nota: El JQL ya filtra por Bug si lo deseamos, pero aquí procesamos todos los retornados
            
            if (!isResolved) {
                const sev = f.priority?.name || 'Media';
                if (sev.includes('High') || sev.includes('Alta')) severityCounts.Alta++;
                else if (sev.includes('Highest') || sev.includes('Crítica') || sev.includes('Urgent')) severityCounts.Crítica++;
                else if (sev.includes('Low') || sev.includes('Baja')) severityCounts.Baja++;
                else severityCounts.Media++;

                const assigneeName = f.assignee?.displayName || 'Sin Asignar';
                assigneeCounts[assigneeName] = (assigneeCounts[assigneeName] || 0) + 1;

                const epicName = f.parent?.fields?.summary || 'Sin Épica';
                epicCounts[epicName] = (epicCounts[epicName] || 0) + 1;
                openCount++;
            } else {
                resolvedCount++;
                if (f.resolutiondate) {
                    const resDate = new Date(f.resolutiondate);
                    const createDate = new Date(f.created);
                    totalResolutionTime += (resDate - createDate);
                    
                    const resDayStr = resDate.toISOString().split('T')[0];
                    if (resDayStr === todayStr) closedToday++;
                    else if (resDayStr === yesterdayStr) closedYesterday++;
                }
            }

            // 2. Procesar Historial para el Resumen de la Daily
            let devUser = null;
            let doneUser = null;
            const histories = issue.changelog?.histories || [];
            
            histories.forEach(h => {
                h.items.forEach(item => {
                    if (item.field === 'status') {
                        const to = item.toString?.toLowerCase() || '';
                        if (to.includes('prog') || to.includes('curso') || to.includes('dev') || to.includes('desarrollo')) {
                            devUser = { name: h.author.displayName, avatar: h.author.avatarUrls?.['24x24'] };
                        }
                        if (to.includes('done') || to.includes('finalizado') || to.includes('cerrado') || to.includes('resolved')) {
                            doneUser = { name: h.author.displayName, avatar: h.author.avatarUrls?.['24x24'] };
                        }
                    }
                });
            });

            return {
                key: issue.key,
                summary: f.summary,
                status: f.status.name,
                statusCategory: f.status.statusCategory?.key,
                statusColor: f.status.statusCategory?.colorName || 'gray',
                assignee: f.assignee?.displayName || 'Sin Asignar',
                avatar: f.assignee?.avatarUrls?.['24x24'],
                priority: f.priority?.name || 'Media',
                created: f.created,
                updated: f.updated,
                resolutiondate: f.resolutiondate,
                epic: f.parent?.fields?.summary || 'Sin Épica',
                devUser: devUser || (f.status.name.toLowerCase().includes('curso') ? { name: f.assignee?.displayName, avatar: f.assignee?.avatarUrls?.['24x24'] } : null),
                doneUser: doneUser || (f.status.statusCategory?.key === 'done' ? { name: f.assignee?.displayName, avatar: f.assignee?.avatarUrls?.['24x24'] } : null)
            };
        });

        const avgResolutionDays = resolvedCount > 0 ? (totalResolutionTime / resolvedCount / (1000 * 60 * 60 * 24)).toFixed(1) : 0;

        res.json({
            projectName: creds.projectKey,
            jiraUrl: creds.domain,
            avgResolutionDays,
            openCount,
            resolvedCount,
            totalTickets: jiraIssues.length,
            closedToday,
            closedYesterday,
            severityCounts,
            assigneeCounts,
            epicCounts,
            issues: processedIssues
        });
    } catch (err) {
        console.error("Error en /api/stats/jira-daily:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PRODUCTIVIDAD DE EQUIPO (Últimos 30 días en Jira)
 */
app.get('/api/stats/jira-productivity', requireAuth, async (req, res) => {
    const { project_id } = req.query;
    try {
        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.json({ error: creds.error });

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (statusCategory != done OR resolved >= -30d)`;
        
        const jiraIssues = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
        const teamStats = {}; 

        jiraIssues.forEach(issue => {
            const f = issue.fields;
            const assignee = f.assignee?.displayName || 'Sin Asignar';
            const avatar = f.assignee?.avatarUrls?.['24x24'];
            const isDone = f.status.statusCategory?.key === 'done';

            if (!teamStats[assignee]) {
                teamStats[assignee] = { name: assignee, avatar, resolved: 0, open: 0, totalDays: 0, totalOpenDays: 0 };
            }

            if (isDone) {
                teamStats[assignee].resolved++;
                if (f.resolutiondate && f.created) {
                    const days = (new Date(f.resolutiondate) - new Date(f.created)) / (1000 * 60 * 60 * 24);
                    teamStats[assignee].totalDays += days;
                }
            } else {
                teamStats[assignee].open++;
                const age = (new Date() - new Date(f.created)) / (1000 * 60 * 60 * 24);
                teamStats[assignee].totalOpenDays += age;
            }
        });

        // Calcular promedios y Scores (Poder de Resolución vs Deuda de Tiempo)
        const result = Object.values(teamStats).map(user => {
            const totalWork = user.resolved + user.open;
            const avgDays = user.resolved > 0 ? (user.totalDays / user.resolved) : 0;
            const avgOpenAge = user.open > 0 ? (user.totalOpenDays / user.open) : 0;
            
            // Score Base (Volumen + Velocidad de cierre)
            const volumeScore = Math.min(60, user.resolved * 6);
            const speedScore = avgDays > 0 ? Math.min(40, (3 / Math.max(0.5, avgDays)) * 20) : 10;
            
            // PENALIZACIÓN POR AGING (Si los pendientes tienen > 14 días promedio, restamos hasta 30 pts)
            const agingPenalty = avgOpenAge > 14 ? Math.min(30, (avgOpenAge - 14) * 2) : 0;
            
            const finalScore = Math.max(0, (volumeScore + speedScore - agingPenalty)).toFixed(0);

            return {
                ...user,
                totalWork,
                avgDays: avgDays.toFixed(1),
                avgOpenAge: avgOpenAge.toFixed(1),
                score: finalScore
            };
        }).sort((a, b) => b.score - a.score);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/defects', requireAuth, async (req, res) => {
    try {
        const { execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact } = req.body;
        if (!execution_id || !title) return res.status(400).json({ error: 'execution_id y title son requeridos' });

        // Heredar jira_epic_key de la suite
        const suiteRes = await query(`
            SELECT s.jira_epic_key 
            FROM qa_test_suites s
            JOIN qa_test_cases tc ON s.id = tc.suite_id
            JOIN qa_executions e ON tc.id = e.tc_id
            WHERE e.id = ?
        `, [execution_id]);
        const jira_epic_key = suiteRes.rows[0]?.jira_epic_key || '';

        const result = await query(
            `INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
            [execution_id, title, description || '', severity || 'Media', steps_to_reproduce || '', expected_result || '', actual_result || '', frequency || 'Siempre', business_impact || '', jira_epic_key]
        );
        res.json({ ok: true, defect_id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/defects/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status requerido' });
        await query(`UPDATE qa_defects SET status = ? WHERE id = ?`, [status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Iniciar Retesting: Crea un nuevo run basado en los fallos de uno anterior
app.post('/api/runs/:id/retest', requireAuth, async (req, res) => {
    try {
        const oldRunId = req.params.id;
        const oldRun = await query(`SELECT suite_id FROM qa_test_runs WHERE id = ?`, [oldRunId]);
        if (oldRun.rows.length === 0) return res.status(404).json({ error: 'Run no encontrado' });

        const suiteId = oldRun.rows[0].suite_id;

        // 1. Identificar tests que fallaron o fueron bloqueados
        // Solo incluimos los que tienen sus bugs en 'FIXED' o no tienen bugs (ej: BLOCKED o FAIL sin bug aún)
        const failedTests = await query(`
            SELECT DISTINCT e.tc_id 
            FROM qa_executions e
            WHERE e.run_id = ? 
            AND e.status IN ('FAIL', 'WARNING', 'BLOCKED', 'BLOCK')
        `, [oldRunId]);

        if (failedTests.rows.length === 0) {
            return res.status(400).json({ error: 'No hay tests fallidos o bloqueados para retestear.' });
        }

        // 2. Crear nuevo run
        const runRes = await query(`
            INSERT INTO qa_test_runs (suite_id, status, created_by, parent_run_id, run_type) 
            VALUES (?, 'RUNNING', ?, ?, 'RETEST')
        `, [suiteId, req.user.id, oldRunId]);
        const newRunId = runRes.lastID;

        // 3. Marcar suite con el nuevo run
        await query(`UPDATE qa_test_suites SET active_run_id = ? WHERE id = ?`, [newRunId, suiteId]);

        // 4. Pre-poblar ejecuciones PENDING para los tests seleccionados
        for (const test of failedTests.rows) {
            await query(`
                INSERT INTO qa_executions (tc_id, run_id, tester, status, observations) 
                VALUES (?, ?, ?, 'PENDING', 'Pendiente de retest')
            `, [test.tc_id, newRunId, req.user.name]);
        }

        res.json({ ok: true, runId: newRunId, suite_id: suiteId, testCount: failedTests.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta dedicada para guardar/reemplazar inconsistencias de una suite
app.put('/api/test-suites/:id/inconsistencies', requireAuth, async (req, res) => {
    try {
        const { inconsistencies } = req.body; // array de { title, severity, description }
        if (!Array.isArray(inconsistencies)) return res.status(400).json({ error: 'inconsistencies debe ser un array' });
        
        const suiteId = req.params.id;
        
        // Delete existing and insert new
        await query(`DELETE FROM qa_inconsistencias WHERE suite_id = ?`, [suiteId]);
        
        for (let i = 0; i < inconsistencies.length; i++) {
            const inc = inconsistencies[i];
            await query(`
                INSERT INTO qa_inconsistencias (suite_id, title, description, severity, order_index)
                VALUES (?, ?, ?, ?, ?)
            `, [suiteId, inc.title, inc.description || '', inc.severity || 'Alta', i]);
        }
        
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/test-suites/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_test_suites WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/test-suites/:id', requireAuth, async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM qa_test_suites WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats/suites', requireAuth, async (req, res) => {
    try {
        const { project_id, date_from, date_to } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        let dateFilter = '';
        const params = [project_id];

        if (date_from) {
            dateFilter += ' AND r.started_at >= ?';
            params.push(date_from);
        }
        if (date_to) {
            dateFilter += ' AND r.started_at <= ?::timestamp + interval \'1 day\'';
            params.push(date_to);
        }

        const stats = await query(`
            SELECT 
                s.id,
                s.title,
                COUNT(r.id)::INT as total_runs,
                COALESCE(SUM(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE 0 END), 0)::FLOAT as total_minutes,
                COALESCE(AVG(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE NULL END), 0)::FLOAT as avg_minutes
            FROM qa_test_suites s
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_test_runs r ON s.id = r.suite_id
            WHERE uc.project_id = ? ${dateFilter}
            GROUP BY s.id, s.title
            ORDER BY total_minutes DESC
        `, params);

        res.json({ stats: stats.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats/overview', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const summary = await query(`
            SELECT 
                (SELECT COUNT(*) FROM qa_use_cases WHERE project_id = ?) as total_cu,
                (SELECT COUNT(*) FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_suites,
                (SELECT COUNT(*) FROM qa_test_cases tc JOIN qa_test_suites s ON tc.suite_id = s.id JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_tc
        `, [project_id, project_id, project_id]);

        const statuses = await query(`
            SELECT 
                COALESCE(e.status, 'PENDING') as status,
                COUNT(*) as count
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            LEFT JOIN (
                SELECT tc_id, status FROM qa_executions 
                WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
            ) e ON tc.id = e.tc_id
            WHERE cu.project_id = ?
            GROUP BY COALESCE(e.status, 'PENDING')
        `, [project_id]);

        const coverage = await query(`
            SELECT 
                cu.title,
                COUNT(tc.id) as total,
                SUM(CASE WHEN e.status IN ('OK', 'PASS') THEN 1 ELSE 0 END) as ok
            FROM qa_use_cases cu
            LEFT JOIN qa_test_suites s ON cu.id = s.use_case_id
            LEFT JOIN qa_test_cases tc ON s.id = tc.suite_id
            LEFT JOIN (
                SELECT tc_id, status FROM qa_executions 
                WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
            ) e ON tc.id = e.tc_id
            WHERE cu.project_id = ?
            GROUP BY cu.id, cu.title
            ORDER BY cu.id
        `, [project_id]);

        res.json({
            summary: summary.rows[0],
            statuses: statuses.rows,
            coverage: coverage.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── TEST CASES (dentro de suites) ──
// ══════════════════════════════════════════════════════════════

app.post('/api/test-cases', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_test')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { suite_id, us_id, scenario_id: provided_scenario_id, title, steps, expected_result, assigned_to, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria } = req.body;
        if (!suite_id || !title) return res.status(400).json({ error: 'suite_id y title requeridos' });
        
        let scenario_id = provided_scenario_id;

        // --- NUEVA LÓGICA: El Escenario nace con el Test ---
        if (us_id && !scenario_id) {
            // 1. Crear el escenario automáticamente
            const scenarioRes = await query(
                `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
                [us_id, title, us_id]
            );
            scenario_id = scenarioRes.rows[0].id;

            // 2. Vincular el título al campo de texto de la HU para compatibilidad
            await query(
                `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
                [title, title, us_id]
            );
        }
        // --------------------------------------------------

        const projectId = await getProjectIdFromSuite(suite_id);
        const finalKeyId = await generateKey(projectId, 'TC');

        const result = await query(`INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, title, steps, expected_result, assigned_to, created_by, updated_by, key_id, preconditions, jira_epic_key, assumptions, test_data, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [suite_id, us_id || null, scenario_id || null, title, steps || '', expected_result || '', assigned_to || null, req.user.id, req.user.id, finalKeyId, preconditions || '', jira_epic_key || '', assumptions || '', test_data || '', acceptance_criteria || '']);
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId, scenario_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/test-cases/:id/move', requireAuth, async (req, res) => {
    try {
        const tcId = req.params.id;
        const { new_suite_id } = req.body;

        if (!new_suite_id) return res.status(400).json({ error: 'new_suite_id requerido' });

        const tcRes = await query(`SELECT id, suite_id, us_id FROM qa_test_cases WHERE id = ?`, [tcId]);
        if (!tcRes.rows.length) return res.status(404).json({ error: 'Test Case no encontrado' });
        const tc = tcRes.rows[0];

        if (tc.us_id) {
            return res.status(400).json({ error: 'El TC tiene una HU vinculada. Desvinculá la HU antes de mover.' });
        }

        const sourceSuiteRes = await query(`SELECT id, use_case_id, active_run_id FROM qa_test_suites WHERE id = ?`, [tc.suite_id]);
        if (!sourceSuiteRes.rows.length) return res.status(404).json({ error: 'Suite origen no encontrada' });
        const sourceSuite = sourceSuiteRes.rows[0];

        if (sourceSuite.active_run_id) {
            return res.status(400).json({ error: 'El TC está en una suite en ejecución. No se puede mover.' });
        }

        const destSuiteRes = await query(`SELECT id, use_case_id FROM qa_test_suites WHERE id = ?`, [new_suite_id]);
        if (!destSuiteRes.rows.length) return res.status(404).json({ error: 'Suite destino no encontrada' });
        const destSuite = destSuiteRes.rows[0];

        if (sourceSuite.use_case_id !== destSuite.use_case_id) {
            return res.status(400).json({ error: 'Solo se pueden mover TC entre suites del mismo Caso de Uso.' });
        }

        const updateRes = await query(`UPDATE qa_test_cases SET suite_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [new_suite_id, req.user.id, tcId]);

        if (updateRes.changes === 0) {
            return res.status(500).json({ error: 'El Test Case no pudo ser movido. El UPDATE no afectó ninguna fila.' });
        }

        res.json({ ok: true, moved: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/test-cases/:id', requireAuth, async (req, res) => {
    try {
        const tcId = req.params.id;
        const fields = [];
        const params = [];
        const allowedFields = ['us_id', 'scenario_id', 'title', 'steps', 'expected_result', 'assigned_to', 'priority', 'is_smoke', 'is_regression', 'is_integration', 'is_exploratory', 'preconditions', 'jira_epic_key', 'assumptions', 'test_data', 'acceptance_criteria'];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                fields.push(`${field} = ?`);
                params.push(req.body[field]);
            }
        });

        if (fields.length > 0) {
            fields.push(`updated_by = ?`);
            params.push(req.user.id);
            params.push(req.params.id);
            await query(`UPDATE qa_test_cases SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

            // --- NUEVA LÓGICA: Sincronizar título con el Escenario ---
            const tcRes = await query(`SELECT title, us_id, scenario_id FROM qa_test_cases WHERE id = ?`, [tcId]);
            const tc = tcRes.rows[0];
            
            if (tc && tc.us_id && !tc.scenario_id) {
                // 1. Crear escenario si no existe pero hay US vinculada
                const scenarioRes = await query(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, (SELECT COALESCE(MAX(order_index)+1, 0) FROM qa_scenarios WHERE us_id = ?)) RETURNING id`,
                    [tc.us_id, tc.title, tc.us_id]
                );
                const newScenarioId = scenarioRes.rows[0].id;
                await query(`UPDATE qa_test_cases SET scenario_id = ? WHERE id = ?`, [newScenarioId, tcId]);
                
                // 2. Vincular al campo de texto de la HU para compatibilidad
                await query(
                    `UPDATE qa_user_stories SET escenarios_prueba = CASE WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ? ELSE escenarios_prueba || CHR(10) || ? END WHERE id = ?`,
                    [tc.title, tc.title, tc.us_id]
                );
            } else if (tc && tc.scenario_id && req.body.title !== undefined) {
                // 3. Actualizar título del escenario si ya existe y cambió el título del test
                await query(`UPDATE qa_scenarios SET title = ? WHERE id = ?`, [req.body.title, tc.scenario_id]);
            }
            // --------------------------------------------------------
        }

        const { status, observations, obtained_result } = req.body;

        // Si viene status o metadata de ejecución, actualizar/crear ejecución
        if (status || observations !== undefined || obtained_result !== undefined) {
            // Buscar run activo
            const tcInfo = await query(`SELECT suite_id FROM qa_test_cases WHERE id = ?`, [tcId]);
            const suiteId = tcInfo.rows[0]?.suite_id;
            const suiteInfo = await query(`SELECT active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
            const runId = suiteInfo.rows[0]?.active_run_id;

            if (!runId) {
                return res.status(400).json({ error: 'No hay un ciclo de ejecución activo para esta suite. Inicia uno para registrar resultados.' });
            }

            let execId = null;
            const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? AND run_id = ?`, [tcId, runId]);
            if (execRes.rows.length > 0) {
                execId = execRes.rows[0].id;
                const execFields = [];
                const execParams = [];
                if (status !== undefined) { execFields.push('status = ?'); execParams.push(status); }
                if (observations !== undefined) { execFields.push('observations = ?'); execParams.push(observations); }
                if (obtained_result !== undefined) { execFields.push('obtained_result = ?'); execParams.push(obtained_result); }
                
                if (execFields.length > 0) {
                    execParams.push(execId);
                    await query(`UPDATE qa_executions SET ${execFields.join(', ')} WHERE id = ?`, execParams);
                }
            } else {
                const insertRes = await query(`INSERT INTO qa_executions (tc_id, run_id, tester, status, observations, obtained_result) VALUES (?, ?, ?, ?, ?, ?)`, 
                    [tcId, runId, req.user.name, status || 'PENDING', observations || '', obtained_result || '']);
                execId = insertRes.lastID;
            }
            const { bug_title, bug_description, bug_severity, bug_steps_to_reproduce, bug_expected_result, bug_actual_result, bug_frequency, bug_business_impact } = req.body;
            if (bug_title && (status === 'FAIL' || status === 'WARNING')) {
                // Heredar épica de la suite
                const suiteInfo = await query(`
                    SELECT s.jira_epic_key 
                    FROM qa_test_suites s
                    JOIN qa_test_cases tc ON s.id = tc.suite_id
                    WHERE tc.id = ?
                `, [tcId]);
                const jira_epic_key = suiteInfo.rows[0]?.jira_epic_key || '';

                // Evitar duplicados exactos en la misma ejecución
                const existingBug = await query(`SELECT id FROM qa_defects WHERE execution_id = ? AND title = ?`, [execId, bug_title]);
                if (existingBug.rows.length === 0) {
                    await query(`INSERT INTO qa_defects (execution_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, status, jira_epic_key) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`, 
                        [execId, bug_title, bug_description || '', bug_severity || 'Media', bug_steps_to_reproduce || '', bug_expected_result || '', bug_actual_result || '', bug_frequency || 'Siempre', bug_business_impact || '', jira_epic_key]);
                }
            }
            res.json({ ok: true, execution_id: execId });
        } else {
            res.json({ ok: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/test-cases/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_test_cases WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/test-suites/:id/move', requireAuth, async (req, res) => {
    try {
        const suiteId = req.params.id;
        const { new_use_case_id } = req.body;

        console.log(`[MOVE SUITE] Request received: suiteId=${suiteId}, new_use_case_id=${new_use_case_id}, user=${req.user.id}`);

        if (!new_use_case_id) return res.status(400).json({ error: 'new_use_case_id requerido' });

        const suiteRes = await query(`SELECT id, use_case_id, active_run_id FROM qa_test_suites WHERE id = ?`, [suiteId]);
        if (!suiteRes.rows.length) return res.status(404).json({ error: 'Suite no encontrada' });
        const suite = suiteRes.rows[0];

        console.log(`[MOVE SUITE] Suite found: id=${suite.id}, current_uc=${suite.use_case_id}, active_run_id=${suite.active_run_id}`);

        if (suite.active_run_id) {
            return res.status(400).json({ error: 'La suite está en ejecución. No se puede mover.' });
        }

        const linkedRes = await query(`SELECT COUNT(*) as cnt FROM qa_test_cases WHERE suite_id = ? AND us_id IS NOT NULL`, [suiteId]);
        const linkedCount = linkedRes.rows[0].cnt;
        if (linkedCount > 0) {
            return res.status(400).json({ error: `La suite tiene ${linkedCount} TC(s) vinculados a HU. Desvinculá las HU antes de mover.` });
        }

        const sourceCURRes = await query(`SELECT id, project_id FROM qa_use_cases WHERE id = ?`, [suite.use_case_id]);
        if (!sourceCURRes.rows.length) return res.status(404).json({ error: 'CU origen no encontrado' });
        const sourceCU = sourceCURRes.rows[0];

        const destCURRes = await query(`SELECT id, project_id FROM qa_use_cases WHERE id = ?`, [new_use_case_id]);
        if (!destCURRes.rows.length) return res.status(404).json({ error: 'CU destino no encontrado' });
        const destCU = destCURRes.rows[0];

        if (sourceCU.project_id !== destCU.project_id) {
            return res.status(400).json({ error: 'Solo se pueden mover suites entre CU del mismo proyecto.' });
        }

        const updateRes = await query(`UPDATE qa_test_suites SET use_case_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [new_use_case_id, req.user.id, suiteId]);

        console.log(`[MOVE SUITE] UPDATE result: rowCount=${updateRes.changes}, suiteId=${suiteId}, new_uc=${new_use_case_id}`);

        if (updateRes.changes === 0) {
            console.error(`[MOVE SUITE] CRITICAL: UPDATE affected 0 rows for suiteId=${suiteId}`);
            return res.status(500).json({ error: 'La suite no pudo ser movida. El UPDATE no afectó ninguna fila.' });
        }

        res.json({ ok: true, moved: true, new_use_case_id });
    } catch (err) {
        console.error(`[MOVE SUITE] Error:`, err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/test-suites/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, assigned_to, jira_epic_key } = req.body;
        await query(`UPDATE qa_test_suites SET title = COALESCE(?, title), description = COALESCE(?, description), assigned_to = COALESCE(?, assigned_to), jira_epic_key = COALESCE(?, jira_epic_key), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, description, assigned_to, jira_epic_key, req.user.id, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/test-suites/:id/assign-all', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        const suiteId = parseInt(req.params.id);
        const userId = assigned_to ? parseInt(assigned_to) : null;
        await query('UPDATE qa_test_cases SET assigned_to = ? WHERE suite_id = ?', [userId, suiteId]);
        res.json({ ok: true, updated_suite_id: suiteId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── DEFECTOS & BUGS (Avanzado) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/defects', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const sql = `
            SELECT 
                d.*, 
                tc.title as tc_title, 
                tc.key_id as tc_key,
                e.tester as tester_name,
                r.id as run_id,
                assignee.name as assignee_name
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            JOIN qa_test_runs r ON e.run_id = r.id
            LEFT JOIN qa_users assignee ON d.assigned_to = assignee.id
            WHERE cu.project_id = ?
            ORDER BY d.id DESC
        `;
        const result = await query(sql, [project_id]);
        res.json({ defects: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/defects/jira-status', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const defectsRes = await query(`
            SELECT DISTINCT d.jira_key
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            WHERE cu.project_id = ? AND d.jira_key IS NOT NULL
            UNION
            SELECT d.jira_key
            FROM qa_defects d
            WHERE d.project_id = ? AND d.jira_key IS NOT NULL
        `, [project_id, project_id]);

        if (defectsRes.rows.length === 0) return res.json({ statuses: {} });

        const configRes = await query(`
            SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?
        `, [project_id]);

        if (configRes.rows.length === 0) return res.json({ statuses: {} });
        const config = configRes.rows[0];

        const userCreds = await getJiraUserCredentials(project_id, req.user.id);
        if (userCreds.error) return res.json({ statuses: {} });

        const keys = defectsRes.rows.map(d => d.jira_key);
        const jql = `key in (${keys.map(k => `"${k}"`).join(',')})`;
        const issues = await JiraService.searchIssues(
            userCreds.userCredentials,
            config.jira_domain,
            jql,
            null,
            ['status', 'statusCategory']
        );

        const statuses = {};
        for (const issue of issues) {
            statuses[issue.key] = {
                status: issue.fields.status?.name || 'Unknown',
                statusCategory: issue.fields.statusCategory?.name || 'Unknown'
            };
        }

        res.json({ statuses });
    } catch (err) {
        console.error('Error fetching JIRA statuses:', err.message);
        res.json({ statuses: {} });
    }
});

app.put('/api/defects/:id/assign', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        await query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ?`, [assigned_to || null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── HALLAZGOS QA ──
// ══════════════════════════════════════════════════════════════

app.get('/api/hallazgos', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const sql = `
            SELECT d.id, d.title, d.description, d.severity, d.status, d.steps_to_reproduce,
                   d.expected_result, d.actual_result, d.frequency, d.business_impact,
                   d.assigned_to, d.jira_key, d.jira_url, d.jira_epic_key, d.project_id,
                   d.created_by, d.created_at,
                   d.preconditions, d.observations,
                   assignee.name as assignee_name,
                   (SELECT COUNT(*) FROM qa_attachments WHERE defect_id = d.id) as evidence_count,
                   ht.tc_id IS NOT NULL as converted_to_tc,
                   ht.tc_id as converted_tc_id
            FROM qa_defects d
            LEFT JOIN qa_hallazgo_tc ht ON d.id = ht.hallazgo_id
            LEFT JOIN qa_users assignee ON d.assigned_to = assignee.id
            WHERE d.project_id = ? AND d.execution_id IS NULL
            ORDER BY d.id DESC
            LIMIT 500
        `;
        const result = await query(sql, [project_id]);
        res.json({ hallazgos: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hallazgos', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_cu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { project_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title son requeridos' });

        const result = await query(
            `INSERT INTO qa_defects (project_id, title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
            [project_id, title, description || '', severity || 'Media', steps_to_reproduce || '', expected_result || '', actual_result || '', frequency || 'Siempre', business_impact || '', preconditions || '', observations || '', assigned_to || null, req.user.id]
        );
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/hallazgos/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, severity, steps_to_reproduce, expected_result, actual_result, frequency, business_impact, preconditions, observations, assigned_to } = req.body;
        const fields = [];
        const params = [];
        ['title', 'description', 'severity', 'steps_to_reproduce', 'expected_result', 'actual_result', 'frequency', 'business_impact', 'preconditions', 'observations', 'assigned_to'].forEach(f => {
            if (req.body[f] !== undefined) {
                fields.push(`${f} = ?`);
                params.push(req.body[f]);
            }
        });
        if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
        params.push(req.params.id);
        await query(`UPDATE qa_defects SET ${fields.join(', ')} WHERE id = ? AND execution_id IS NULL`, params);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hallazgos/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_defects WHERE id = ? AND execution_id IS NULL`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/hallazgos/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status requerido' });
        await query(`UPDATE qa_defects SET status = ? WHERE id = ? AND execution_id IS NULL`, [status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/hallazgos/:id/assign', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        await query(`UPDATE qa_defects SET assigned_to = ? WHERE id = ? AND execution_id IS NULL`, [assigned_to || null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hallazgos/:id/convert-to-tc', requireAuth, async (req, res) => {
    try {
        const { suite_id } = req.body;
        if (!suite_id) return res.status(400).json({ error: 'suite_id requerido' });

        // 1. Leer hallazgo
        const hallazgoRes = await query(`SELECT * FROM qa_defects WHERE id = ? AND execution_id IS NULL`, [req.params.id]);
        if (hallazgoRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });
        const h = hallazgoRes.rows[0];

        // 2. Obtener proyecto y generar key
        const projectRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = (SELECT use_case_id FROM qa_test_suites WHERE id = ?)`, [suite_id]);
        const projectId = projectRes.rows[0]?.project_id;
        if (!projectId) return res.status(400).json({ error: 'Suite no encontrada' });

        const keyRes = await query(`SELECT generate_key(?, 'TC') as key_id`, [projectId]);
        const finalKeyId = keyRes.rows[0]?.key_id || null;

        // 3. Crear Test Case con datos del hallazgo
        const tcRes = await query(
            `INSERT INTO qa_test_cases (suite_id, title, steps, expected_result, created_by, updated_by, key_id)
             VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [suite_id, h.title, h.steps_to_reproduce || '', h.expected_result || '', req.user.id, req.user.id, finalKeyId]
        );
        const tcId = tcRes.rows[0].id;

        // 4. Registrar relación
        await query(`INSERT INTO qa_hallazgo_tc (hallazgo_id, tc_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [h.id, tcId]);

        res.json({ ok: true, tc_id: tcId, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jira/hallazgos/:id/create-ticket', requireAuth, async (req, res) => {
    try {
        const hallazgoId = req.params.id;
        const { epicId, assigneeId, priorityId, customFields } = req.body;

        const bugRes = await query(`
            SELECT d.*, u.name as tester_name
            FROM qa_defects d
            LEFT JOIN qa_users u ON d.created_by = u.id
            WHERE d.id = ? AND d.execution_id IS NULL
        `, [hallazgoId]);
        if (bugRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado.' });
        const bug = bugRes.rows[0];

        const projectId = bug.project_id;

        const evidenceRes = await query(`SELECT file_name, mime_type, file_data FROM qa_attachments WHERE defect_id = ?`, [hallazgoId]);
        if (evidenceRes.rows.length > 0) {
            bug.evidences = evidenceRes.rows.map(r => r.file_name);
        }

        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const jiraResult = await JiraService.createIssue(creds.userCredentials, creds.projectKey, creds.domain, bug, epicId, assigneeId, priorityId, customFields);
        const jiraUrl = `${jiraResult.self.split('/rest/')[0]}/browse/${jiraResult.key}`;

        let attachmentCount = 0;
        const attachmentErrors = [];
        if (evidenceRes.rows.length > 0) {
            for (const ev of evidenceRes.rows) {
                try {
                    const fileBuffer = Buffer.from(ev.file_data.replace(/^\\x/, ''), 'hex');
                    await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, fileBuffer, ev.mime_type);
                    attachmentCount++;
                } catch (attachErr) {
                    attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
                }
            }
        }

        await query(`UPDATE qa_defects SET jira_key = ?, jira_url = ? WHERE id = ?`, [jiraResult.key, jiraUrl, hallazgoId]);

        res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
    } catch (err) {
        console.error("Error al crear ticket en Jira:", err);
        res.status(500).json({ error: err.message });
    }
});

const { generateReport, generateMultiReport } = require('./report-generator');

app.get('/api/reports/multi', requireAuth, async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0);
        if (ids.length < 2) return res.status(400).json({ error: 'Se requieren al menos 2 IDs de ejecución' });
        const html = await generateMultiReport(ids);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/:runId', requireAuth, async (req, res) => {
    try {
        const html = await generateReport(req.params.runId);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── EVIDENCIAS (Streaming) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/evidence/:id', requireAuth, async (req, res) => {
    try {
        const result = await query(`SELECT mime_type, encode(file_data, 'base64') as file_b64 FROM qa_attachments WHERE id = ?`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
        
        const row = result.rows[0];
        res.setHeader('Content-Type', row.mime_type);
        res.send(Buffer.from(row.file_b64, 'base64'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/evidence', requireAuth, upload.single('evidence'), async (req, res) => {
    try {
        const { tc_id, defect_id, category } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        if (defect_id) {
            await query(`
                INSERT INTO qa_attachments (defect_id, file_name, mime_type, file_data, evidence_category)
                VALUES (?, ?, ?, ?, ?)
            `, [defect_id, file.originalname, file.mimetype, file.buffer, category || 'GENERAL']);
        } else {
            const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc_id]);
            if (execRes.rows.length === 0) return res.status(400).json({ error: 'No hay una ejecución reciente para este Test Case' });
            const executionId = execRes.rows[0].id;
            await query(`
                INSERT INTO qa_attachments (execution_id, file_name, mime_type, file_data, evidence_category)
                VALUES (?, ?, ?, ?, ?)
            `, [executionId, file.originalname, file.mimetype, file.buffer, category || 'GENERAL']);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/evidence/:id', requireAuth, async (req, res) => {
    try {
        const result = await query(`DELETE FROM qa_attachments WHERE id = ?`, [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/hallazgos/:id/evidence', requireAuth, async (req, res) => {
    try {
        const result = await query(`
            SELECT id, file_name, mime_type, evidence_category, created_at
            FROM qa_attachments WHERE defect_id = ? ORDER BY id
        `, [req.params.id]);
        res.json({ evidence: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── ISSUE SAVE (Legacy — Guardado Multipart Atómico) ──
// ══════════════════════════════════════════════════════════════

app.post('/api/issue', requireAuth, upload.any(), async (req, res) => {
    await query('BEGIN TRANSACTION');

    try {
        const fields = req.body;
        const files = req.files || [];

        // Buscar suite
        const suiteId = fields.suite_id;
        if (!suiteId) throw new Error("suite_id requerido");

        // Procesar Test Cases (test_list_v2)
        if (fields.test_list_v2) {
            const listV2 = JSON.parse(fields.test_list_v2);
            for (const t of listV2) {
                if (t.isSection) continue;

                let tcId = t.id;
                if (!tcId) {
                    const projectId = await getProjectIdFromSuite(suiteId);
                    const finalKeyId = await generateKey(projectId, 'TC');
                    const tcRes = await query(`INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`, [suiteId, t.title || 'Sin título', finalKeyId]);
                    tcId = tcRes.lastID;
                } else {
                    await query(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [t.title || 'Sin título', tcId]);
                }

                let execId;
                const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]);
                if (execRes.rows.length > 0) {
                    execId = execRes.rows[0].id;
                    await query(`UPDATE qa_executions SET status = ? WHERE id = ?`, [t.status || 'PENDING', execId]);
                } else {
                    const newExecRes = await query(`INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`, [tcId, t.status || 'PENDING']);
                    execId = newExecRes.lastID;
                }

                if (t.sbs && t.sbs.length > 0) {
                    const row = t.sbs[0];
                    
                    const processCategory = async (attData, category) => {
                        if (!attData) return;
                        if (attData.pending) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                            const file = files.find(f => f.fieldname === attData.pending);
                            if (file) await saveAttachment(execId, null, file, category);
                        } else if (!attData.src) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                        }
                    };

                    await processCategory(row.figma, 'FIGMA');
                    await processCategory(row.dev, 'DEV');
                }
            }
        }

        await query('COMMIT');
        res.json({ ok: true, message: 'Guardado correctamente' });

    } catch (err) {
        await query('ROLLBACK');
        console.error("Error en POST /api/issue:", err);
        res.status(500).json({ error: 'Error al guardar. Cambios revertidos.' });
    }
});

// Helper para compresión on-the-fly y guardado de adjunto
async function saveAttachment(execId, defectId, fileObj, category) {
    let finalBuffer = fileObj.buffer;
    let mime = fileObj.mimetype;
    let filename = fileObj.originalname;

    // Solo comprimir si es imagen (ignorar videos/pdfs)
    if (mime.startsWith('image/')) {
        finalBuffer = await sharp(fileObj.buffer)
            .webp({ quality: 80 })
            .toBuffer();
        mime = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
    }

    await query(
        `INSERT INTO qa_attachments (execution_id, defect_id, file_name, mime_type, evidence_category, file_data) VALUES (?, ?, ?, ?, ?, ?)`,
        [execId, defectId, filename, mime, category, finalBuffer]
    );
}

// ══════════════════════════════════════════════════════════════
// ── REPORTE ──
// ══════════════════════════════════════════════════════════════

app.post('/api/report', requireAuth, async (req, res) => {
    try {
        exec(`python qa_report_builder.py`, { cwd: BASE_DIR }, (err, stdout, stderr) => {
            if (err) return res.status(500).json({ error: stderr || err.message });
            res.json({ ok: true, output: stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── LEGACY COMPAT (para reporte Python) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/data', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) {
            // Fallback: primer proyecto activo
            const proj = await query(`SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
            if (proj.rows.length === 0) return res.json({ pruebas: [] });
            return res.redirect(`/api/data?project_id=${proj.rows[0].id}`);
        }

        const useCases = await query(`SELECT * FROM qa_use_cases WHERE project_id = ?`, [project_id]);
        const pruebas = [];

        for (const cu of useCases.rows) {
            const stories = await query(`SELECT * FROM qa_user_stories WHERE use_case_id = ?`, [cu.id]);
            for (const us of stories.rows) {
                const suites = await query(`SELECT * FROM qa_test_suites WHERE us_id = ?`, [us.id]);
                for (const suite of suites.rows) {
                    const cases = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ? ORDER BY id`, [suite.id]);
                    const testList = [];
                    
                    // Buscar si hay un run activo para esta suite
                    const activeRunRes = await query(`SELECT * FROM qa_test_runs WHERE id = ? AND status = 'ACTIVE'`, [suite.active_run_id]);
                    const activeRun = activeRunRes.rows[0] || null;

                    for (const tc of cases.rows) {
                        let exec = null;
                        if (activeRun) {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.id]);
                            if (execRes.rows.length > 0) {
                                exec = execRes.rows[0];
                            } else if (activeRun.run_type === 'RETEST' && activeRun.parent_run_id) {
                                const parentExecRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.parent_run_id]);
                                if (parentExecRes.rows.length > 0) {
                                    exec = parentExecRes.rows[0];
                                    exec.is_from_parent = true;
                                }
                            }
                        } else {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc.id]);
                            exec = execRes.rows.length > 0 ? execRes.rows[0] : null;
                        }

                        const defects = [];
                        if (exec) {
                            const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [exec.id]);
                            defRes.rows.forEach(d => defects.push(d));
                        }

                        testList.push({
                            id: tc.id,
                            title: tc.title,
                            status: exec ? exec.status : 'PENDING',
                            execution_id: exec ? exec.id : null,
                            is_from_parent: exec ? !!exec.is_from_parent : false,
                            defects: defects,
                            isSection: false,
                            sbs: [{ figma: null, dev: null }]
                        });
                    }
                    pruebas.push({
                        id: suite.id,
                        feature: suite.title,
                        modulo: us.title,
                        status: testList.every(t => t.status === 'OK' || t.status === 'PASS') ? 'OK' : (testList.some(t => t.status === 'FAIL') ? 'FAIL' : 'PENDING'),
                        test_list_v2: testList
                    });
                }
            }
        }

        res.json({ pruebas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inicialización
// ── Inicialización de Servidor HTTP y WebSocket ──
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Gestión de notificaciones Realtime vía Postgres
function setupRealtime() {
    setupRealtimeChannel((payload) => {
        // Broadcast a todos los clientes conectados
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(payload));
            }
        });
    });
    console.log('📡 Realtime: Listening for database changes via Supabase Realtime...');
}


