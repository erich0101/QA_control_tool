-- SCHEMA PARA MANUAL QA TOOL (TMS) - SQLite con Estrategia BLOB

-- 0. Proyectos (Entidad Raíz)
CREATE TABLE IF NOT EXISTS qa_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 1. Casos de Uso (hijos de Proyecto)
CREATE TABLE IF NOT EXISTS qa_use_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES qa_projects(id) ON DELETE CASCADE,
    key_id VARCHAR(50) UNIQUE NOT NULL, -- ej: CU-001
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'Activo', -- Activo, Cerrado
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Historias de Usuario (hijas de Caso de Uso)
CREATE TABLE IF NOT EXISTS qa_user_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE CASCADE,
    key_id VARCHAR(50) UNIQUE NOT NULL, -- ej: US-101
    title VARCHAR(255) NOT NULL,
    epic VARCHAR(255),
    status VARCHAR(50) DEFAULT 'En Análisis', -- En Análisis, Finalizada, Deprecada, Rechazada
    priority VARCHAR(50) DEFAULT 'Media',      -- Alta, Media, Baja
    escenarios_prueba TEXT DEFAULT '',
    reglas_negocio TEXT DEFAULT '',
    scope_acordado TEXT DEFAULT '',
    fuera_scope TEXT DEFAULT '',
    precondiciones TEXT DEFAULT '',
    link_documentacion TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Test Suites (Agrupadores)
CREATE TABLE IF NOT EXISTS qa_test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Precondiciones
CREATE TABLE IF NOT EXISTS qa_preconditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    system_state TEXT
);

-- 4. Casos de Prueba (Diseño)
CREATE TABLE IF NOT EXISTS qa_test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER REFERENCES qa_test_suites(id) ON DELETE CASCADE,
    us_id INTEGER REFERENCES qa_user_stories(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES qa_users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    expected_result TEXT,
    version INTEGER DEFAULT 1, -- Histórico
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla intermedia para asociar Precondiciones a Casos
CREATE TABLE IF NOT EXISTS qa_tc_preconditions (
    tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
    prc_id INTEGER REFERENCES qa_preconditions(id) ON DELETE CASCADE,
    PRIMARY KEY (tc_id, prc_id)
);

-- 5. Ejecuciones (La validación real)
CREATE TABLE IF NOT EXISTS qa_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tc_id INTEGER REFERENCES qa_test_cases(id) ON DELETE CASCADE,
    tester VARCHAR(100),
    status VARCHAR(50) NOT NULL, -- OK, FAIL, WARNING
    environment VARCHAR(100),
    observations TEXT,
    obtained_result TEXT,
    metadata TEXT, -- JSON para log técnico (browser, resolución, tiempo)
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Defectos / Bugs
CREATE TABLE IF NOT EXISTS qa_defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50),
    root_cause VARCHAR(100),
    status VARCHAR(50) DEFAULT 'OPEN',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Adjuntos / Evidencias (En Base de Datos)
CREATE TABLE IF NOT EXISTS qa_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER REFERENCES qa_executions(id) ON DELETE CASCADE,
    defect_id INTEGER REFERENCES qa_defects(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL, 
    evidence_category VARCHAR(50), -- 'FIGMA', 'DEV', 'BUG'
    file_data BLOB NOT NULL,       -- El archivo binario (comprimido en WebP) vive aquí
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Autenticación y RBAC (NUEVO)
CREATE TABLE IF NOT EXISTS qa_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Tester', -- Admin, Tester, Analista QA, Project Manager, Lider Tecnico
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_user_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES qa_users(id) ON DELETE CASCADE,
    can_create_cu BOOLEAN DEFAULT 0,
    can_create_hu BOOLEAN DEFAULT 0,
    can_create_suite BOOLEAN DEFAULT 0,
    can_create_test BOOLEAN DEFAULT 0,
    can_assign_cu BOOLEAN DEFAULT 0,
    can_assign_hu BOOLEAN DEFAULT 0,
    can_assign_suite BOOLEAN DEFAULT 0
);

-- 9. Asignaciones N a M
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

-- 10. Ciclos de Ejecución (NUEVO)
CREATE TABLE IF NOT EXISTS qa_test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER REFERENCES qa_test_suites(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, FINISHED
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    created_by INTEGER REFERENCES qa_users(id),
    parent_run_id INTEGER REFERENCES qa_test_runs(id),
    run_type VARCHAR(20) DEFAULT 'FULL' -- FULL, RETEST
);

-- Agregar columna a qa_test_suites para trackear el run activo
-- Nota: SQLite no soporta IF NOT EXISTS en ALTER TABLE, se maneja por código o migración manual
-- ALTER TABLE qa_test_suites ADD COLUMN active_run_id INTEGER REFERENCES qa_test_runs(id);
