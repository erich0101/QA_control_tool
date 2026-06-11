# AGENTS.md

Quick-start for AI coding agents working in this repository. Keep it short. Update when state changes.

## Stack at a glance

- **Runtime:** Node.js 20 (Alpine), CommonJS (no ESM).
- **Framework:** Express 4, helmet, cors, compression, express-rate-limit, multer, sharp, jsonwebtoken, zod, pg, bcryptjs, @supabase/supabase-js.
- **DB (producción):** **Supabase** (Postgres remoto). Conexión vía `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Las queries SQL se ejecutan a través de la función RPC `public.exec_query(query_text text)` que vive en Supabase.
- **DB (alternativa):** Cualquier Postgres accesible vía `DATABASE_URL` (Neon, RDS, local). La app usa driver `pg` con `pg.Pool`.
- **Arquitectura:** Repository Pattern formal. `controllers → repositories → driver`. Drivers intercambiables (`postgres`, `supabase`) vía `DB_IMPL` env.
- **Logger:** Pino (structured JSON).
- **Deploy:** Docker Compose, single VM at `rafam_dev@20.55.241.247` via `deploy.sh` (rsync over SSH, no registry).
- **Public port:** `8088` → container `3001`.

## Repo layout (post-refactor)

```
server.js                    # 44-line bootstrap: seed admin + createApp() + graceful shutdown
schema.sql                   # PostgreSQL schema (single source of truth) — referencia
migrations/                  # Idempotent ALTER migrations; apply manually via psql
src/
  app.js                     # createApp(): middleware chain + routes
  config/
    env.js                   # fail-fast: JWT_SECRET, JIRA_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
    supabase.js              # Singleton: getSupabaseClient() — crea el cliente @supabase/supabase-js (lazy, idempotente)
  db/                        # Driver adapter para Postgres "directo" (no Supabase)
    index.js                 # Factory: solo 'pg' (legacy compatible)
    drivers/pg.js            # Implementación con pg.Pool
  middleware/                # auth, errors, errorHandler, requestId, logRequest, rateLimit, upload, validate
  validators/<domain>.schema.js  # Zod schemas; one file per domain
  routes/                    # index.js mounts domain routers; paths RELATIVE inside each router
  controllers/<domain>.controller.js  # HTTP handlers; delega a repos
  repositories/              # Repository Pattern
    contracts/               # Clases abstractas puras (solo definición, throw "not implemented")
      ProjectRepository.js
      UseCaseRepository.js
      UserRepository.js      # (también UserPermissionsRepository, ProjectUsersRepository)
      UserStoryRepository.js # (también ScenarioRepository, InconsistenciaRepository)
      TestSuiteRepository.js # (también TestCaseRepository, TestRunRepository, ExecutionRepository)
      AttachmentRepository.js # (también DefectRepository, PreconditionRepository, TcPreconditionsRepository, ProjectSequenceRepository, JiraConfigsRepository, JiraUserConfigsRepository)
    implementations/
      postgres/              # pg.Pool directo
        PostgresXRepository.js
      supabase/              # vía @supabase/supabase-js + RPC exec_query
        SupabaseBaseRepository.js  # compartido (escapeLiteral, buildSql, _query, _getClient, _withTransaction, ping, end)
        SupabaseXRepository.js
    index.js                 # Factory: según DB_IMPL elige postgres o supabase
  services/                  # auth.service, testSuites.service, crypto.service, key.service
  utils/                     # logger, responses, keyGenerator, gracefulShutdown
db.js, crypto-utils.js, jira-service.js, report-generator.js   # LEGACY at root; do not add new imports
archive/                     # server.monolith.bak.js and other retired files
public/                      # Static frontend (ui.html, css, js) — do not put backend logic here
deploy.sh                    # rsync + build + up to remote VM
Dockerfile, docker-compose.yml, docker-compose.override.yml
```

## Setup & run

```bash
npm install
cp .env.example .env
# Editar .env con los valores reales:
#   JWT_SECRET (>=32 chars)
#   JIRA_ENCRYPTION_KEY (64 hex chars = 32 bytes)
#   SUPABASE_URL (https://xxx.supabase.co)
#   SUPABASE_SERVICE_ROLE_KEY (eyJ...)
#   DATABASE_URL (postgresql://...) — usado por el driver 'pg' si DB_IMPL=postgres
# Generar secrets:
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export JIRA_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose build app && docker compose up -d
```

**App listens on `http://localhost:8088`.**

## DB_DRIVER — selección de backend

```bash
# Default: supabase
DB_IMPL=supabase  # usa SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + RPC exec_query

# Alternativa: postgres directo
DB_IMPL=postgres  # usa DATABASE_URL + pg.Pool
```

