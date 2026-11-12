const path = require('path');
const { query } = require('../../db');
const evidenceStore = require('../../modules/evidence-store');

// El módulo vive en src/bootstrap: la raíz del repo está dos niveles arriba.
const BASE_DIR = path.join(__dirname, '..', '..');

/**
 * Migraciones idempotentes (ALTER/CREATE ... IF NOT EXISTS) + seed del admin.
 * Corre en background al arrancar: no bloquea el listen del servidor.
 */
async function runSchemaMigrations() {
    const bootStartedAt = Date.now();

    try {
        // Init local evidence store (SQLite + filesystem) BEFORE the schema
        // migrations so the index is ready when the PG ALTERs land.
        evidenceStore.init({ baseDir: BASE_DIR });
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
        await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS defect_id INTEGER REFERENCES qa_defects(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS accumulated_seconds INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS last_resume_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'RUNNING'`);
        // ── Exploratory Testing (módulo Exploratoria) ──
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS charter TEXT`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS timebox_minutes INTEGER`);
        // Cobertura de TC declarada por el tester: si está en false, los
        // reportes muestran una alerta (el regresivo no está cubierto).
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS coverage_ready BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS coverage_ready_at TIMESTAMP`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS coverage_ready_by INTEGER REFERENCES qa_users(id) ON DELETE SET NULL`);
        // Fecha límite obligatoria de la sesión exploratoria (con zona horaria).
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ`);
        // Historial de extensiones de fecha (con justificación).
        await query(`
            CREATE TABLE IF NOT EXISTS qa_exploratory_extensions (
                id SERIAL PRIMARY KEY,
                run_id INTEGER NOT NULL REFERENCES qa_test_runs(id) ON DELETE CASCADE,
                previous_deadline TIMESTAMPTZ,
                new_deadline TIMESTAMPTZ NOT NULL,
                reason TEXT NOT NULL,
                created_by INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migración de columnas creadas como TIMESTAMP (sin zona) a TIMESTAMPTZ.
        // Se consulta el tipo y se altera solo si hace falta (idempotente, sin DO).
        const deadlineType = await query(`
            SELECT data_type FROM information_schema.columns
             WHERE table_name = 'qa_test_runs' AND column_name = 'deadline_at'
        `);
        if (deadlineType.rows[0]?.data_type === 'timestamp without time zone') {
            await query(`
                ALTER TABLE qa_test_runs
                    ALTER COLUMN deadline_at TYPE TIMESTAMPTZ USING deadline_at AT TIME ZONE 'UTC'
            `);
        }
        const extensionType = await query(`
            SELECT data_type FROM information_schema.columns
             WHERE table_name = 'qa_exploratory_extensions' AND column_name = 'new_deadline'
        `);
        if (extensionType.rows[0]?.data_type === 'timestamp without time zone') {
            await query(`
                ALTER TABLE qa_exploratory_extensions
                    ALTER COLUMN previous_deadline TYPE TIMESTAMPTZ USING previous_deadline AT TIME ZONE 'UTC'
            `);
            await query(`
                ALTER TABLE qa_exploratory_extensions
                    ALTER COLUMN new_deadline TYPE TIMESTAMPTZ USING new_deadline AT TIME ZONE 'UTC'
            `);
        }
        const createdAtType = await query(`
            SELECT data_type FROM information_schema.columns
             WHERE table_name = 'qa_exploratory_extensions' AND column_name = 'created_at'
        `);
        if (createdAtType.rows[0]?.data_type === 'timestamp without time zone') {
            await query(`
                ALTER TABLE qa_exploratory_extensions
                    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'
            `);
        }

        // Backfill: las sesiones existentes reciben una fecha límite (7 días
        // desde su inicio) para que la regla aplique desde ya.
        await query(`
            UPDATE qa_test_runs
               SET deadline_at = COALESCE(started_at, CURRENT_TIMESTAMP) + INTERVAL '7 days'
             WHERE run_type = 'EXPLORATORY' AND deadline_at IS NULL
        `);
        // Hallazgos creados dentro de una sesión exploratoria (sin ejecución).
        await query(`ALTER TABLE qa_defects ADD COLUMN IF NOT EXISTS exploratory_run_id INTEGER REFERENCES qa_test_runs(id) ON DELETE CASCADE`);
        // Métricas de sesiones exploratorias (persistidas en PG, no SQLite)
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS total_flows INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS ok_count INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS block_count INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS skip_count INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_test_runs ADD COLUMN IF NOT EXISTS pending_count INTEGER DEFAULT 0`);
        await query(`
            CREATE OR REPLACE FUNCTION recalc_exploratory_metrics(p_run_id INTEGER)
            RETURNS VOID AS $$
            DECLARE
                v_total INTEGER;
                v_ok INTEGER;
                v_fail INTEGER;
                v_warning INTEGER;
                v_block INTEGER;
                v_skip INTEGER;
                v_pending INTEGER;
            BEGIN
                SELECT COUNT(*) INTO v_total FROM qa_executions WHERE run_id = p_run_id;
                SELECT COUNT(*) INTO v_ok FROM qa_executions WHERE run_id = p_run_id AND status = 'OK';
                SELECT COUNT(*) INTO v_fail FROM qa_executions WHERE run_id = p_run_id AND status = 'FAIL';
                SELECT COUNT(*) INTO v_warning FROM qa_executions WHERE run_id = p_run_id AND status = 'WARNING';
                SELECT COUNT(*) INTO v_block FROM qa_executions WHERE run_id = p_run_id AND status = 'BLOCK';
                SELECT COUNT(*) INTO v_skip FROM qa_executions WHERE run_id = p_run_id AND status = 'SKIP';
                SELECT COUNT(*) INTO v_pending FROM qa_executions WHERE run_id = p_run_id AND status = 'PENDING';
                UPDATE qa_test_runs
                SET total_flows = v_total,
                    ok_count = v_ok,
                    fail_count = v_fail,
                    warning_count = v_warning,
                    block_count = v_block,
                    skip_count = v_skip,
                    pending_count = v_pending
                WHERE id = p_run_id;
            END;
            $$ LANGUAGE plpgsql
        `);

        // Migraciones para qa_use_cases
        await query(`ALTER TABLE qa_use_cases ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_use_cases ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES qa_users(id)`);

        // Migraciones para qa_user_stories
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS hu_detallada TEXT`);
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_user_stories ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES qa_users(id)`);

        // Migraciones para qa_test_cases
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS key_id VARCHAR(50)`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS steps TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS assumptions TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS test_data TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS scenario_id INTEGER REFERENCES qa_scenarios(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS preconditions TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS jira_epic_key TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS observations TEXT`);
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS is_exploratory BOOLEAN DEFAULT false`);
        try { await query(`CREATE INDEX IF NOT EXISTS idx_tc_is_exploratory ON qa_test_cases (is_exploratory) WHERE is_exploratory = true`); } catch(e) { console.warn('⚠️ idx_tc_is_exploratory no creado (limitación Supabase):', e.message); }
        await query(`CREATE INDEX IF NOT EXISTS idx_runs_proj_type ON qa_test_runs (project_id, run_type)`);

        // qa_executions: run_id lo usa server.js:2463+ en cada INSERT de ejecucion
        await query(`ALTER TABLE qa_executions ADD COLUMN IF NOT EXISTS run_id INTEGER REFERENCES qa_test_runs(id) ON DELETE CASCADE`);
        await query(`ALTER TABLE qa_executions ADD COLUMN IF NOT EXISTS accumulated_seconds INTEGER DEFAULT 0`);
        await query(`ALTER TABLE qa_executions ADD COLUMN IF NOT EXISTS last_resume_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

        // Migraciones para qa_test_suites
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS key_id VARCHAR(50)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS jira_epic_key TEXT`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES qa_users(id)`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS inconsistencies TEXT DEFAULT '[]'`);
        await query(`ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
        
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
        try { await query(`CREATE INDEX IF NOT EXISTS idx_defects_jira_key  ON qa_defects (jira_key) WHERE jira_key IS NOT NULL`); } catch(e) { console.warn('⚠️ idx_defects_jira_key no creado (limitación Supabase):', e.message); }
        await query(`CREATE INDEX IF NOT EXISTS idx_defects_project_id ON qa_defects (project_id)`);
