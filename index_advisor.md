# Index Advisor — QA Control Tool (PostgreSQL/Supabase)

> Generado por análisis estático de `server.js`. Prioridad: CRÍTICA → ALTA → MEDIA.

---

## 🔴 CRÍTICO — Foreign Keys sin índice (Sequential Scans garantizados)

### 1. `qa_test_cases` — columnas de FK y filtrado frecuente

```sql
-- Usada en: WHERE suite_id = ANY(?), WHERE suite_id = ?, UPDATE SET title WHERE scenario_id = ?
CREATE INDEX IF NOT EXISTS idx_tc_suite_id       ON qa_test_cases (suite_id);

-- Usada en: SELECT ... WHERE us_id = us.id (subquery en user-stories), INSERT us_id
CREATE INDEX IF NOT EXISTS idx_tc_us_id          ON qa_test_cases (us_id);

-- Usada en: UPDATE qa_test_cases SET title WHERE scenario_id = ?
CREATE INDEX IF NOT EXISTS idx_tc_scenario_id    ON qa_test_cases (scenario_id);
```

### 2. `qa_executions` — tabla de mayor volumen, accedida en cada render de suite

```sql
-- DISTINCT ON (tc_id) ORDER BY tc_id, id DESC  ← crítico
CREATE INDEX IF NOT EXISTS idx_exec_tc_id        ON qa_executions (tc_id, id DESC);

-- WHERE run_id = ANY(?), WHERE run_id = ?
CREATE INDEX IF NOT EXISTS idx_exec_run_id       ON qa_executions (run_id);

-- WHERE run_id = ? AND status IN (...)  ← en finish-execution y history
CREATE INDEX IF NOT EXISTS idx_exec_run_status   ON qa_executions (run_id, status);
```

### 3. `qa_defects` — JOINs en tracking, bugs por run, creación de ticket Jira

```sql
-- WHERE execution_id = ANY(?)
CREATE INDEX IF NOT EXISTS idx_defects_exec_id   ON qa_defects (execution_id);

-- WHERE jira_key IS NOT NULL  ← filtro frecuente en /api/jira/.../tracking
CREATE INDEX IF NOT EXISTS idx_defects_jira_key  ON qa_defects (jira_key)
    WHERE jira_key IS NOT NULL;
```

### 4. `qa_test_suites` — JOIN central en casi todas las rutas

```sql
-- WHERE use_case_id = ?
CREATE INDEX IF NOT EXISTS idx_suites_uc_id      ON qa_test_suites (use_case_id);

-- WHERE active_run_id IS NOT NULL  ← Partial index para suites activas
CREATE INDEX IF NOT EXISTS idx_suites_active_run ON qa_test_suites (active_run_id)
    WHERE active_run_id IS NOT NULL;
```

### 5. `qa_use_cases` — filtrado por proyecto en cada carga

```sql
-- WHERE project_id = ?  ← GET /api/use-cases, múltiples JOINs
CREATE INDEX IF NOT EXISTS idx_uc_project_id     ON qa_use_cases (project_id);
```

---

## 🟠 ALTA — Tablas de relación y permisos

### 6. `qa_user_stories` — subqueries correlacionadas y filtros

```sql
-- WHERE use_case_id = ?
CREATE INDEX IF NOT EXISTS idx_us_uc_id          ON qa_user_stories (use_case_id);

-- WHERE us_id = us.id (subquery en qa_scenarios / qa_inconsistencias)
-- (us.id ya es PK, no requiere índice adicional)
```

### 7. `qa_scenarios` y `qa_inconsistencias`

```sql
-- WHERE us_id = ?  ← json_agg subquery en GET /api/user-stories
CREATE INDEX IF NOT EXISTS idx_scenarios_us_id       ON qa_scenarios (us_id);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_us_id ON qa_inconsistencias (us_id);
```

### 8. `qa_user_permissions` — consultada en CADA REQUEST autenticado vía `checkPermission`

```sql
-- WHERE user_id = ?  ← MÁXIMA frecuencia de acceso
CREATE INDEX IF NOT EXISTS idx_perms_user_id     ON qa_user_permissions (user_id);
```

### 9. `qa_project_users` — filtrado por usuario para proyectos asignados

```sql
-- WHERE user_id = ?
CREATE INDEX IF NOT EXISTS idx_proj_users_uid    ON qa_project_users (user_id);

-- WHERE project_id = ?
CREATE INDEX IF NOT EXISTS idx_proj_users_pid    ON qa_project_users (project_id);
```

### 10. `qa_test_runs` — historial y ciclos activos

```sql
-- WHERE suite_id = ?  y  JOIN ON suite_id
CREATE INDEX IF NOT EXISTS idx_runs_suite_id     ON qa_test_runs (suite_id);

-- WHERE id = ? AND status = 'RUNNING' / 'PAUSED'
CREATE INDEX IF NOT EXISTS idx_runs_status       ON qa_test_runs (id, status);
```

### 11. `qa_jira_configs` — consultada en CADA endpoint de Jira

```sql
-- WHERE project_id = ?  ← unique pero sin índice explícito declarado en migración
CREATE UNIQUE INDEX IF NOT EXISTS idx_jira_cfg_pid ON qa_jira_configs (project_id);
```

