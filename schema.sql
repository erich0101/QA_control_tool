-- SCHEMA PARA MANUAL QA TOOL (TMS) - PostgreSQL
-- Orden: primero tablas sin dependencias, luego las que referencian.

-- ============== TABLAS SIN DEPENDENCIAS ==============

-- 0. Proyectos
CREATE TABLE IF NOT EXISTS qa_projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Autenticación y RBAC (referenciada por muchas otras)
CREATE TABLE IF NOT EXISTS qa_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Tester',
    perfil VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Configuración Jira (referencia qa_projects y qa_users)
CREATE TABLE IF NOT EXISTS qa_jira_configs (
    project_id INTEGER PRIMARY KEY REFERENCES qa_projects(id) ON DELETE CASCADE,
    jira_domain VARCHAR(255) NOT NULL,
    jira_project_key TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_jira_user_configs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES qa_projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES qa_users(id) ON DELETE CASCADE,
    jira_user_email VARCHAR(255) NOT NULL,
    encrypted_token TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
);

-- 3. Precondiciones
CREATE TABLE IF NOT EXISTS qa_preconditions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    system_state TEXT
);

-- ============== NIVEL 1: Casos de Uso y User Stories ==============

CREATE TABLE IF NOT EXISTS qa_use_cases (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    key_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'Activo',
    created_by INTEGER REFERENCES qa_users(id),
    updated_by INTEGER REFERENCES qa_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_user_stories (
    id SERIAL PRIMARY KEY,
    use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    key_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    epic VARCHAR(255),
    status VARCHAR(50) DEFAULT 'En Análisis',
    priority VARCHAR(50) DEFAULT 'Media',
    escenarios_prueba TEXT DEFAULT '',
    reglas_negocio TEXT DEFAULT '',
    scope_acordado TEXT DEFAULT '',
    fuera_scope TEXT DEFAULT '',
    precondiciones TEXT DEFAULT '',
    link_documentacion TEXT DEFAULT '',
    hu_detallada TEXT,
    recommendations TEXT,
    created_by INTEGER REFERENCES qa_users(id),
    updated_by INTEGER REFERENCES qa_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============== NIVEL 2: Escenarios, Inconsistencias, Runs ==============

CREATE TABLE IF NOT EXISTS qa_scenarios (
    id SERIAL PRIMARY KEY,
    us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_inconsistencias (
    id SERIAL PRIMARY KEY,
    us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE CASCADE,
    suite_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(50),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Runs primero (sin FK a suites por ahora, se agrega con ALTER después)
CREATE TABLE IF NOT EXISTS qa_test_runs (
    id SERIAL PRIMARY KEY,
    suite_id INTEGER,
    status VARCHAR(20) DEFAULT 'RUNNING',
    accumulated_seconds INTEGER DEFAULT 0,
    last_resume_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    created_by INTEGER REFERENCES qa_users(id),
    parent_run_id INTEGER REFERENCES qa_test_runs(id),
    run_type VARCHAR(20) DEFAULT 'FULL'
);

-- Suites (ahora puede referenciar runs)
CREATE TABLE IF NOT EXISTS qa_test_suites (
    id SERIAL PRIMARY KEY,
    use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    key_id VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    jira_epic_key TEXT,
    created_by INTEGER REFERENCES qa_users(id),
    updated_by INTEGER REFERENCES qa_users(id),
    active_run_id INTEGER REFERENCES qa_test_runs(id),
    inconsistencies TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============== NIVEL 3: Test Cases y uniones ==============

CREATE TABLE IF NOT EXISTS qa_test_cases (
    id SERIAL PRIMARY KEY,
    suite_id INTEGER REFERENCES qa_test_suites(id) ON DELETE CASCADE,
    us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE SET NULL,
    scenario_id INTEGER REFERENCES qa_scenarios(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
    key_id VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    expected_result TEXT,
    steps TEXT,
    assumptions TEXT,
    test_data TEXT,
    acceptance_criteria TEXT,
    preconditions TEXT,
    jira_epic_key TEXT,
    priority VARCHAR(20) DEFAULT 'Media',
    is_smoke BOOLEAN DEFAULT FALSE,
    is_regression BOOLEAN DEFAULT FALSE,
    is_integration BOOLEAN DEFAULT FALSE,
    is_exploratory BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_tc_preconditions (
    tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
    prc_id INTEGER REFERENCES qa_preconditions(id) ON DELETE CASCADE,
    PRIMARY KEY (tc_id, prc_id)
);

-- ============== NIVEL 4: Ejecuciones y defectos ==============

CREATE TABLE IF NOT EXISTS qa_executions (
    id SERIAL PRIMARY KEY,
    tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
    run_id INTEGER REFERENCES qa_test_runs(id) ON DELETE SET NULL,
    tester VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    environment VARCHAR(100),
    observations TEXT,
    obtained_result TEXT,
    metadata TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_defects (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50),
    root_cause VARCHAR(100),
    steps_to_reproduce TEXT,
    expected_result TEXT,
    actual_result TEXT,
    frequency VARCHAR(50),
    business_impact TEXT,
    status VARCHAR(50) DEFAULT 'OPEN',
    jira_key VARCHAR(50),
    jira_url TEXT,
    jira_epic_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_attachments (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE,
    defect_id INTEGER REFERENCES qa_defects(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    evidence_category VARCHAR(50),
    file_data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============== NIVEL 5: Permisos, asignaciones, runs ==============

CREATE TABLE IF NOT EXISTS qa_user_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES qa_users(id) ON DELETE CASCADE,
    can_create_cu INTEGER DEFAULT 0,
    can_create_hu INTEGER DEFAULT 0,
    can_create_suite INTEGER DEFAULT 0,
    can_create_test INTEGER DEFAULT 0,
    can_assign_cu INTEGER DEFAULT 0,
    can_assign_hu INTEGER DEFAULT 0,
    can_assign_suite INTEGER DEFAULT 0,
    can_execute_test INTEGER DEFAULT 0,
    can_manage_projects INTEGER DEFAULT 0,
    can_manage_users INTEGER DEFAULT 0,
    can_configure_jira INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS qa_project_users (
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES qa_users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS qa_use_case_users (
    use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES qa_users(id) ON DELETE CASCADE,
    PRIMARY KEY (use_case_id, user_id)
);

CREATE TABLE IF NOT EXISTS qa_suite_users (
    suite_id INTEGER REFERENCES qa_test_suites(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES qa_users(id) ON DELETE CASCADE,
    PRIMARY KEY (suite_id, user_id)
);

-- Resolver FKs circulares entre suites y runs
ALTER TABLE qa_test_runs ADD CONSTRAINT fk_runs_suite
    FOREIGN KEY (suite_id) REFERENCES qa_test_suites(id) ON DELETE CASCADE;

ALTER TABLE qa_inconsistencias ADD CONSTRAINT fk_inconsistencias_suite
    FOREIGN KEY (suite_id) REFERENCES qa_test_suites(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS qa_project_sequences (
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    prefix VARCHAR(20) NOT NULL,
    last_number INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, prefix)
);

-- ============== ÍNDICES ==============

CREATE INDEX IF NOT EXISTS idx_tc_suite_id       ON qa_test_cases (suite_id);
CREATE INDEX IF NOT EXISTS idx_tc_us_id          ON qa_test_cases (us_id);
CREATE INDEX IF NOT EXISTS idx_tc_scenario_id    ON qa_test_cases (scenario_id);
CREATE INDEX IF NOT EXISTS idx_exec_tc_id        ON qa_executions (tc_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_exec_run_id       ON qa_executions (run_id);
CREATE INDEX IF NOT EXISTS idx_exec_run_status   ON qa_executions (run_id, status);
CREATE INDEX IF NOT EXISTS idx_defects_exec_id   ON qa_defects (execution_id);
CREATE INDEX IF NOT EXISTS idx_defects_jira_key  ON qa_defects (jira_key) WHERE jira_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suites_uc_id      ON qa_test_suites (use_case_id);
CREATE INDEX IF NOT EXISTS idx_suites_active_run ON qa_test_suites (active_run_id) WHERE active_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uc_project_id     ON qa_use_cases (project_id);
CREATE INDEX IF NOT EXISTS idx_us_uc_id          ON qa_user_stories (use_case_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_us_id       ON qa_scenarios (us_id);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_us_id ON qa_inconsistencias (us_id);
CREATE INDEX IF NOT EXISTS idx_perms_user_id     ON qa_user_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_proj_users_uid    ON qa_project_users (user_id);
CREATE INDEX IF NOT EXISTS idx_proj_users_pid    ON qa_project_users (project_id);
CREATE INDEX IF NOT EXISTS idx_runs_suite_id     ON qa_test_runs (suite_id);
CREATE INDEX IF NOT EXISTS idx_runs_status       ON qa_test_runs (id, status);
CREATE INDEX IF NOT EXISTS idx_tc_prec_tc_id     ON qa_tc_preconditions (tc_id);
CREATE INDEX IF NOT EXISTS idx_tc_prec_prc_id    ON qa_tc_preconditions (prc_id);