await query(`CREATE INDEX IF NOT EXISTS idx_defects_proj_exec ON qa_defects (project_id, execution_id)`);
        await query(`CREATE TABLE IF NOT EXISTS qa_project_sequences (
            project_id INTEGER NOT NULL REFERENCES qa_projects(id) ON DELETE CASCADE,
            prefix VARCHAR(20) NOT NULL,
            last_number INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (project_id, prefix)
        )`);
        await query(`CREATE TABLE IF NOT EXISTS qa_hallazgo_tc (
            hallazgo_id INTEGER REFERENCES qa_defects(id) ON DELETE CASCADE,
            tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (hallazgo_id, tc_id)
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_tc_hallazgo ON qa_hallazgo_tc (hallazgo_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_tc_tc       ON qa_hallazgo_tc (tc_id)`);

        // ── Hallazgos: severity en qa_test_cases + junction qa_hallazgo_bug ──
        await query(`ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS severity VARCHAR(50) DEFAULT 'Media'`);
        await query(`
            CREATE TABLE IF NOT EXISTS qa_hallazgo_bug (
                hallazgo_id INTEGER NOT NULL REFERENCES qa_defects(id) ON DELETE CASCADE,
                defect_id   INTEGER NOT NULL REFERENCES qa_defects(id) ON DELETE CASCADE,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (hallazgo_id, defect_id),
                CHECK (hallazgo_id <> defect_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_bug_hallazgo ON qa_hallazgo_bug (hallazgo_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_hallazgo_bug_defect   ON qa_hallazgo_bug (defect_id)`);

        await query(`CREATE INDEX IF NOT EXISTS idx_suites_uc_id      ON qa_test_suites (use_case_id)`);
        // Índices parciales: exec_query de Supabase no soporta WHERE en CREATE INDEX (502 Bad Gateway)
        try { await query(`CREATE INDEX IF NOT EXISTS idx_suites_active_run ON qa_test_suites (active_run_id) WHERE active_run_id IS NOT NULL`); } catch(e) { console.warn('⚠️ idx_suites_active_run no creado (limitación Supabase):', e.message); }
        try { await query(`CREATE INDEX IF NOT EXISTS idx_suites_is_active  ON qa_test_suites (is_active) WHERE is_active = false`); } catch(e) { console.warn('⚠️ idx_suites_is_active no creado (limitación Supabase):', e.message); }
        await query(`CREATE INDEX IF NOT EXISTS idx_uc_project_id     ON qa_use_cases (project_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_us_uc_id          ON qa_user_stories (use_case_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_scenarios_us_id       ON qa_scenarios (us_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_inconsistencias_us_id ON qa_inconsistencias (us_id)`);

        // ── Integridad: project_id heredado desde suite/run/ejecución (nunca NULL en tablas de hechos) ──
        try {
            await query(`CREATE OR REPLACE FUNCTION qa_fill_project_id() RETURNS trigger AS $fn$
DECLARE v_pid integer;
BEGIN
  IF NEW.project_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('qa_test_cases','qa_test_runs') THEN
    SELECT project_id INTO v_pid FROM qa_test_suites WHERE id = NEW.suite_id;
  ELSIF TG_TABLE_NAME = 'qa_user_stories' THEN
    SELECT project_id INTO v_pid FROM qa_use_cases WHERE id = NEW.use_case_id;
  ELSIF TG_TABLE_NAME = 'qa_executions' THEN
    SELECT COALESCE(
      (SELECT project_id FROM qa_test_suites WHERE id = NEW.suite_id),
      (SELECT project_id FROM qa_test_runs WHERE id = NEW.run_id),
      (SELECT s.project_id FROM qa_test_cases tc JOIN qa_test_suites s ON s.id = tc.suite_id WHERE tc.id = NEW.tc_id)
    ) INTO v_pid;
  ELSIF TG_TABLE_NAME = 'qa_defects' THEN
    SELECT COALESCE(
      (SELECT project_id FROM qa_test_suites WHERE id = NEW.suite_id),
      (SELECT project_id FROM qa_executions WHERE id = NEW.execution_id)
    ) INTO v_pid;
  ELSIF TG_TABLE_NAME = 'qa_attachments' THEN
    SELECT COALESCE(
      (SELECT project_id FROM qa_executions WHERE id = NEW.execution_id),
      (SELECT project_id FROM qa_defects WHERE id = NEW.defect_id)
    ) INTO v_pid;
  END IF;
  NEW.project_id := v_pid;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql`);
            // exec_query (RPC Supabase) no tiene 'do' en su whitelist de DDL y envuelve
            // cualquier otro statement en un subquery SELECT, lo que rompe los bloques DO con
            // "syntax error at or near DO" (42601). Se crean triggers individuales con
            // DROP IF EXISTS + CREATE (ambos en la whitelist) para que el arranque sea
            // idempotente y sin errores en BD nueva ni existente.
            const fillPidTriggers = [
                ['qa_test_cases',   'trg_fill_pid_qa_test_cases'],
                ['qa_test_runs',    'trg_fill_pid_qa_test_runs'],
                ['qa_executions',   'trg_fill_pid_qa_executions'],
                ['qa_defects',      'trg_fill_pid_qa_defects'],
                ['qa_attachments',  'trg_fill_pid_qa_attachments'],
                ['qa_user_stories', 'trg_fill_pid_qa_user_stories'],
            ];
            for (const [tabla, trg] of fillPidTriggers) {
                try {
                    await query(`DROP TRIGGER IF EXISTS ${trg} ON ${tabla}`);
                    await query(`CREATE TRIGGER ${trg} BEFORE INSERT OR UPDATE ON ${tabla} FOR EACH ROW EXECUTE FUNCTION qa_fill_project_id()`);
                } catch (e) { console.warn(`⚠️ trigger ${trg} no creado:`, e.message); }
            }
        } catch (e) { console.warn('⚠️ trigger qa_fill_project_id no creado:', e.message); }

        // Sugerencias de mejora (tab separada dentro de Hallazgos)
        await query(`
            CREATE TABLE IF NOT EXISTS qa_suggestions (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES qa_projects(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'UX',
                description TEXT DEFAULT '',
                proposed_solution TEXT DEFAULT '',
                priority VARCHAR(20) DEFAULT 'Media',
                status VARCHAR(20) DEFAULT 'OPEN',
                assigned_to INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
                created_by INTEGER REFERENCES qa_users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_suggestions_project_id ON qa_suggestions (project_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_suggestions_assigned   ON qa_suggestions (assigned_to)`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS suggestion_id INTEGER REFERENCES qa_suggestions(id) ON DELETE CASCADE`);
        await query(`CREATE INDEX IF NOT EXISTS idx_attachments_suggestion ON qa_attachments (suggestion_id)`);
        try { await query(`CREATE INDEX IF NOT EXISTS idx_attachments_execution_id ON qa_attachments (execution_id) WHERE execution_id IS NOT NULL`); } catch(e) { console.warn('⚠️ idx_attachments_execution_id no creado (limitación Supabase):', e.message); }

        // ── Local evidence store (binarios fuera de PostgreSQL) ──
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS project_id    INTEGER REFERENCES qa_projects(id) ON DELETE SET NULL`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS storage_path  TEXT`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS sha256        VARCHAR(64)`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS size_bytes    BIGINT`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS storage_kind  VARCHAR(16) DEFAULT 'legacy_pg'`);
        await query(`ALTER TABLE qa_attachments ADD COLUMN IF NOT EXISTS migrated_at   TIMESTAMP`);
        // Hacer file_data nullable: los nuevos uploads suben a disco vía evidence-store.js
        // y no escriben BYTEA. ALTER es idempotente en PG (DROP NOT NULL no falla si ya
        // es nullable). Supabase exec_query no soporta PL/pgSQL, así que un ALTER directo.
        await query(`ALTER TABLE qa_attachments ALTER COLUMN file_data DROP NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_attachments_storage_kind ON qa_attachments (storage_kind)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_attachments_sha256       ON qa_attachments (sha256)`);
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

        console.log(
            `✅ Esquema de base de datos verificado y actualizado en ${((Date.now() - bootStartedAt) / 1000).toFixed(1)}s.`
        );
    } catch (e) {
        console.error("⚠️ Error en verificación de esquema:", e.message);
    }
}

module.exports = { runSchemaMigrations };