---

## 🟡 MEDIA — Tablas de soporte

### 12. `qa_project_sequences` — `generateKey()` se llama en cada creación de CU/HU/TS/TC

```sql
-- WHERE project_id = ? AND prefix = ?  (ya tiene UNIQUE CONFLICT, verificar si tiene índice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_seqs_pid_prefix ON qa_project_sequences (project_id, prefix);
```

### 13. `qa_tc_preconditions` — JOIN en GET /api/preconditions

```sql
CREATE INDEX IF NOT EXISTS idx_tc_prec_tc_id  ON qa_tc_preconditions (tc_id);
CREATE INDEX IF NOT EXISTS idx_tc_prec_prc_id ON qa_tc_preconditions (prc_id);
```

### 14. `qa_users` — login y JOINs de equipo

```sql
-- WHERE email = ?  ← login  (unique, pero confirmar índice existe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON qa_users (email);
```

---

## 📋 Script de Aplicación (ejecutar en Supabase SQL Editor)

```sql
-- ================================================================
-- INDEX ADVISOR — QA Control Tool
-- Aplicar en Supabase → SQL Editor
-- ================================================================

-- qa_test_cases
CREATE INDEX IF NOT EXISTS idx_tc_suite_id       ON qa_test_cases (suite_id);
CREATE INDEX IF NOT EXISTS idx_tc_us_id          ON qa_test_cases (us_id);
CREATE INDEX IF NOT EXISTS idx_tc_scenario_id    ON qa_test_cases (scenario_id);

-- qa_executions
CREATE INDEX IF NOT EXISTS idx_exec_tc_id        ON qa_executions (tc_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_exec_run_id       ON qa_executions (run_id);
CREATE INDEX IF NOT EXISTS idx_exec_run_status   ON qa_executions (run_id, status);

-- qa_defects
CREATE INDEX IF NOT EXISTS idx_defects_exec_id   ON qa_defects (execution_id);
CREATE INDEX IF NOT EXISTS idx_defects_jira_key  ON qa_defects (jira_key) WHERE jira_key IS NOT NULL;

-- qa_test_suites
CREATE INDEX IF NOT EXISTS idx_suites_uc_id      ON qa_test_suites (use_case_id);
CREATE INDEX IF NOT EXISTS idx_suites_active_run ON qa_test_suites (active_run_id) WHERE active_run_id IS NOT NULL;

-- qa_use_cases
CREATE INDEX IF NOT EXISTS idx_uc_project_id     ON qa_use_cases (project_id);

-- qa_user_stories
CREATE INDEX IF NOT EXISTS idx_us_uc_id          ON qa_user_stories (use_case_id);

-- qa_scenarios / qa_inconsistencias
CREATE INDEX IF NOT EXISTS idx_scenarios_us_id       ON qa_scenarios (us_id);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_us_id ON qa_inconsistencias (us_id);

-- qa_user_permissions
CREATE INDEX IF NOT EXISTS idx_perms_user_id     ON qa_user_permissions (user_id);

-- qa_project_users
CREATE INDEX IF NOT EXISTS idx_proj_users_uid    ON qa_project_users (user_id);
CREATE INDEX IF NOT EXISTS idx_proj_users_pid    ON qa_project_users (project_id);

-- qa_test_runs
CREATE INDEX IF NOT EXISTS idx_runs_suite_id     ON qa_test_runs (suite_id);
CREATE INDEX IF NOT EXISTS idx_runs_status       ON qa_test_runs (id, status);

-- qa_jira_configs
CREATE UNIQUE INDEX IF NOT EXISTS idx_jira_cfg_pid   ON qa_jira_configs (project_id);

-- qa_project_sequences
CREATE UNIQUE INDEX IF NOT EXISTS idx_seqs_pid_prefix ON qa_project_sequences (project_id, prefix);

-- qa_tc_preconditions
CREATE INDEX IF NOT EXISTS idx_tc_prec_tc_id  ON qa_tc_preconditions (tc_id);
CREATE INDEX IF NOT EXISTS idx_tc_prec_prc_id ON qa_tc_preconditions (prc_id);

-- qa_users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON qa_users (email);
```

---

## ✅ Query para verificar índices existentes (post-aplicación)

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'qa_%'
ORDER BY tablename, indexname;
```

---

## 📌 Notas

- **`idx_exec_tc_id (tc_id, id DESC)`**: Índice compuesto optimizado para el patrón `DISTINCT ON (tc_id) ORDER BY tc_id, id DESC` del endpoint `/api/test-suites` (el más pesado del sistema).
- **`idx_defects_jira_key` (partial)**: Solo indexa filas con Jira key asignado, reduciendo tamaño del índice 5-20x.
- **`idx_suites_active_run` (partial)**: Solo suites con ciclo activo, crítico para el filtro `WHERE active_run_id IS NOT NULL`.
- **`idx_perms_user_id`**: `checkPermission()` se invoca en múltiples rutas por request → máximo impacto.
- Todos usan `IF NOT EXISTS` → seguros para ejecutar en producción sin rollback.