## Supabase: requisitos del lado del servidor

**Esta app usa Supabase con una función RPC custom que ejecuta SQL arbitrario.** Para que funcione, la DB remota debe tener creada la función `public.exec_query(query_text text)`. Si la DB es fresh, hay que correr esto en el SQL editor de Supabase (o con `psql`):

```sql
CREATE OR REPLACE FUNCTION public.exec_query(query_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    results jsonb;
    row_count int;
    clean_query text;
    upper_query text;
BEGIN
    clean_query := regexp_replace(query_text, '^\s+', '');
    clean_query := regexp_replace(clean_query, '\s+$', '');
    upper_query := upper(clean_query);

    IF upper_query IN ('BEGIN', 'COMMIT', 'ROLLBACK') THEN
        RETURN jsonb_build_object('rows', '[]'::jsonb, 'rowCount', 0);
    END IF;

    IF (upper_query LIKE 'INSERT%' OR upper_query LIKE 'UPDATE%' OR upper_query LIKE 'DELETE%')
       AND upper_query LIKE '%RETURNING%' THEN
        BEGIN
            EXECUTE format('WITH result AS (%s) SELECT jsonb_agg(row_to_json(result)) FROM result', clean_query) INTO results;
            results := COALESCE(results, '[]'::jsonb);
            RETURN jsonb_build_object('rows', results, 'rowCount', jsonb_array_length(results));
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE, 'rows', '[]'::jsonb, 'rowCount', 0);
        END;
    END IF;

    IF upper_query LIKE 'INSERT%' OR upper_query LIKE 'UPDATE%' OR upper_query LIKE 'DELETE%'
       OR upper_query LIKE 'CREATE%' OR upper_query LIKE 'ALTER%' OR upper_query LIKE 'DROP%' THEN
        BEGIN
            EXECUTE clean_query;
            GET DIAGNOSTICS row_count = ROW_COUNT;
            RETURN jsonb_build_object('rows', '[]'::jsonb, 'rowCount', row_count);
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE, 'rows', '[]'::jsonb, 'rowCount', 0);
        END;
    END IF;

    BEGIN
        EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', clean_query) INTO results;
        results := COALESCE(results, '[]'::jsonb);
        RETURN jsonb_build_object('rows', results, 'rowCount', jsonb_array_length(results));
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE, 'rows', '[]'::jsonb, 'rowCount', 0);
    END;
END;
$function$;
```

**Nota:** las transactions (`BEGIN`/`COMMIT`/`ROLLBACK`) son no-op en esta impl. `import.controller.js` y `issue.controller.js` usan `db.withTransaction()`, pero la función `exec_query` ignora esos comandos. Si una query a mitad falla, las anteriores quedan commiteadas. **Riesgo conocido, aceptable para esta app.**

## Admin user (auto-seeded)

On first boot, `server.js` creates `erich@qa.local` with a **random 32-char hex password** and logs it ONCE at WARN level. The legacy hard-coded `admin123` is gone. Read it from container logs:
```bash
docker compose logs app | grep "ADMIN CREADO"
```
Re-running on an existing DB does NOT rotate the password.

## API conventions (verified by smoke tests)

