# Project Constitution: Manual QA Tool

This constitution defines the non-negotiable principles that govern every modification, improvement, and new feature in this project. It is enforced by spec-kit during plan/task analysis and is the authoritative source for any AI coding agent (mimocode compose, Claude Code, Codex, Copilot, Cursor).

**Enforcement level:** STRICT. Principles here are not guidance — they are gates. Any plan or task that violates a principle is rejected by `/speckit.analyze` and must be revised before implementation begins.

**Scope:** Full project — architecture, data model, code standards, UI, performance, testing, and process.

---

## [C1] Project Identity

A QA management web application for manual and visual testing workflows. Users manage test cases, execute them, capture side-by-side evidence, and generate reports. Built on Node.js/Express + vanilla JS SPA + PostgreSQL (Supabase) + Apple HIG design.

- **Language:** UI labels and user-facing messages are **Spanish** (neutral, no regional slang). Code identifiers, comments (when strictly needed), commit messages: **English**.
- **Stack:** Node.js + Express backend, vanilla JS frontend (no React/Vue), PostgreSQL via Supabase raw SQL RPC, JIRA Cloud integration.
- **Audience:** QA teams that need structured test case management with JIRA traceability.

Any modification that breaks the Spanish-first UI invariant, introduces a heavyweight frontend framework, or replaces the Supabase RPC layer requires a constitutional amendment.

---

## [C2] Code Quality — SQL Safety

**Principle:** All parameterized queries MUST use `?` placeholders, never PostgreSQL-native `$1`/`$2`.

- The `query()` function in `db.js` uses `buildSql()` which replaces `?` with escaped literals via `escapeLiteral()`.
- Placeholders: `WHERE id = ?` (correct) vs `WHERE id = $1` (rejected).
- Arrays: `WHERE x = ANY(?)` (correct) vs `WHERE x = ANY($1)` (rejected).
- Multi-statement queries are rejected — `db.js` does not support them. One statement per `query()` call.
- For bytea/file data: encode as base64 string, decode on retrieval. The RPC returns hex; convert explicitly.

**Verification:** Grep for `\$[0-9]` in any new SQL string before merge. If matched → reject.

---

## [C3] Code Quality — XSS / Frontend Security

**Principle:** Every dynamic value inserted into `innerHTML` or as an HTML attribute value MUST be wrapped in `UI.escapeHTML()`.

- Helper: `UI.escapeHTML(value)` from `public/js/utils/ui-utils.js`.
- Pattern: `container.innerHTML = \`<div>${UI.escapeHTML(userTitle)}</div>\`;`
- Never use `document.write`, `eval`, or `Function()` constructors with user-derived strings.
- `<select>.value` returns string — see [C6] for the integer coercion requirement.

**Verification:** Grep for `innerHTML` assignments; every interpolation `${...}` outside of static markup must be escaped. CI lint will flag raw interpolation.

---

## [C4] Code Quality — CSS Standards

**Principle:** All visual styling lives in `public/css/main.css` (or design-system token files). Inline `style=` attributes are forbidden except for dynamic `display: none` toggles managed by JS.

- **Safari/iOS compatibility:** Every `user-select: none;` MUST be prefixed with `-webkit-user-select: none;`.
- **Accessible form elements:** Every `<select>`, `<input>`, `<textarea>` MUST have an accessible name via `<label for=...>`, `aria-label`, or `title`.
- **Source-order cascade:** When two rules have equal specificity, the later-declared rule wins. In `main.css`, `.btn-text` (line ~2632) regularly beats earlier colored variants. New color rules go to the END of the file OR use `!important`.
- **Compact variants of `.bug-input`:** The base rule sets `min-height: 80px`. Compact variants MUST also set `min-height: 0` (or `!important`) to override.
- **Apple design tokens** (preferred for new components): see [C9].

**Verification:** Reject any PR with inline `style=` outside of JS-managed visibility toggles. Reject any new color rule that does not account for the source-order cascade.

---

## [C5] Architecture — Module Isolation

**Principle:** Each cross-cutting capability lives in its own module. `server.js` is a routing shell; business logic belongs elsewhere.

- **Newman/Postman runner:** All logic in `/modules/qa-runner/`. Only 1-2 lines may be added to `server.js` for route mounting.
- **JIRA service:** Lives in `jira-service.js` at the project root (or in a `modules/qa-jira/` if extracted). The pattern: `jira-service.js` is the only file that talks to the JIRA Cloud API.
- **Report generation:** Logic in `report-generator.js` (HTML) and `qa_report_builder.py` (PDF/visual). `server.js` only exposes the route.
- **Realtime:** `realtime.js` owns the Supabase channel subscription and event dispatch.

