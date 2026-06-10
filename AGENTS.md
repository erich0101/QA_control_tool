# AGENTS.md

Quick-start for AI coding agents working in this repository. Keep it short. Update when state changes.

## Stack at a glance

- **Runtime:** Node.js 20 (Alpine), CommonJS (no ESM).
- **Framework:** Express 4, helmet, cors, compression, express-rate-limit, multer, sharp, jsonwebtoken, zod, pg, bcryptjs.
- **DB:** **Agnóstica**. Cualquier Postgres accesible vía `DATABASE_URL` (Neon, Supabase, RDS, local). La app usa driver `pg` (no levanta DB local en Docker). Schema source of truth: `schema.sql`. Migraciones en `migrations/*.sql` aplicadas **manualmente** con `psql`.
- **Arquitectura:** `controllers → repositories → db driver` con `services` opcional para lógica compleja. Drivers intercambiables (`pg`, `memory`) vía `DB_DRIVER`.
- **Logger:** Pino (structured JSON).
- **Deploy:** Docker Compose, single VM at `rafam_dev@20.55.241.247` via `deploy.sh` (rsync over SSH, no registry).
- **Public port:** `8088` → container `3001`.

## Repo layout (post-refactor)

```
server.js                    # 44-line bootstrap: seed admin + createApp() + graceful shutdown
schema.sql                   # PostgreSQL schema (single source of truth)
migrations/                  # Idempotent ALTER migrations; apply manually via psql
src/
  app.js                     # createApp(): middleware chain + routes
  config/
    env.js                   # fail-fast: JWT_SECRET, JIRA_ENCRYPTION_KEY, DB
    db.js                    # shim de retrocompatibilidad (re-exporta src/db)
  db/                        # Abstracción de driver (Strategy pattern)
    index.js                 # factory: elige driver según DB_DRIVER
    drivers/
      pg.js                  # implementación con pg.Pool (driver real)
      memory.js              # implementación in-memory (tests/dev sin DB)
  middleware/                # auth, errors, errorHandler, requestId, logRequest, rateLimit, upload, validate
  validators/<domain>.schema.js  # Zod schemas; one file per domain
  routes/                    # index.js mounts domain routers; paths RELATIVE inside each router
  controllers/<domain>.controller.js  # HTTP handlers; delega a repos
  repositories/<domain>.repository.js  # Data access. Único punto que toca db
  services/                  # auth.service, testSuites.service, crypto.service, key.service
  utils/                     # logger, responses, keyGenerator, gracefulShutdown
db.js, crypto-utils.js, jira-service.js, report-generator.js   # LEGACY at root; do not add new imports
archive/                     # server.monolith.bak.js and other retired files
public/                      # Static frontend (ui.html, css, js) — do not put backend logic here
deploy.sh                    # rsync + build + up to remote VM
Dockerfile, docker-compose.yml, docker-compose.override.yml
```

Legacy note: `archive/server.monolith.bak.js` is the 3387-line original. New code belongs in `src/`. `db.js` (raíz), `crypto-utils.js`, `jira-service.js`, `report-generator.js` at the root are still imported by some legacy code; do not move or rewrite them without a dedicated phase.

## Database — agnóstica por diseño

La app se conecta a **cualquier Postgres accesible vía URL**. Tres formas equivalentes:

| Origen | `DATABASE_URL` ejemplo |
|---|---|
| **Neon** | `postgresql://neondb_owner:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| **Supabase** (Session Pooler) | `postgresql://postgres.[ref]:pass@aws-0-region.pooler.supabase.com:5432/postgres` |
| **RDS / EC2 / any Postgres** | `postgresql://user:pass@host:5432/dbname` |
| **Local docker / dev** | `postgresql://qa_user:pass@localhost:5432/qa_control_tool` |

Si preferís las variables libpq (compat con `psql`), también funciona: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`.

**No hay DB en `docker-compose.yml`.** El compose solo levanta la app. La DB vive afuera (Neon/Supabase/RDS/local). Las migraciones se aplican **manualmente** con `psql` (o cualquier cliente) antes del primer arranque:

```bash
# Neon
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f migrations/001_*.sql
psql "$DATABASE_URL" -f migrations/002_*.sql

# O desde Node (sin psql instalado):
node -e "require('pg').Pool.from = null; const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{const fs=require('fs'); await p.query(fs.readFileSync('./schema.sql','utf8')); for(const m of ['migrations/001_qa_project_sequences_composite_pk.sql','migrations/002_qa_test_cases_priority_flags.sql']){await p.query(fs.readFileSync(m,'utf8'));} await p.end();})()"
```

## Setup & run

```bash
# Local dev (asumiendo Postgres local o remoto)
npm install
cp .env.example .env
# Editar .env: JWT_SECRET, JIRA_ENCRYPTION_KEY, DATABASE_URL
# Generar secrets:
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export JIRA_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose build app && docker compose up -d
```

**App listens on `http://localhost:8088`.** No hay DB local en el compose; la app se conecta a la URL del `.env`.

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

`src/repositories/<domain>.repository.js` es la **única capa** que toca `db`. Cada repo exporta métodos nombrados (no clases). Ejemplo:

