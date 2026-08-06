# CommandCenter

Team Productivity & AI-Mentorship Platform — daily async work-log journaling with AI-assisted analysis, blocker resolution, and team visibility, built without surveillance-style individual tracking.

## Overview

CommandCenter lets a team log daily work ("The Pulse"), get AI-assisted sentiment/summary analysis on that work, track streaks, submit and resolve blockers with AI-suggested help ("SOS Hub"), organize work into teams/projects/tasks/goals, and see team-level (not individual) analytics on a leaderboard and executive brief.

The codebase is in the middle of a staged, milestone-based rebuild (see `docs/architecture/`) moving it from an early prototype to a production-grade backend. As of the current milestone, the backend has been through:

- **Milestone 1** — Foundations & safety: secrets hygiene, dead-code removal, git history cleanup.
- **Milestone 2** — Clean Architecture refactor: every module now follows a consistent `routes → controller → service → repository` layering with Zod-validated DTOs and centralized error handling.
- **Milestone 3** — Database layer redesign: versioned SQL migrations, connection pool consolidation, closed a mass-assignment gap across every update endpoint.
- **Milestone 4** — Authentication rebuild: centralized JWT handling, refresh-token rotation, password reset, email verification, and CSRF protection for cookie-based sessions.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon), `node-pg-migrate` for schema migrations |
| Validation | Zod |
| Auth | JWT (access + refresh), bcrypt, httpOnly cookies with CSRF protection |
| AI | Groq (Llama 3.3 70B) |

## Architecture summary

**Clean Architecture.** The backend is a modular monolith. Each domain module (`auth`, `users`, `teams`, `projects`, `tasks`, `goals`, `blockers`, `logs`, `leaderboard`, `privacy`, `ai`) owns its own `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, and `*.dto.ts`. Controllers are thin — they parse a request, call one service method, and shape the response. Business rules live in services; nothing but a repository ever executes a database query.

**Repository Pattern.** Every table's data access lives behind a typed repository class exposing named methods (`getUserById`, `updateTeamSettings`, etc.) rather than generic key-value operations. Dynamic `UPDATE` statements build their `SET` clause from an explicit per-table column allowlist, not from whatever keys a request body happens to contain.

**Service Layer.** Permission checks, multi-step orchestration, and business rules (streak calculation, impact scoring, session issuance) live in services, not controllers or repositories.

**DTO Validation.** Every request body/query/params that reaches a controller is validated against a Zod schema first. Validation failures short-circuit to a centralized error handler before any business logic runs.

**Database migrations.** Schema changes are versioned SQL migrations under `backend/migrations/`, applied and rolled back with `node-pg-migrate` (`npm run migrate:up` / `migrate:down`) — not hand-run `.sql` files against a live database.

**Authentication security.** JWT signing/verification is centralized in one module; there is no hardcoded fallback secret. Refresh tokens are opaque, hashed before storage, and rotated on every use (a replayed refresh token is rejected). Password reset and email verification both use one-time, expiring, hashed tokens. State-changing requests authenticated via cookie require a matching CSRF token (double-submit pattern); the same requests authenticated via bearer header don't need one, since that transport isn't CSRF-exposed.

## Documentation

- `docs/ARCHITECTURE.md` — architecture reference with diagrams (request lifecycle, auth flow, database ER diagram)
- `docs/architecture/ENTERPRISE_REBUILD_BLUEPRINT.md` — the full milestone-by-milestone rebuild plan
- `DEPLOYMENT_GUIDE.md`, `DATABASE_SETUP.md`, `GROQ_SETUP_GUIDE.md`, `API_TESTING_GUIDE.md` — setup references

## Getting started

**Prerequisites:** Node.js 18+, a PostgreSQL database (Neon or local).

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in your own DATABASE_URL, JWT_SECRET, GROQ_API_KEY
npm run migrate:up     # apply database migrations
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

See `backend/.env.example` for the full list of required environment variables. None of them are provided in this repository — every deployment supplies its own.