**Verification:** Any change that adds > 5 lines of business logic to `server.js` is rejected. Use a module.

---

## [C6] Architecture — Data Layer (Supabase + Raw SQL)

**Principle:** All database access goes through `db.js`. The data layer uses Supabase raw SQL via the `exec_query` RPC, not the Supabase client SDK.

- **Query function:** `await db.query(sql, params)` where `params` is an array. The `buildSql()` helper handles `?` → escaped literal substitution.
- **No multi-statement:** One statement per call. Use transactions via `db.transaction()` if needed.
- **Two-tier JIRA config:** `qa_jira_configs` (project-level: domain + project_key, admin-only) and `qa_jira_user_configs` (per-user: email + encrypted token). Do not collapse them.
- **`<select>.value` string coercion:** When a form sends a numeric ID from a `<select>`, the JS receives a string (e.g., `"5"`). If the DB column is INTEGER, parse with `parseInt(value, 10)` in frontend OR defensively in backend. Raw strings cause PostgreSQL `invalid input syntax for type integer: "5"` errors.
- **Attachments:** Stored as BLOB in `qa_attachments` with base64 hex encoding. `evidence_category` distinguishes 'FIGMA' / 'DEV' / 'BUG'.
- **Soft-void pattern (DISMISSED):** `qa_defects.status = 'DISMISSED'` is a soft void — hidden from stats, visible in lists. The dedicated endpoint is `POST /api/defects/:id/dismiss`. Every stat aggregation MUST filter `AND status != 'DISMISSED'`. The visual is `opacity: 0.5` + "Descartado" pill.

**Verification:** Reject any code path that imports `@supabase/supabase-js` client directly outside `db.js`. Reject raw string interpolation in SQL.

---

## [C7] Architecture — Dual-FK Pattern (project-scoped resources)

**Principle:** Resources that need project-level visibility (sidebar, dashboard, cross-UC filters) use a dual-FK: mandatory `project_id` + optional `use_case_id`.

- **Pattern:** `project_id INTEGER NOT NULL REFERENCES qa_projects(id) ON DELETE CASCADE` + `use_case_id INTEGER REFERENCES qa_use_cases(id) ON DELETE SET NULL`.
- **List endpoint contract:** The mandatory FK is a required query param; the optional FK is a filter. Example: `GET /api/test-suites?project_id=N&use_case_id=M` — `project_id` required, `use_case_id` optional filter.
- **Inverse pattern (UC-only scoped):** `qa_test_suites` is scoped only to a use case (project is two-hop via `use_case_id → qa_use_cases.project_id`). Use this when the resource is invisible at the project sidebar level.
- **Decision rule:** If the resource must appear in the project sidebar or project-wide dashboards → dual-FK. If it lives strictly under a single UC → UC-only.

**Verification:** Reject any new resource table that lacks both FKs when project-level visibility is required. Reject endpoints that make the mandatory FK optional.

---

## [C8] Architecture — Realtime Bus

**Principle:** The realtime layer is a "do everything, narrow the list" bus with silent default invalidation.

- **Two-tier invalidation:**
  - `invalidateForTable(tabKey)` — LOUD. Invalidates cache AND dispatches `realtime-refresh` for the active tab. Use for STRUCTURAL changes (new TC created, suite `active_run_id` flipped, new row appended to a list).
  - `invalidateForTableSilent(tabKey)` — QUIET. Invalidates cache only. Use for everything else. The next natural re-render (tab switch, click, user-initiated fetch) picks up fresh data without disrupting mid-edit users.
- **Default to silent.** Loud only for structural changes.
- **Per-tab listener:** Each tab listens on `window` for `realtime-refresh`, gates on `Store.state.activeTab === <self>`, then re-renders. Do not try to filter at the dispatch level.
- **Self-echo suppression:** When the server broadcasts via Supabase `postgres_changes`, the originating client also receives the event. Use `isSelfEvent(payload)` to compare row's actor columns against `Store.state.user`:
  - `qa_defects.created_by` → integer match
  - `qa_executions.tester` → string match
  - The helper handles both shapes. Add new actor columns when adding new endpoints that broadcast.
- **Hidden tabs:** Use loud invalidation. The active tab uses silent.

**Verification:** Reject any new endpoint that broadcasts but does not identify the actor column for self-echo suppression. Reject loud invalidation in the active execution tab.

