# AGENTS.md

Quick-start for AI coding agents working in this repository. Keep it short. Update when state changes.

## Stack at a glance

- **Runtime:** Node.js 20 (Alpine), CommonJS (no ESM).
- **Framework:** Express 4, helmet, cors, compression, express-rate-limit, multer, sharp, jsonwebtoken, zod, pg, bcryptjs.
- **DB:** PostgreSQL 18 (local docker container, NOT Supabase). Schema source of truth: `schema.sql`. Migrations in `migrations/*.sql`.
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
  config/                    # env.js (fail-fast), db.js (pg pool)
  middleware/                # auth, errors, errorHandler, requestId, logRequest, rateLimit, upload, validate
  validators/<domain>.schema.js  # Zod schemas; one file per domain
  routes/                    # index.js mounts domain routers; paths RELATIVE inside each router
  controllers/<domain>.controller.js  # HTTP handlers; SQL via ?-placeholders (db.js translates to $N)
  services/                  # key.service, auth.service, testSuites.service, crypto.service
  utils/                     # logger, responses, keyGenerator, gracefulShutdown
db.js, crypto-utils.js, jira-service.js, report-generator.js   # LEGACY at root; do not add new imports
archive/                     # server.monolith.bak.js and other retired files
public/                      # Static frontend (ui.html, css, js) — do not put backend logic here
deploy.sh                    # rsync + build + up to remote VM
Dockerfile, docker-compose.yml, docker-compose.override.yml
```

Legacy note: `archive/server.monolith.bak.js` is the 3387-line original. New code belongs in `src/`. `db.js`, `crypto-utils.js`, `jira-service.js`, `report-generator.js` at the root are still imported by some controllers; do not move or rewrite them without a dedicated phase.

## Setup & run

```bash
# Local dev
npm install
cp .env.example .env
# Required env vars (fail-fast in src/config/env.js):
#   JWT_SECRET (>=32 chars)
#   JIRA_ENCRYPTION_KEY (64 hex chars = 32 bytes)
#   PGUSER, PGPASSWORD, PGDATABASE
# Generate them:
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export JIRA_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose build app && docker compose up -d
```

**App listens on `http://localhost:8088`.**

DB container must be `Healthy` before app starts (`depends_on: service_healthy`). The first run creates the `pgdata` volume and runs `schema.sql` automatically. To wipe and re-init: `docker compose down && docker volume rm qa_control_tool_pgdata`.

## Admin user (auto-seeded)

On first boot, `server.js` creates `erich@qa.local` with a **random 32-char hex password** and logs it ONCE at WARN level. The legacy hard-coded `admin123` is gone. Read it from container logs:
```bash
docker compose logs app | grep "ADMIN CREADO"
```
Re-running on an existing DB does NOT rotate the password.

## Migrations

Apply manually after editing `schema.sql`:
```bash
docker cp migrations/00X_name.sql qa_control_tool-db-1:/tmp/m.sql
docker compose exec db psql -U "$PGUSER" -d "$PGDATABASE" -f /tmp/m.sql
```
Use `IF NOT EXISTS` / `DO $$ ... $$` blocks for idempotency. Always update `schema.sql` so fresh deploys include the change.

## API conventions (verified by smoke tests)

- All routes are prefixed `/api/*`. `requireAuth` is global; `/api/auth/*` is the only exception.
- `authLimiter` is applied to `POST /api/auth/login` only. `globalLimiter` covers everything else under `/api`.
- Routers mount under a prefix in `src/routes/index.js`; **path inside the router is RELATIVE** (e.g. `router.get('/:id', ...)` mounted at `/test-suites` → `/api/test-suites/:id`). Using the full path inside a router causes 404s — this is a recurring bug, double-check after editing any route file.
- Validation: every mutating route should have `validate(schema, 'body'|'query'|'params')` between `requireAuth` and `asyncHandler(ctrl.x)`. Validation errors return `400` with `code: VALIDATION_ERROR` and a `details: [{field, message}]` array. Schemas live in `src/validators/<domain>.schema.js`.
- Response shape: use `ok(res)`, `created(res, body)`, `noContent(res)` from `src/utils/responses.js`.
- Errors: throw `AppError` subclasses from `src/middleware/errors.js` (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`). The `errorHandler` formats the JSON and includes `requestId`. **Do not** call `res.status(500).json({ error: err.message })` directly — that leaks internals.

## SQL conventions

- `db.js` accepts `?`-style placeholders and translates to `$1, $2, ...` for `pg`. Controllers keep using `?`. **Never** use template literals to interpolate values.
- Arrays in `ANY($N::int[])` work natively — pass JS arrays as params.
- Booleans: pass `true`/`false` JS directly. Do NOT transform to `1`/`0`; columns like `qa_test_cases.is_smoke` are `BOOLEAN`, not `INTEGER`.
- `Date` instances are auto-serialized to ISO strings.
- `INSERT` queries that don't already include `RETURNING id` get it appended automatically (except for link/sequence tables — see `noIdTables` in `db.js`).

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
`deploy.sh` rsyncs to `rafam_dev@20.55.241.247:/home/rafam_dev/qa_control_tool` (excludes `.env`, `node_modules`, `uploads`, `*.log`), then runs `sudo docker compose build` and `up -d`. If the remote `.env` is missing, it copies from `.env.example` and prints a warning — **edit the remote `.env` immediately** (the generated `JWT_SECRET` and `JIRA_ENCRYPTION_KEY` must match what the local env exports).

SSH-in and tail logs:
```bash
ssh rafam_dev@20.55.241.247 'cd /home/rafam_dev/qa_control_tool && sudo docker compose logs -f app'
```

## Skills available

`.agents/skills/` has 7 skills (Node.js, accessibility, SEO, bash, frontend design, OpenCode customization). The Node.js skills (`nodejs-best-practices`, `nodejs-express-server`, `nodejs-backend-patterns`) are the most relevant — load them with the `skill` tool before backend work.

## Known pre-existing bugs (do NOT silently fix — open a phase)

- `jira-service.js` decrypts with legacy AES-CBC, but `jira.controller.js` encrypts with the new AES-256-GCM `crypto.service`. 100% of Jira requests fail in production until Phase B1.
- `testCases.controller.js` `create` does not persist `is_smoke`/`is_regression`/etc. on INSERT (only on UPDATE). Frontend should PUT after POST.
- `db.js` and `utils/crypto-utils.js` cannot be moved to `archive/` yet because `jira-service.js` and `report-generator.js` import them.
- No automated tests, no global pagination, no idempotency keys, no CSP nonces — all deferred to Phase F.

## What's not here

- No lint, no typecheck, no test runner. Don't add them silently — that's Phase F.
- No CI. `deploy.sh` is the only deploy path.
- No monorepo, no `workspaces` in `package.json`. Single package.
- ESM is not configured. Stay on CommonJS (`require`/`module.exports`).