- All routes are prefixed `/api/*`. `requireAuth` is global; `/api/auth/*` is the only exception.
- `authLimiter` is applied to `POST /api/auth/login` only. `globalLimiter` covers everything else under `/api`.
- Routers mount under a prefix in `src/routes/index.js`; **path inside the router is RELATIVE** (e.g. `router.get('/:id', ...)` mounted at `/test-suites` → `/api/test-suites/:id`). Using the full path inside a router causes 404s — this is a recurring bug, double-check after editing any route file.
- Validation: every mutating route should have `validate(schema, 'body'|'query'|'params')` between `requireAuth` and `asyncHandler(ctrl.x)`. Validation errors return `400` with `code: VALIDATION_ERROR` and a `details: [{field, message}]` array. Schemas live in `src/validators/<domain>.schema.js`.
- Response shape: use `ok(res)`, `created(res, body)`, `noContent(res)` from `src/utils/responses.js`.
- Errors: throw `AppError` subclasses from `src/middleware/errors.js` (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`). The `errorHandler` formats the JSON and includes `requestId`. **Do not** call `res.status(500).json({ error: err.message })` directly — that leaks internals.

## Repositories (data access layer)

`src/repositories/contracts/<X>.js` define **clases abstractas puras** (solo declaraciones de método, `throw new Error("not implemented")`). Las implementaciones viven en `src/repositories/implementations/<impl>/<X>Repository.js` y extienden los contratos.

Cada método acepta opcionalmente un parámetro `exec` al final. Si se pasa, se ejecuta sobre esa conexión (útil para transactions); si no, usa el adapter global.

```js
const db = require('../db');

await db.withTransaction(async (tx) => {
  await testSuitesRepo.create({ ... }, tx);
  await executionsRepo.create({ ... }, tx);
});
```

Reglas:
- **Contratos NO validan** (Zod ya validó en el middleware).
- **Contratos NO tienen lógica de negocio** ni estado.
- **Repos centralizan whitelists** (ej. `ALLOWED_UPDATE_FIELDS` en `testCases.repository.js`).
- **Repos devuelven datos primitivos** (array, objeto, escalar), NO el wrapper `{rows, lastID}`.
- **Cada impl recibe el cliente/connection inyectado** vía constructor; NO los instancian ellas.

## DB driver

`src/db/index.js` (driver Postgres "directo") y `src/repositories/index.js` (factory de repos) son entry points separados.

Driver Postgres directo (vía `DATABASE_URL`):
```js
const db = require('../db');
await db.query('SELECT 1');
await db.withTransaction(async (tx) => ...);
await db.ping();
await db.end();
```

Cliente Supabase (singleton, lazy):
```js
const { getSupabaseClient } = require('../config/supabase');
const client = getSupabaseClient();
```

## SQL conventions

- Ambas impls (Postgres y Supabase) usan `?`-style placeholders.
- Postgres: el driver traduce a `$1, $2, ...`.
- Supabase: el `SupabaseBaseRepository.buildSql` reemplaza con `escapeLiteral` (concatenación con escape de comillas). **Menos seguro** que el driver nativo — depende de la RPC `exec_query` y de las validaciones del lado del servidor.
- Arrays en `ANY($N::int[])` funcionan nativo en Postgres. En Supabase se traducen a `ARRAY[?, ?, ?]`.
- Booleans: pasá `true`/`false` JS directo. NO transformes a `1`/`0`.
- `Date` instances se auto-serializan a ISO strings.
- `INSERT` queries sin `RETURNING id` lo reciben auto (excepto para tablas link/sequence — ver `noIdTables` en `SupabaseBaseRepository.js`).

## Services vs controllers

`src/services/` holds business logic. Current services:
- `key.service.js` — re-exports `utils/keyGenerator.js`.
- `auth.service.js` — `verifyCredentials`, `getUserPermissions`.
- `testSuites.service.js` — `list(queryParams, logger)`.
- `crypto.service.js` — AES-256-GCM.

## Deploy to VM

```bash
./deploy.sh                  # incremental build with cache
REBUILD=1 ./deploy.sh        # force rebuild from scratch
```

`deploy.sh` rsyncs to `rafam_dev@20.55.241.247:/home/rafam_dev/qa_control_tool` (excludes `.env`, `node_modules`, `uploads`, `*.log`), then runs `sudo docker compose build` and `up -d`. If the remote `.env` is missing, it copies from `.env.example` and prints a warning — **edit the remote `.env` immediately** with real `JWT_SECRET`, `JIRA_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

El script valida que el `.env` remoto tenga las variables requeridas. **No aplica migraciones ni crea la función RPC** — eso se hace manualmente contra la URL de Supabase.

## Skills available

`.agents/skills/` has 7 skills. The Node.js skills (`nodejs-best-practices`, `nodejs-express-server`, `nodejs-backend-patterns`) are the most relevant.

## Known pre-existing bugs / limitations

- **Transactions son no-op con Supabase** (la RPC `exec_query` ignora BEGIN/COMMIT/ROLLBACK). `import.controller.js` y `issue.controller.js` usan transactions que no funcionan en Supabase — riesgo aceptado.
- `testCases.controller.js` `create` no persiste `is_smoke`/`is_regression`/etc. en INSERT (solo UPDATE). Frontend should PUT after POST.
- `db.js` (raíz) y `utils/crypto-utils.js` no se pueden mover a `archive/` aún porque `jira-service.js` y `report-generator.js` los importan.
- `setupRealtimeChannel` (realtime notifications de main) NO está implementado en el refactor. Decidir si se necesita.

## What's not here

- No lint, no typecheck, no test runner. Don't add them silently — that's Phase F.
- No CI. `deploy.sh` is the only deploy path.
- No monorepo. Single package.
- ESM is not configured. Stay on CommonJS (`require`/`module.exports`).
- No DB local en compose. Toda DB es remota (Supabase o Postgres vía `DATABASE_URL`).
- No driver `memory` — se removió. La factory solo soporta `postgres` y `supabase`.