---

## [C9] UI Standards — Apple HIG Design System

**Principle:** All UI components follow Apple macOS Human Interface Guidelines. The design system is the source of truth.

- **Token files:**
  - `apple-design-tokens.css` — dark + light mode tokens (SF Pro, Apple system colors, 6/10/12px border-radius, backdrop-filter vibrancy).
  - `macos-components.css` — advanced components.
  - `main.css` — main styles.
- **Font:** SF Pro (system font stack). No webfont imports.
- **Border-radius:** 6px (small), 10px (medium), 12px (large). Tokens: `--apple-radius-sm`, `--apple-radius-md`, `--apple-radius-lg`.
- **Modals:** Use `backdrop-filter` vibrancy. Dark/light mode via `data-theme` attribute on `<html>`, persisted in localStorage.
- **Skeleton loaders:** Use `UI.skeletonHTML(rows, cols)` with a sliding `linear-gradient(90deg, transparent, var(--apple-fill-tertiary), transparent)` animation. Apply BEFORE the first `await ApiService.*` call.
- **Run-control exception:** The Pausar/Reanudar/Finalizar/Retest buttons deliberately use hard-coded hex gradients (yellow/green/red/blue) instead of `--apple-*` tokens. These are state-changing actions that need to be visually loud. If dark-mode tuning is needed, introduce dedicated `--apple-action-yellow`/`--apple-action-red` tokens — do not revert to muted `--apple-yellow`.

**Verification:** Reject any new visual that imports a webfont, uses non-Apple colors outside the documented exceptions, or skips the skeleton placeholder on async loads.

---

## [C10] UI Standards — Buttons & Accessibility

**Principle:** High-traffic actions use text-only buttons with a representative color. Icon-only buttons are reserved for tooltips and low-traffic edges.

- **Text-only buttons for high-traffic actions:** Ver detalle, Descartar, Editar, Eliminar, Reabrir, Reactivar, Crear, Guardar.
- **Color mapping (use `--apple-*` tokens):**
  - Neutral/info → `--apple-blue` (Ver, Expandir, Editar)
  - Destructive → `--apple-red` (Descartar, Eliminar)
  - Positive/undo → `--apple-green` (Reabrir, Reactivar)
- **Icon-only pattern (🗑, ↩, 🔍, ✏️) is reserved for tooltips and low-traffic edges.**
- **Button anatomy:** `font-weight: 600` or higher, padding ≥ `5px 10px`, `border-radius: var(--apple-radius-sm)`.
- **Accessibility:** All buttons have an accessible name (text content, `aria-label`, or `title`).
- **Card grid pattern (for N×M permission data):** When a list has > 6 columns or many boolean cells, prefer `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` cards over a dense table.

**Verification:** Reject any new icon-only button for a high-traffic action. Reject any new color rule that does not follow the source-order cascade discipline (see [C4]).

---

## [C11] Performance — Algorithmic Discipline

**Principle:** Nested loops with linear search inside are O(N²). Pre-index into `Map<id, item>` before the inner loop.

- **Anti-pattern:** `outer.map(item => { inner.forEach(other => if (other.id === item.x) ...); })` — O(N²).
- **Pattern:** `const byX = new Map(inner.map(o => [o.x, o]));` then `byX.get(item.x)` inside the outer map → O(N).
- **Applies to:** Any endpoint, frontend renderer, or report generator that does nested iteration with `.find()` or `.filter()` inside a `.map()`.
- **Example reference:** The Fase 1.2 `getTestSuites` refactor indexed 8 arrays and turned a ~200ms endpoint into ~30ms.

**Verification:** Reject any new endpoint that does nested `.find()` / `.filter()` inside a `.map()`. The fix is a pre-pass `Map` index.

---

## [C12] Performance — Caching Strategy

**Principle:** Expensive endpoints use a per-tab TTL cache stored in a module-level `Map`, not in `Store.state`.

- **Cache location:** Module-level `Map` in `state.js` (or the relevant module). NOT a field on `Store.state` because `Store.state` is JSON-serialized to `localStorage` on every `save()`.
- **API:** `getCachedTab(tabKey, projectId)`, `setCachedTab(tabKey, projectId, data)`, `invalidateTabCache(tabKey, projectId)`.
- **TTL:** 30s default. The TTL is the safety net against missing a real-time update.
- **Key shape:** `${tabKey}::${projectId || ''}` for per-project, `${tabKey}::${subKey}::${projectId}` for sub-tabs.
- **Invalidation:** `invalidateTabCache(tabKey, projectId)` invalidates ALL sub-keys with that prefix via a `startsWith` scan.
- **Two storages for related data are intentional:**
  - `Store.state.testSuites` — LIVE mutation target for realtime patches.
  - Module-level `Map` in `state.js` — fetch memoization.
  - They are independent. Update both when a new field needs both memoization AND live patching. Do not try to unify them.