```js
const usersRepo = require('../repositories/users.repository');
const user = await usersRepo.findByEmail('alice@example.com');
```

Cada método acepta opcionalmente un parámetro `exec` al final. Si se pasa, se ejecuta sobre esa conexión (útil para transacciones); si no, usa el adapter global.

```js
const db = require('../db');

await db.withTransaction(async (tx) => {
  await testSuitesRepo.create({ ... }, tx);
  await executionsRepo.create({ ... }, tx);
  // Cualquier error hace rollback automático.
});
```

Reglas:
- **Repos NO validan** (Zod ya validó en el middleware).
- **Repos NO tienen lógica de negocio** (ej. decidir permisos).
- **Repos centralizan whitelists** (ej. `ALLOWED_UPDATE_FIELDS` en `testCases.repository.js`).
- **Repos devuelven datos primitivos** (array, objeto, escalar), NO el wrapper `{rows, lastID}`.

## DB driver

`src/db/index.js` exporta la instancia del driver elegido:

```js
const db = require('../db');
await db.query('SELECT 1');                  // fuera de tx
await db.withTransaction(async (tx) => ...); // tx
await db.ping();                             // healthcheck
await db.end();                              // graceful shutdown
```

Drivers soportados (vía `DB_DRIVER`):
- `pg` (default) — usa `pg.Pool` con `DATABASE_URL` o libpq.
- `memory` — implementación in-memory para tests/dev sin DB. NO production-ready.

## SQL conventions

- `pg` driver nativo. Los repos usan `?`-style placeholders que el driver traduce a `$1, $2, ...` (ver `convertPlaceholders` en `src/db/drivers/pg.js`).
- Arrays en `ANY($N::int[])` funcionan nativo — pasá arrays JS como params.
- Booleans: pasá `true`/`false` JS directo. NO transformes a `1`/`0`; columnas como `qa_test_cases.is_smoke` son `BOOLEAN`.
- `Date` instances se auto-serializan a ISO strings (ver `normalizeParams` en pg driver).
- `INSERT` queries sin `RETURNING id` lo reciben auto (excepto para tablas link/sequence — ver `noIdTables` en pg driver).

## Services vs controllers

`src/services/` holds business logic. Current services:
- `key.service.js` — re-exports `utils/keyGenerator.js` (zero-coupling, do not move the source file yet).
- `auth.service.js` — `verifyCredentials`, `getUserPermissions`. Used by `auth.controller.js`.
- `testSuites.service.js` — `list(queryParams, logger)`. Used by `testSuites.controller.js`.
- `crypto.service.js` — AES-256-GCM. **Not yet used by `jira-service.js`** (which still uses `utils/crypto-utils.js` AES-CBC). Phase B1 will fix that.

When adding a service, the convention is: keep the controller thin (12-20 lines), delegate to the service, let the service throw `AppError` subclasses.

## Deploy to VM

```bash
./deploy.sh                  # incremental build with cache
REBUILD=1 ./deploy.sh        # force rebuild from scratch
```
`deploy.sh` rsyncs to `rafam_dev@20.55.241.247:/home/rafam_dev/qa_control_tool` (excludes `.env`, `node_modules`, `uploads`, `*.log`), then runs `sudo docker compose build` and `up -d`. If the remote `.env` is missing, it copies from `.env.example` and prints a warning — **edit the remote `.env` immediately** (the generated `JWT_SECRET`, `JIRA_ENCRYPTION_KEY`, and `DATABASE_URL` must be set).

El script valida que el `.env` remoto tenga `JWT_SECRET`, `JIRA_ENCRYPTION_KEY`, y `DATABASE_URL` con `postgresql://`. **No aplica migraciones** — eso se hace manualmente contra la URL.

SSH-in and tail logs:
```bash
ssh rafam_dev@20.55.241.247 'cd /home/rafam_dev/qa_control_tool && sudo docker compose logs -f app'
```

## Skills available

`.agents/skills/` has 7 skills (Node.js, accessibility, SEO, bash, frontend design, OpenCode customization). The Node.js skills (`nodejs-best-practices`, `nodejs-express-server`, `nodejs-backend-patterns`) are the most relevant — load them with the `skill` tool before backend work.

## Known pre-existing bugs (do NOT silently fix — open a phase)

- `jira-service.js` decrypts with legacy AES-CBC, but `jira.controller.js` encrypts with the new AES-256-GCM `crypto.service`. 100% of Jira requests fail in production until Phase B1.
- `testCases.controller.js` `create` does not persist `is_smoke`/`is_regression`/etc. on INSERT (only on UPDATE). Frontend should PUT after POST.
- `db.js` (raíz) and `utils/crypto-utils.js` cannot be moved to `archive/` yet because `jira-service.js` and `report-generator.js` import them.
- No automated tests, no global pagination, no idempotency keys, no CSP nonces — all deferred to Phase F.

## What's not here

- No lint, no typecheck, no test runner. Don't add them silently — that's Phase F.
- No CI. `deploy.sh` is the only deploy path.
- No monorepo, no `workspaces` in `package.json`. Single package.
- ESM is not configured. Stay on CommonJS (`require`/`module.exports`).
- No DB local en compose. Toda DB es remota, vía `DATABASE_URL`.
