# CommandCenter: Enterprise Rebuild Blueprint

> Migration Blueprint · Pre-Implementation Deliverable
>
> A complete target-state design and milestone-by-milestone migration plan, built on the prior audit's findings. Nothing here has been implemented — this is the plan to approve before the first file changes.
>
> 🔒 **No code written. No files modified. Each milestone below is a separate approval gate.**

---

## Table of Contents

**Blueprint**
1. [Current architecture](#01-current-architecture)
2. [Target architecture](#02-target-architecture)
3. [Folder structure](#03-folder-structure)
4. [Backend module structure](#04-backend-module-structure)
5. [Database design](#05-database-design)
6. [Authentication flow](#06-authentication-flow)
7. [Authorization (RBAC)](#07-authorization-rbac)
8. [API design](#08-api-design)
9. [DTO structure](#09-dto-structure)
10. [Repository layer](#10-repository-layer)
11. [Service layer](#11-service-layer)
12. [Validation layer](#12-validation-layer)
13. [Error handling](#13-error-handling)
14. [Logging](#14-logging)
15. [Monitoring](#15-monitoring)
16. [Security architecture](#16-security-architecture)
17. [Testing strategy](#17-testing-strategy)
18. [Deployment architecture](#18-deployment-architecture)
19. [CI/CD](#19-cicd)
20. [Infrastructure](#20-infrastructure)

**Milestones**
- [Milestone overview](#milestone-overview)
- [M1 — Foundations & safety](#m1--foundations--safety)
- [M2 — Repo & tooling](#m2--repo--tooling)
- [M3 — Database redesign](#m3--database-redesign)
- [M4 — Core architecture](#m4--core-architecture)
- [M5 — Repository foundation](#m5--repository-foundation)
- [M6 — Authentication](#m6--authentication)
- [M7 — Authorization (RBAC)](#m7--authorization-rbac-1)
- [M8 — Teams module](#m8--teams-module)
- [M9 — Projects & Tasks module](#m9--projects--tasks-module)
- [M10 — Goals module](#m10--goals-module)
- [M11 — Pulse / Logs module](#m11--pulse--logs-module)
- [M12 — SOS Hub + real-time](#m12--sos-hub--real-time)
- [M13 — Leaderboard module](#m13--leaderboard-module)
- [M14 — Executive Brief + background jobs](#m14--executive-brief--background-jobs)
- [M15 — Frontend architecture refactor](#m15--frontend-architecture-refactor)
- [M16 — Frontend module migration](#m16--frontend-module-migration)
- [M17 — Observability & security hardening](#m17--observability--security-hardening)
- [M18 — Testing backfill](#m18--testing-backfill)
- [M19 — CI/CD & deployment cutover](#m19--cicd--deployment-cutover)

---

## 01. Current architecture

One Express process with three uncoordinated `pg.Pool()` instances, no repository or service boundary — controllers query the database directly. Redis, MongoDB, Bull, and Socket.io are installed but never called. Auth is a JWT bearer token stored in the frontend's `localStorage`, checked ad-hoc per handler rather than through middleware. No validation layer, no centralized error handling, no structured logging, no tests, no CI, and no version control initialized yet. Deployed (or intended for deployment) to Vercel serverless, a target incompatible with the persistent connections the stack otherwise implies.

This is the baseline every section below moves away from — see the prior audit report for the full finding-by-finding detail.

---

## 02. Target architecture

A modular monolith — not microservices. At this stage, microservices would add network calls, deployment surfaces, and operational cost without a scaling problem that justifies it; a well-layered monolith gets the maintainability benefits (module boundaries, testability, independent ownership) without that cost, and can be split later if a specific module truly outgrows the rest.

```
HTTP request
   │
   ▼
middleware chain — request-id → logging → rate-limit → auth → validation
   │
   ▼
route → controller  (parses request, calls one service method, shapes response)
                  │
                  ▼
              service       (business rules, orchestrates repositories, throws domain errors)
                  │
                  ▼
              repository    (typed queries only — no business logic)
                  │
                  ▼
              Postgres (Drizzle ORM)

Cross-cutting, not layered: common/errors, common/logger, config/env, jobs/queue, realtime/gateway
```

Each domain module (auth, teams, projects, tasks, goals, blockers, logs, leaderboard, analytics) owns its own controller/service/repository/DTO files and depends on other modules only through their service interfaces — never reaching into another module's repository directly. This is what makes a future extraction into a separate service possible without a rewrite, if it's ever actually needed.

---

## 03. Folder structure

```
backend/
├─ drizzle/                      # generated SQL migrations, version controlled
├─ src/
│  ├─ config/                    # env schema (zod), constants
│  ├─ common/
│  │  ├─ errors/                 # AppError + subclasses
│  │  ├─ middleware/             # auth, validate, rateLimit, requestId, errorHandler
│  │  ├─ logger/                 # pino instance + redaction rules
│  │  └─ utils/
│  ├─ db/
│  │  ├─ schema.ts                # Drizzle table definitions (source of truth)
│  │  └─ client.ts                # single pool, exported once
│  ├─ modules/
│  │  ├─ auth/         {controller, service, repository, dto, routes}.ts
│  │  ├─ users/         …
│  │  ├─ teams/         …
│  │  ├─ projects/      …
│  │  ├─ tasks/         …
│  │  ├─ goals/         …
│  │  ├─ blockers/      …
│  │  ├─ logs/          …          # "the Pulse"
│  │  ├─ leaderboard/   …
│  │  ├─ analytics/     …          # "Executive Brief"
│  │  ├─ ai/            {groqClient.ts, prompts.ts}
│  │  └─ notifications/ {emailService.ts, templates/}
│  ├─ jobs/                       # BullMQ queues + workers
│  ├─ realtime/                   # Socket.io gateway, room auth
│  ├─ app.ts                      # builds & exports the Express app (no listen())
│  └─ server.ts                   # entrypoint: imports app, calls listen()
├─ tests/
│  ├─ unit/            # mirrors src/modules/*
│  ├─ integration/     # Supertest against a real test DB
│  └─ e2e/             # Playwright, critical flows only
└─ package.json

frontend/
├─ src/
│  ├─ app/                        # router, providers, layout shell
│  ├─ components/ui/              # Button, Modal, Card, Input, Badge, Spinner…
│  ├─ features/
│  │  ├─ auth/          {api.ts, components/, types.ts}
│  │  ├─ pulse/         …
│  │  ├─ teams/         …
│  │  ├─ projects/      …
│  │  ├─ goals/         …
│  │  ├─ sos-hub/       …
│  │  ├─ leaderboard/  …
│  │  └─ analytics/     …
│  ├─ lib/                        # api client, query client, auth session
│  └─ styles/
└─ tests/
```

---

## 04. Backend module structure

Every module follows the same five-file shape, so any engineer can navigate an unfamiliar module by convention alone:

| File | Owns |
|---|---|
| `*.routes.ts` | URL → controller wiring, plus the validation/auth middleware for each route |
| `*.controller.ts` | Parse request → call one service method → shape the response envelope. No business logic, no direct DB access. |
| `*.service.ts` | Business rules, cross-repository orchestration, domain errors |
| `*.repository.ts` | Typed Drizzle queries only, behind an interface. No SQL string-building from request bodies (the change that closes the mass-assignment finding). |
| `*.dto.ts` | Zod request schemas + response-shaping types |

Eleven modules total: `auth`, `users`, `teams`, `projects`, `tasks`, `goals`, `blockers`, `logs`, `leaderboard`, `analytics`, plus two support modules (`ai`, `notifications`) that other modules call but that own no HTTP routes themselves.

---

## 05. Database design

Same core entities as today's schema, with the integrity gaps the audit found closed:

- **New table:** `audit_logs` (actor_id, action, resource_type, resource_id, diff, created_at) — referenced by privacy docs today but never actually created.
- **New junction tables:** `task_contributors`, `task_dependencies`, `blocker_affected_tasks` — replacing the JSONB-array pseudo-relations on `tasks` and `blockers` with real foreign keys.
- **New table:** `refresh_tokens` (user_id, token_hash, expires_at, revoked_at) — needed for the cookie-based auth flow in Section 6.
- **Drop:** `users.team_id` — a bare, FK-less column made redundant by the existing `team_members` join table, which already supports multi-team membership correctly.
- **Add:** `updated_at` on every table (currently only `created_at` exists anywhere), maintained by a Drizzle/Postgres trigger, not application code.
- **Add:** Postgres `ENUM` types for the ~9 currently-unconstrained "enum-like" `VARCHAR` columns (`role`, `status`, `priority`, `team_type`, `goal_type`, `blocker_type`, `urgency`, `impact`, `severity`) — invalid values become impossible to insert, not just unvalidated.
- **Fix:** `seed.sql`'s column names to match the real schema, and wrap it in an explicit transaction.
- **Migration tooling:** Drizzle Kit generates versioned, reviewable SQL migration files committed to `drizzle/` — replacing the current single hand-run `schema.sql` with no history.

---

## 06. Authentication flow

```
Register  → hash password (bcrypt, cost 12) → create user, is_verified=false
          → generate verification token → store its HASH + expiry in DB
          → email the raw token as a link (real send, via Notifications module)

Verify    → look up by TOKEN HASH (not by treating the token as an email)
          → mark is_verified=true, delete the token row

Login     → verify password → issue:
              • access token  (JWT, 15 min, httpOnly + SameSite=Strict cookie)
              • refresh token (opaque random string, 30 days, httpOnly cookie;
                                its HASH stored in refresh_tokens for revocation)

Refresh   → validate refresh token against its stored hash → rotate it
            (old one revoked, new one issued) → new access token issued

Logout    → revoke the refresh token row → clear both cookies
```

Moving the token out of `localStorage` and into an httpOnly cookie closes the XSS-exfiltration path the audit flagged, but introduces CSRF exposure that bearer-token auth didn't have — addressed in Section 16 with a double-submit CSRF token on state-changing requests.

---

## 07. Authorization (RBAC)

| Role | Scope | Can |
|---|---|---|
| **Owner** | Team | Everything, including deleting the team and transferring ownership |
| **Admin** | Team | Manage members, settings, integrations — not team deletion/ownership transfer |
| **Manager** | Team | Assign tasks, view team analytics, approve join requests |
| **Member** | Team | Contribute: create/edit own logs, tasks, blockers |
| **Viewer** | Team | Read-only |

Enforced by two composable middlewares applied at the route level, not re-implemented per handler: `requireRole(['admin','owner'])` for role checks, and `requireTeamMembership()` for resource-scoping (does this user belong to the team that owns this project/task/goal?). This replaces both the never-wired `authorize()` function and the ad-hoc per-handler checks the audit found — including the one with a code comment admitting a permission check was skipped.

---

## 08. API design

- **Versioned and resource-based:** `/api/v1/teams/:teamId/projects`, not the current flat, unversioned `/api/*`.
- **One response envelope, enforced by a shared helper** — not hand-rolled per controller:
  - `{ "data": …, "meta": { "page": 1, "limit": 20, "total": 143 } }` on success
  - `{ "error": { "code": "NOT_FOUND", "message": "…", "details": […] } }` on failure
- **Consistent status codes:** 404 for missing resources (today, several paths return 400 instead), 403 for authorization failures, 409 for conflicts — codified in the error-handling middleware in Section 13, not left to controller judgment.
- **RPC-flavored endpoints reclassified:** AI-triggering "reads" like `GET /logs/insights` become explicit `POST` actions, since they have side effects (an AI call, sometimes a write) and aren't idempotent.
- **Pagination** on every list endpoint (`?page&limit`) — currently absent everywhere, meaning list endpoints will not scale past a small dataset.

---

## 09. DTO structure

Every module defines three Zod schemas, each with a single job:

| DTO | Purpose |
|---|---|
| `Create{X}Dto` | Validates a POST body. Rejects unknown keys — this, plus the repository allowlisting in Section 10, is the second of two independent barriers against mass-assignment. |
| `Update{X}Dto` | Same, but every field optional (partial update) — still rejects unknown keys. |
| `{X}ResponseDto` | Maps a DB row to what the client actually receives — the place `password_hash`, internal flags, and other server-only fields get stripped before serialization, which nothing in the current codebase does explicitly. |

The Zod schema is also the single source of truth for the inferred TypeScript type — no hand-written interface can drift out of sync with the validator that enforces it.

---

## 10. Repository layer

One repository per aggregate, exposing intention-revealing methods (`findById`, `findByTeam`, `updateStatus`) instead of a generic `update(table, id, updates)` that accepts arbitrary keys — this is the structural fix for the mass-assignment finding, not a validation patch on top of the same design. Each repository is typed against the Drizzle schema, so a query referencing a column that doesn't exist fails at compile time, which is what would have caught the `seed.sql` column mismatch before it ever ran.

Repositories are the only files in the codebase allowed to import the Drizzle client directly. Services never see a SQL query or a raw `Pool` — this is what makes "one data-access layer, not five" durable rather than a one-time cleanup.

---

## 11. Service layer

Business rules live here and nowhere else: streak calculation, impact-score computation, blocker-escalation timing, goal-progress rollups. Services call one or more repositories, throw typed domain errors (Section 13) instead of returning `null`/`false` for failure, and are the layer unit tests target first — a service test needs no HTTP layer and no real database, only a mocked repository.

A service may call another module's service (e.g., the `logs` service calling the `leaderboard` service after a streak milestone) but never another module's repository directly — the boundary that keeps modules independently testable and, later, independently extractable.

---

## 12. Validation layer

A single `validate(schema)` middleware, applied per-route, parses `req.body`/`req.params`/`req.query` against the module's Zod DTO before the controller ever runs. A failed parse short-circuits straight to the error-handling middleware with a 400 and a field-level breakdown — replacing today's inconsistent, per-controller `if (!field)` checks, and the ad-hoc string checks that let arbitrary object shapes reach the database layer.

---

## 13. Error handling

```
AppError (base)                     → 500, generic "something went wrong"
 ├─ ValidationError                 → 400, field-level details
 ├─ UnauthenticatedError            → 401
 ├─ ForbiddenError                  → 403
 ├─ NotFoundError                   → 404
 └─ ConflictError                   → 409
```

Controllers and services throw these; they never construct an HTTP response directly. One centralized error-handling middleware (registered last in `app.ts`) catches everything, logs it with full context, and returns the versioned error envelope — masking internal driver/stack-trace detail from the client by construction, closing the "raw `error.message` leaked to the client" finding everywhere at once instead of patching each of the dozen call sites individually. Async route handlers are wrapped so a rejected promise reaches this middleware automatically, rather than crashing the process or hanging the request.

---

## 14. Logging

Structured JSON logging via **pino**, replacing the current emoji-decorated `console.log` calls. Every request gets a request-id (generated or propagated from an incoming header) attached to every log line it produces, so a single failing request's full trail can be pulled with one filter. A redaction list strips `password`, `token`, `authorization`, and similar keys from logged objects automatically — logging is a place secrets leak just as easily as source control.

---

## 15. Monitoring

- **Error tracking:** Sentry (free tier) — every error the handler in Section 13 catches also reports here, with stack trace and request context. Today, a production error is invisible until a user reports it.
- **Health checks:** `/health` (process is up) and `/ready` (DB connection is actually reachable) — the current health check claims a "MOCK mode" that no code path actually honors; the new one reflects real state.
- **Uptime:** a free external ping service (e.g. UptimeRobot) against `/health`, so an outage is caught by an alert, not a support message.

---

## 16. Security architecture

- **Secrets:** rotated Neon/Groq credentials, held only in the hosting platform's environment-variable UI (Render/Fly + Vercel), never in a committed file. `.env.example` stays as the documented template; real values never do.
- **Transport & headers:** `helmet` for security headers, a CORS allowlist read from environment config (no more open `cors()`).
- **Rate limiting:** `express-rate-limit` on all routes, a stricter bucket specifically on `/auth/login` and `/auth/register`.
- **CSRF:** a double-submit CSRF token on every state-changing request, required once auth moves to cookies (Section 6) — bearer-token auth didn't need this; cookie auth does.
- **Mass-assignment:** closed structurally by Sections 9 (DTOs reject unknown keys) and 10 (repositories expose named methods, not generic key-value updates) — two independent layers, not one.
- **Log integrity:** the current unkeyed SHA-256 "signature" replaced with HMAC-SHA256 using a server-held secret, so a signature can no longer be forged by anyone who's read the algorithm — *or*, per the Phase 2 market finding that no customer has asked for this, the feature is deprioritized rather than half-fixed. That call belongs to product direction, not engineering, and is flagged here rather than decided here.
- **Password policy:** bcrypt cost factor raised from 10 to 12; minimum length/complexity enforced at the DTO layer.

---

## 17. Testing strategy

| Layer | Tool | Targets first |
|---|---|---|
| Unit | Vitest | Services, with repositories mocked — streak logic, impact-score calculation, HMAC signing/verification |
| Integration | Vitest + Supertest | Full route → controller → service → repository chain against a real disposable test Postgres database |
| End-to-end | Playwright | Register → verify → login → create a Pulse log → see it on the leaderboard, as one continuous flow |

Coverage gate enforced in CI (Section 19): a pull request that drops service-layer coverage below an agreed threshold fails the build. The first three suites written should be exactly the three places this audit found real bugs by hand: auth/verification, the update-endpoint column handling, and log signing — proof the new layer actually catches what the old one didn't.

---

## 18. Deployment architecture

```
Vercel                 Render (or Fly.io) — one always-on service
┌───────────┐          ┌─────────────────────────────────────┐
│ React SPA │  API →   │  Express API  +  Socket.io gateway   │
│  (static) │ ───────▶ │  +  BullMQ worker (same repo,         │
└───────────┘          │      separate process/dyno)           │
                        └─────────────────────────────────────┘
                                │                    │
                                ▼                    ▼
                          Neon Postgres        Upstash Redis
                          (already in use)     (free tier, cache +
                                                 BullMQ + Socket.io
                                                 adapter)
```

The frontend stays on Vercel — a static build is exactly what it's good at. The API moves off Vercel because Socket.io connections, a BullMQ worker loop, and a warm connection pool all need a process that stays running between requests, which serverless functions structurally don't provide. Render and Fly.io both have free/hobby tiers sufficient for this stage.

---

## 19. CI/CD

GitHub Actions (free for this scale), two workflows:

- **On every pull request:** install → lint → typecheck → unit tests → integration tests (against a disposable Postgres service container) → build. Any failure blocks merge.
- **On merge to `main`:** run the same checks, then apply pending Drizzle migrations to the target database, then deploy — Render/Fly for the API, and Vercel's own git integration for the frontend (no custom step needed there).

A staging environment (separate Neon branch database, separate Render service) sits ahead of production, with production deploys gated by a manual approval step — appropriate once real users' data is involved, not needed today.

---

## 20. Infrastructure

- **Environment config:** a single Zod-validated env schema in `config/` — the app refuses to boot if a required variable is missing, instead of silently falling back to a hardcoded default (closing the `JWT_SECRET || 'secret'` pattern at its root).
- **Local development:** the existing `docker-compose.yml` stays for local Postgres/Redis, corrected so the app's `.env.example` and the compose file agree on credentials — today they don't, so local setup doesn't actually reach the database the running app uses.
- **Infrastructure as code:** not needed yet. Render/Fly/Vercel/Neon/Upstash are all configured through their own dashboards at this scale; introducing Terraform now would be complexity ahead of the need for it.
- **Setup scripts:** the current six overlapping, Windows-only, hardcoded-path `.bat`/`.ps1` scripts consolidate into one cross-platform script (or simply `npm run setup` calling a small Node script) that actually configures the database the app connects to.

---

## Milestone overview

Nineteen milestones, sequenced so nothing depends on a module that hasn't been rebuilt yet. Each gets its own approval before work starts.

| # | Milestone | Complexity | Est. time |
|---|---|---|---|
| M1 | Foundations & safety | Low | 1-2 days |
| M2 | Repo & tooling | Low | 2-3 days |
| M3 | Database redesign | Medium | 3-4 days |
| M4 | Core architecture (common/, app.ts) | Medium | 4-5 days |
| M5 | Repository foundation (Users reference module) | Medium | 3-4 days |
| M6 | Authentication rebuild | High | 1-1.5 weeks |
| M7 | Authorization / RBAC | Medium | 3-4 days |
| M8 | Teams module | Medium | 4-5 days |
| M9 | Projects & Tasks module | High | 1-1.5 weeks |
| M10 | Goals module | Low | 2-3 days |
| M11 | Pulse / Logs module | High | 1 week |
| M12 | SOS Hub + real-time | Very High | 1.5-2 weeks |
| M13 | Leaderboard module | Medium | 3-4 days |
| M14 | Executive Brief + background jobs | High | 1-1.5 weeks |
| M15 | Frontend architecture refactor | High | 1-1.5 weeks |
| M16 | Frontend module migration | Very High | 2-3 weeks |
| M17 | Observability & security hardening | Medium | 4-5 days |
| M18 | Testing backfill | High | 1.5-2 weeks |
| M19 | CI/CD & deployment cutover | Medium | 3-4 days |

Total: roughly **16-20 weeks** for one engineer working sequentially; module milestones (M8-M14) can parallelize across engineers once M1-M7 land, since each owns its own files.

---

## M1 — Foundations & safety

**Complexity: Low**

**Goal:** Stop the bleeding before anything else: rotate exposed credentials, remove real user data sitting in a dead file, and initialize version control properly so future milestones are reviewable and revertible.

**Files to create**
- `.git/` (git init)
- `backend/.env` (new rotated values)

**Files to modify**
- `backend/.gitignore` (add `.env`, `data/`, `dist/`, `node_modules/`)
- `frontend/.gitignore` (add `dist/`, `node_modules/`)

**Files to delete**
- `backend/data/database.json`
- `backend/utils/persistence.ts`
- `backend/utils/db.ts` (dead pool)
- `backend/check-users.js`, `insert-users.js`, `test-db.ts`

**Risks**
Rotating the Neon credential requires updating it wherever the old one is cached (local shells, any already-deployed Vercel env var) — a missed spot causes a brief outage, not data loss.

**Rollback plan**
Nothing here is destructive to running functionality; the old `.env` values simply stop working once rotated. Deleted files have no live import path (confirmed in the audit), so removing them cannot break a build.

---

## M2 — Repo & tooling

**Complexity: Low**

**Goal:** Put the guardrails in place before restructuring code inside them: consistent linting/formatting, a strict TypeScript config, and a CI skeleton that only lints for now — it grows teeth as later milestones add tests.

**Files to create**
- `.github/workflows/ci.yml`
- `.eslintrc.cjs`, `.prettierrc` (root)

**Files to modify**
- `backend/tsconfig.json` (`strict: true`, `noImplicitAny: true`)
- `frontend/tsconfig.json` (same)
- `backend/package.json`, `frontend/package.json` (lint/format scripts)

**Files to delete**
- `setup-databases.ps1` (duplicate of `.bat`)
- `start-no-db.bat` (duplicate of `start.bat`)

**Risks**
Flipping `strict: true` will surface a large number of pre-existing type errors across the untyped frontend immediately — this milestone only enables the flag; fixing the fallout belongs to M15/M16, not here.

**Rollback plan**
Revert the tsconfig flags to `false` if the resulting error volume needs to be deferred; every other change in this milestone is additive tooling with no runtime effect.

---

## M3 — Database redesign

**Complexity: Medium**

**Goal:** Move to Drizzle-managed, versioned migrations and close the schema gaps from the audit (missing audit_logs table, JSONB pseudo-relations, missing FK on users.team_id, unconstrained enum columns) before any module code is rebuilt on top of it.

**Files to create**
- `backend/src/db/schema.ts`
- `backend/src/db/client.ts`
- `backend/drizzle/0001_initial.sql` (generated)
- `backend/drizzle/0002_fix_relations.sql`

**Files to modify**
- `database/seed.sql` (fix column names, wrap in transaction)
- `docker-compose.yml` (align credentials with `.env.example`)

**Files to delete**
- `database/schema.sql` (superseded by `drizzle/schema.ts`, kept only as historical reference if desired)

**Risks**
Dropping `users.team_id` requires confirming no live code path reads it outside what the audit already found — a missed reference would fail at compile time under strict TS (a safety net, not a risk in itself). Migrating the real Neon data (not just the schema) needs a backup taken first.

**Rollback plan**
Take a Neon branch/snapshot before applying migrations; Drizzle migrations are reversible SQL files, and Neon's branching makes reverting to pre-migration state a database-level operation, not a code one.

---

## M4 — Core architecture

**Complexity: Medium**

**Goal:** Build the cross-cutting layers every module will depend on — error classes, the centralized error handler, the request/response envelope helper, pino logging, and the env-schema validator — plus split `server.ts` into an exported `app.ts` and a thin entrypoint. Nothing in this milestone is domain logic.

**Files to create**
- `backend/src/common/errors/*.ts`
- `backend/src/common/middleware/errorHandler.ts`
- `backend/src/common/middleware/validate.ts`
- `backend/src/common/middleware/requestId.ts`
- `backend/src/common/logger/index.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`

**Files to modify**
- `backend/src/server.ts` (reduced to app import + listen)
- `backend/vercel.json` (removed or repointed — see M19)

**Files to delete**
- `backend/utils/database.ts` (dead Redis/Mongo helpers)

**Risks**
This touches the app's entrypoint, so a mistake here affects every route at once rather than one module — worth the extra review pass this milestone gets before M5 builds on it.

**Rollback plan**
Keep the old `server.ts` in git history one commit back; reverting is a single-commit revert since no module code depends on the new layer yet.

---

## M5 — Repository foundation

**Complexity: Medium**

**Goal:** Prove the new pattern end-to-end on one small, low-risk module — Users — before rolling it out everywhere. This is the template every later module milestone copies.

**Files to create**
- `backend/src/modules/users/users.repository.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
- `backend/src/modules/users/users.dto.ts`
- `backend/src/modules/users/users.routes.ts`
- `tests/unit/users.service.test.ts`

**Files to modify**
- `backend/src/routes/index.ts` (mount `users.routes`)

**Files to delete**
- `backend/src/services/databaseService.ts` — user-related methods only (rest removed module-by-module in M8-M14)

**Risks**
Low — Users has few callers today. The real risk is under-investing in getting the pattern right here, since every later module copies whatever shape this one sets.

**Rollback plan**
The old `databaseService.ts` user methods can stay in place, unused, until this module is confirmed working — delete them in a follow-up commit rather than the same one, so reverting is trivial.

---

## M6 — Authentication

**Complexity: High**

**Goal:** Rebuild register/login/verify/logout on the new layers, fix the verification bypass and broken token lookup, and move from bearer-in-localStorage to httpOnly cookies with a real refresh-token rotation flow.

**Files to create**
- `backend/src/modules/auth/{auth.repository,auth.service,auth.controller,auth.dto,auth.routes}.ts`
- `backend/src/common/middleware/auth.ts` (cookie-based)
- `frontend/src/lib/session.ts`
- `tests/integration/auth.test.ts`

**Files to modify**
- `frontend/src/hooks/useAuth.tsx` (cookie session, not localStorage)
- `frontend/src/services/api.ts` (withCredentials, remove manual header injection)
- `backend/src/modules/notifications/emailService.ts` (real send, not console.log)

**Files to delete**
- `backend/src/controllers/authController.ts`
- `backend/src/utils/postgresDB.ts`
- `backend/src/middleware/auth.ts` (old version)

**Risks**
Highest-blast-radius milestone so far — every authenticated request depends on this. All existing sessions invalidate the moment token storage changes, forcing a re-login for any live user. CSRF protection (Section 16) must ship in the *same* milestone, not after — cookie auth without it is a regression, not an improvement.

**Rollback plan**
Ship behind a feature flag if any users are live; otherwise, keep the old bearer-token middleware importable but unrouted for one release cycle so reverting the frontend alone (without a backend redeploy) is possible if an issue surfaces post-launch.

---

## M7 — Authorization (RBAC)

**Complexity: Medium**

**Goal:** Replace every ad-hoc permission check scattered across controllers with the two composable middlewares from Section 7, wired at the route level.

**Files to create**
- `backend/src/common/middleware/requireRole.ts`
- `backend/src/common/middleware/requireTeamMembership.ts`
- `tests/unit/rbac.test.ts`

**Files to modify**
- `backend/src/middleware/auth.ts` → merged into `requireRole` (old `authorize()` removed)

**Files to delete**
- Per-handler `isTeamOwnerOrAdmin` checks — removed module-by-module as M8-M14 land, not all at once

**Risks**
A too-broad middleware applied to the wrong route can either lock out legitimate users or, worse, under-restrict — this needs integration tests asserting both a 403 for the wrong role *and* a 200 for the right one, not just the happy path.

**Rollback plan**
Middleware is additive per-route; a problem route can have the old inline check restored individually without affecting other routes already migrated.

---

## M8 — Teams module

**Complexity: Medium**

**Goal:** First full domain module rebuilt on the new pattern — consolidates the three competing team-CRUD implementations the audit found into one.

**Files to create**
- `backend/src/modules/teams/{teams.repository,teams.service,teams.controller,teams.dto,teams.routes}.ts`
- `tests/integration/teams.test.ts`

**Files to modify**
- `frontend/src/pages/Teams.tsx` (new API shape — full rewrite tracked in M16)

**Files to delete**
- `backend/src/controllers/teamController.ts`
- `backend/src/utils/teamDB.ts`
- `backend/src/utils/memoryDB.ts`

**Risks**
Team invites/join-requests involve multi-step transactions (accept invite, approve join request) — these need to move to the repository layer atomically, not lose the transaction safety the current code happens to have.

**Rollback plan**
Keep `teamController.ts` mounted at a `/legacy` prefix until the new routes are confirmed in staging, then remove it in a follow-up commit.

---

## M9 — Projects & Tasks module

**Complexity: High**

**Goal:** Rebuild the largest single controller in the codebase, and land the new `task_contributors`/`task_dependencies` junction tables from M3 in real queries for the first time.

**Files to create**
- `backend/src/modules/projects/*.ts`
- `backend/src/modules/tasks/*.ts`
- `tests/integration/{projects,tasks}.test.ts`

**Files to modify**
- `frontend/src/pages/Projects.tsx` (595-line file split into `feature/projects/` components — tracked in M16)

**Files to delete**
- `backend/src/controllers/projectController.ts`

**Risks**
Highest-touched module by request volume in most usage patterns — the mass-assignment fix here (named update methods instead of arbitrary `SET` clauses) needs full regression coverage on every existing "edit task"/"edit project" flow before cutover.

**Rollback plan**
Feature-flag the new endpoints behind a header or env toggle so the old controller can be re-enabled instantly if a regression surfaces in production.

---

## M10 — Goals module

**Complexity: Low**

**Goal:** Smallest and lowest-risk domain module — a good milestone to parallelize with M9 if a second engineer is available.

**Files to create**
- `backend/src/modules/goals/*.ts`
- `tests/integration/goals.test.ts`

**Files to modify**
- `frontend/src/pages/Goals.tsx`

**Files to delete**
- `backend/src/controllers/goalController.ts`

**Risks**
Minimal — goal-hierarchy rollup logic (task→milestone→objective→goal) is currently thin/aspirational per the product roadmap, so there's little existing behavior to regress.

**Rollback plan**
Single-module revert; no other module depends on Goals' internals.

---

## M11 — Pulse / Logs module

**Complexity: High**

**Goal:** Rebuild daily-log CRUD, replace the forgeable SHA-256 "signature" with real HMAC signing (or formally deprioritize the feature — a product decision to make explicitly here, not by default), and add the timeout/circuit-breaker the audit found missing on every Groq call.

**Files to create**
- `backend/src/modules/logs/*.ts`
- `backend/src/modules/ai/groqClient.ts` (with AbortController timeout)
- `tests/unit/logs.signing.test.ts`

**Files to modify**
- `frontend/src/pages/Pulse.tsx`

**Files to delete**
- `backend/src/utils/crypto.ts` (old unkeyed hash)
- `backend/src/services/logService.ts`, `aiService.ts` (old versions)

**Risks**
Re-signing logic changes what a "valid signature" means — any existing signed logs in the database need either a one-time re-signing migration or a documented "signed under v1/v2" flag, or old logs will fail verification under the new scheme.

**Rollback plan**
Ship signature-scheme version alongside each log row from day one of this milestone, so both old and new verification logic can coexist during rollback if needed.

---

## M12 — SOS Hub + real-time

**Complexity: Very High**

**Goal:** The first milestone that actually uses Socket.io and Redis for something — replacing 3-5 second polling with real push, and requiring the M19 hosting cutover (Render/Fly, not Vercel) to be live first since this is the feature that specifically cannot run on serverless.

**Files to create**
- `backend/src/modules/blockers/*.ts`
- `backend/src/realtime/gateway.ts`
- `backend/src/realtime/roomAuth.ts`
- `tests/integration/blockers.test.ts`

**Files to modify**
- `frontend/src/pages/SOSHub.tsx` (socket subscription, remove `setInterval` polling)
- `backend/src/app.ts` (attach Socket.io server)

**Files to delete**
- `backend/src/controllers/sosController.ts`

**Risks**
Depends on M19's hosting cutover already being complete — building this before the API has moved off Vercel would mean building against infrastructure that can't run it. Socket auth (proving a connected socket belongs to an authenticated, team-scoped user) is a new attack surface with no precedent elsewhere in this codebase.

**Rollback plan**
Keep the polling-based frontend code path behind a flag until the socket path is confirmed stable under real load — this is the one module worth a genuine parallel-run period before removing the old mechanism.

---

## M13 — Leaderboard module

**Complexity: Medium**

**Goal:** Fix the O(n) write-storm the audit found (every leaderboard view recomputes and rewrites every user's impact score) by introducing the first real Redis cache read path.

**Files to create**
- `backend/src/modules/leaderboard/*.ts`
- `backend/src/jobs/recalculateImpactScores.ts` (scheduled, not per-request)

**Files to modify**
- `frontend/src/pages/Grid.tsx`

**Files to delete**
- `backend/src/controllers/leaderboardController.ts`

**Risks**
Moving score computation from "on every read" to "on a schedule" changes freshness guarantees — needs an explicit "last updated" timestamp on the UI so the change in behavior is visible, not silent.

**Rollback plan**
The scheduled job and the cache layer are additive; reverting to synchronous per-request computation is a config toggle, not a code rewrite, if latency/staleness tradeoffs need revisiting.

---

## M14 — Executive Brief + background jobs

**Complexity: High**

**Goal:** First real use of BullMQ — weekly report generation moves off the request path entirely, and invite/notification emails go from `console.log` to actually sent.

**Files to create**
- `backend/src/modules/analytics/*.ts`
- `backend/src/jobs/weeklyReport.ts`
- `backend/src/modules/notifications/{emailService,templates}/*.ts`
- `tests/integration/analytics.test.ts`

**Files to modify**
- `frontend/src/pages/ExecutiveBrief.tsx`

**Files to delete**
- `backend/src/controllers/privacyController.ts` (`deleteUserData`) — rebuilt to actually delete data, not just log intent

**Risks**
The rebuilt `deleteUserData` is the first genuinely destructive endpoint in the app — needs its own confirmation flow, audit-log entry, and staged rollout (soft-delete with a grace period before hard delete) rather than an immediate irreversible cascade.

**Rollback plan**
Ship the deletion job as soft-delete-only in this milestone; hard-delete can be a deliberate, separately-approved follow-up once the soft-delete path has run safely in production.

---

## M15 — Frontend architecture refactor

**Complexity: High**

**Goal:** Build the shared layer every page-level migration in M16 depends on: a real UI component library, TanStack Query, and shared TypeScript types generated from the backend's Zod DTOs — closing the "50 instances of `any`" finding at its source rather than page by page.

**Files to create**
- `frontend/src/components/ui/{Button,Modal,Card,Input,Badge,Spinner}.tsx`
- `frontend/src/lib/queryClient.ts`
- `frontend/src/lib/apiClient.ts` (typed, replacing the flat `api.ts`)
- `frontend/src/types/` (generated or hand-shared from backend DTOs)

**Files to modify**
- `frontend/src/App.tsx` (nested layout route, replacing repeated Navigation includes)
- `frontend/vite.config.ts` (route-level code splitting setup)

**Files to delete**
- `frontend/src/services/api.ts` (flat, untyped)

**Risks**
This is a foundation milestone with no user-visible feature of its own — easy to under-prioritize, but every page rewrite in M16 is slower and less consistent without it done first.

**Rollback plan**
New library and query client are additive until M16 starts consuming them — no existing page breaks if this milestone lands and nothing yet imports it.

---

## M16 — Frontend module migration

**Complexity: Very High**

**Goal:** Move every page onto the M15 foundation and the new backend API shape, one feature at a time — this is the milestone that finally breaks up the 781-line `Teams.tsx` and its siblings into feature folders with real components.

**Files to create**
- `frontend/src/features/{auth,pulse,teams,projects,goals,sos-hub,leaderboard,analytics}/*`

**Files to modify**
- `frontend/src/App.tsx` (route table repointed to feature modules, `React.lazy` per route)

**Files to delete**
- `frontend/src/pages/*.tsx` (all — superseded by `features/`)

**Risks**
Largest single milestone by file count — recommend migrating and shipping one feature folder at a time behind its own PR rather than one giant cutover, so a regression in one feature doesn't block the rest.

**Rollback plan**
Per-feature PRs mean per-feature revert; keep the old page components until their replacement feature folder has a full day of production traffic behind it.

---

## M17 — Observability & security hardening

**Complexity: Medium**

**Goal:** The cross-cutting security items from Section 16 that don't belong to any single module: Sentry, rate limiting, helmet, and a final pass confirming the mass-assignment and CSRF fixes actually hold under adversarial testing.

**Files to create**
- `backend/src/common/middleware/rateLimit.ts`
- Sentry project + SDK init (backend and frontend)

**Files to modify**
- `backend/src/app.ts` (helmet, rate limiter, CORS allowlist wired in)

**Files to delete**
- — (nothing to remove; purely additive)

**Risks**
An overly aggressive rate limit can lock out legitimate burst traffic (e.g. a team all logging in at 9am) — tune against real usage patterns, not a guessed default.

**Rollback plan**
Every item here is a config value or middleware that can be loosened or disabled independently without touching business logic.

---

## M18 — Testing backfill

**Complexity: High**

**Goal:** By this point every module has its own tests written alongside it (per M5-M14's file lists) — this milestone closes remaining gaps, adds the Playwright e2e suite, and turns on the CI coverage gate for real.

**Files to create**
- `tests/e2e/*.spec.ts` (Playwright)
- Remaining unit/integration gaps identified by a coverage report

**Files to modify**
- `.github/workflows/ci.yml` (coverage threshold now enforced, not just measured)

**Files to delete**
- — (nothing to remove)

**Risks**
Backfilling tests after the fact tends to test implementation rather than behavior if done too quickly — worth a review pass specifically checking that tests would fail if the bug they're meant to guard against were reintroduced.

**Rollback plan**
Coverage gate threshold is a single config number — lower it temporarily if it blocks an otherwise-good merge, rather than skipping tests entirely.

---

## M19 — CI/CD & deployment cutover

**Complexity: Medium**

**Goal:** Move the API off Vercel onto Render/Fly, stand up staging, and wire the full pipeline from Section 19. Note this needs to land *before* M12 (SOS Hub), since real-time features can't be built against infrastructure that isn't there yet — sequenced last here for narrative completeness, but scheduled earlier in practice.

**Files to create**
- `render.yaml` (or `fly.toml`)
- `.github/workflows/deploy.yml`
- Staging Neon branch + Render/Fly staging service

**Files to modify**
- `frontend/.env.production` (`VITE_API_URL` actually read, per the audit's dead-env-var finding)

**Files to delete**
- `backend/vercel.json`
- `backend/.vercel/`, `frontend/.vercel/` (frontend keeps a fresh one from its Vercel git integration)
- `install.bat`, `setup-database.bat`, `setup-databases.bat`, `start.bat` (consolidated per Section 20)

**Risks**
DNS/domain cutover and any in-flight requests during the switch are the main real-world risk — schedule for a low-traffic window and keep the old Vercel deployment reachable as a fallback for a short overlap period.

**Rollback plan**
Keep the Vercel backend deployment live and un-deleted until the Render/Fly deployment has run in production for an agreed burn-in period — reverting is a DNS/env-var change, not a code change.

---

*Blueprint only — no files created, modified, or deleted to produce this document. Each milestone above awaits individual approval before implementation begins.*