**Verification:** Reject any new expensive endpoint that re-queries on every tab switch. The cache is the fix.

---

## [C13] Performance — Rendering Strategy

**Principle:** Use chunked rendering for variable-height lists. Reserve `IntersectionObserver` virtualization for fixed-height uniform lists.

- **Chunked rendering pattern:**
  - Constants: `tcChunkSize: 50`, `renderedTcCount` instance field.
  - Reset signature: `_tcListSig = ${suite.id}::${tcs.length}::${filterId}::${filterStatus}` to detect when the chunk should be discarded.
  - UI: "Cargar N más" button. Strict subset of full virtualization.
- **When to use `IntersectionObserver`:** Fixed-height rows, long-scroll uniform lists. Not for variable-height rows where per-row resize observation is expensive.
- **Realtime-driven re-render:** Use silent invalidation by default (see [C8]). The 30s TTL is the safety net.

**Verification:** Reject any new list view that renders all items at once when item count > 100. Use chunked.

---

## [C14] Testing Standards

**Principle:** Manual QA is the core domain. Automated tests supplement, not replace, the manual workflow.

- **Test data structure:** Test cases are stored in `qa_test_cases` with suite grouping (`qa_test_suites`), execution history (`qa_executions`), defects (`qa_defects`), and evidence (`qa_attachments`).
- **Execution statuses:** `OK`, `FAIL`, `WARNING`, `BLOCK`, `SKIP`. `BLOCK` and `SKIP` both require `observations` on save. Adding a new non-executable status (e.g., `DEFERRED`) follows the same pattern.
- **Defect lifecycle:** `OPEN` → `DISMISSED` (soft void) or fixed. The "Crear N tickets en Jira" flow calls `ApiService.createJiraBug(bug.id, ...)` once per bug in a JS `for` loop (sequential, not bulk).
- **JIRA ticket creation:** Title is built server-side in `jira-service.js:265` as `` `🐞 BUG-${bugData.id}: ${bugData.title}` ``. Body via `generateBugMarkdown`. Frontend does NOT pass the title.
- **Schema migration constraint:** SQLite does not support `IF NOT EXISTS` in `ALTER TABLE`. Handle via code or manual migration scripts.
- **No automated E2E in the main flow:** The app is a manual QA tool. Playwright/Chrome DevTools skills are for ad-hoc debugging and exploration, not for the production test pipeline.

**Verification:** Reject any change that introduces a test framework dependency in `package.json` without explicit constitutional amendment.

---

## [C15] Process — Change Management

**Principle:** All changes follow a spec-driven, verified loop. No "while I'm here" improvements, no over-engineering.

- **Scope discipline:** Match scope to the request. A bug fix is a bug fix. A feature is a feature. Do not refactor adjacent code unless explicitly required.
- **Composition over premature abstraction:** Three similar lines is better than a helper. Single-use code does not need a utility.
- **No defensive error handling for impossible scenarios:** Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- **No backwards-compatibility hacks:** If something is unused, delete it. Do not rename unused `_vars`, add `// removed` comments, or feature-flag dead code.
- **Memory hygiene:** Project rules (RULES.md) are consolidated here. `MEMORY.md` (mimocode) remains as private agent memory for subagent/checkpoint decay. PROJECT_INDEX.md and KNOWLEDGE.md remain as human-readable architecture docs. They are derivations, not sources.
- **Spec-kit workflow:** Modifications flow through `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`. `/speckit.analyze` cross-validates against this constitution before implementation.
- **Constitutional amendments:** Changing a principle here requires explicit user approval and an entry in the constitution's changelog. The amendment must be invoked by name: "Amend [C7] to allow..."

**Verification:** `/speckit.analyze` rejects any plan/task that:
- Touches more than 3 files for a single bug fix
- Introduces abstractions for single-use code
- Adds backwards-compatibility shims
- Skips the spec-driven flow

---

## Change Log

| Date | Amendment | Rationale |
|------|-----------|-----------|
| 2026-06-27 | Initial constitution | Consolidated from RULES.md, MEMORY.md, and durable knowledge. Establishes 15 strict principles covering code quality, architecture, UI, performance, testing, and process. |
