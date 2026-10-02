# CommandCenter

Team Productivity & AI-Mentorship Platform — daily async work-log journaling with AI-assisted analysis, blocker resolution, and team visibility, built without surveillance-style individual tracking.

## Overview

CommandCenter lets a team log daily work ("The Pulse"), get AI-assisted sentiment/summary analysis on that work, track streaks, submit and resolve blockers with AI-suggested help ("SOS Hub"), organize work into teams/projects/tasks/goals, and see team-level (not individual) analytics on a leaderboard and executive brief.

The codebase is undergoing a staged, milestone-based rebuild (see `docs/architecture/`) moving it from a prototype to a production-grade application.

---

## Current System Implementation Status

### 1. Implemented & Verified Locally
- **Email/Password Registration & Dual Verification:**
  - **Method A (Interactive 6-Digit Email OTP):** Cryptographically hashed (`email_otp_hash`), 10-min TTL, 5-attempt limit, 60s resend cooldown.
  - **Method B (Single-Click Verification Link):** SHA-256 token hash (`verification_token_hash`), 24-hr TTL.
  - **Atomic Cross-Invalidation:** Verifying via either method immediately clears both credentials in a single SQL update (`WHERE is_verified = false`).
- **Multi-Channel Password Recovery:**
  - Supports password reset via single-use **Email Reset Link** and 6-digit **Email OTP**.
  - Enforces a 5-attempt lockout, anti-enumeration generic responses, and revokes all active refresh tokens upon completion (`revoked_at = NOW()`).
- **Google OAuth 2.0 / OIDC Integration:**
  - Full PKCE (`code_verifier` / `code_challenge`) flow, signed HMAC-SHA256 `stateToken` cookie (`oauth_state`), and OIDC ID Token verification.
  - Supports automatic account linking for verified emails and new user provisioning.
- **Account Security & Profile Management:**
  - **Change Password:** Requires current password confirmation, validates complexity/uniqueness, updates `password_changed_at`, and revokes all active sessions.
  - **Change Email:** Requires password confirmation, sends verification token to the *new* address, sets `pending_email`, updates `email_changed_at`, and revokes sessions upon verification.
- **Phone OTP Verification (Console Simulation):**
  - E.164 normalization, 6-digit numeric OTP generation, SHA-256 hash storage (`phone_otp_hash`), 10-min TTL, 5-attempt limit, 60s resend cooldown.
  - Includes normalized phone-number rate limiting (5 req/hr per destination number) and global IP ceilings (30 req/hr).
  - Uses `ConsoleSmsProvider` (`SMS_PROVIDER=console`) by default — outputs simulated SMS OTPs to application logs without external API calls or vendor costs.
- **Project & Team Authorization (RBAC):**
  - **Privacy Defaults:** Team projects default to team-private (`is_public: false`); standalone projects default to public (`is_public: true`).
  - **Strict Read Isolation:** Gated by `(p.team_id IS NULL AND p.is_public = true) OR (p.team_id IS NOT NULL AND p.team_id IN (SELECT team_id FROM team_members WHERE user_id = $2))`. Unrelated non-team members are denied access (`403 Forbidden`) even if `is_public` was set.

### 2. Manually Tested Locally
- **Google OAuth Flow:** Manually verified using local OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).
- **Email Links & Password Reset:** Manually verified using local SMTP / console provider.

### 3. Pending Production Actions (Not Performed)
- **Production Database Migrations:** Production database migrations have **not** been applied. All schema changes were executed and verified against a dedicated local test database (`commandcenter_test`).
- **Production Deployment:** Deployment to production hosting (Vercel/Render/Fly.io) remains pending.
- **Vendor Dashboard Verification:** Code and environment variables were audited locally. Project owners must independently verify live plan usage, spending limits, auto-upgrade settings, and payment methods on third-party vendor dashboards (Vercel, Neon, Groq, Google Cloud Console).

### 4. Deferred & Planned Future Work
- **Real SMS Gateway Activation (Deferred):** Real SMS delivery (e.g., MSG91 or Twilio) remains deferred due to vendor service costs and mandatory India DLT (Distributed Ledger Technology) template registration prerequisites.
- **Help Center & User Guide (Planned Future Work):** Help Center articles and in-app User Guides are designated as planned future enhancements and are not currently included in the active codebase.

---

## Local Verification & Test Results

All core backend logic and security controls are validated by an automated test suite. The latest local test results are reported below:

| Suite Name | Status | Passed / Total | Key Coverage Areas |
| :--- | :---: | :---: | :--- |
| **`tests/auth.test.ts`** | **PASS** | 27 / 27 | Registration, login, JWT issuance, refresh token rotation, verification gate |
| **`tests/authOTP.test.ts`** | **PASS** | 8 / 8 | 6-digit Email OTP, attempt lockout, atomic cross-invalidation |
| **`tests/oauth.test.ts`** | **PASS** | 9 / 9 | OAuth PKCE, state token signing, user provisioning, account linking |
| **`tests/phoneVerification.test.ts`** | **PASS** | 39 / 39 | Phone OTP simulation, E.164 normalization, attempt limits, global/phone rate limits |
| **`tests/password-change-security.test.ts`** | **PASS** | 16 / 16 | Password change rate limiting, session revocation, security notifications |
| **`tests/emailChange.test.ts`** | **PASS** | 33 / 33 | Change email flow, token hashing, re-login validation, anti-enumeration |
| **`tests/rbac.test.ts`** | **PASS** | 16 / 16 | Team, Project, Task, Goal, Blocker, and Log authorization rules |
| **`tests/databaseIntegrityHardening.test.ts`** | **PASS** | 20 / 20 | Postgres error redaction, atomic team join/invite, payload length caps |

- **Total Test Results:** **168 / 168 tests passing** across 8 core test suites.
- **Backend TypeScript Compilation (`npx tsc --noEmit`):** **PASSED** (0 errors).
- **Frontend Production Build (`npm run build`):** **PASSED** (0 errors, Vite production bundle compiled in 12.53s).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Neon / local), `node-pg-migrate` for schema migrations |
| Validation | Zod |
| Auth | Centralized JWT (access + refresh), bcrypt (cost 12), OAuth 2.0 PKCE, httpOnly cookies |
| SMS Provider | Abstracted (`ConsoleSmsProvider` default for local development) |
| AI Integration | Groq API (Llama 3.3 70B) |

---

## Architecture Summary

- **Clean Architecture:** Modular monolith backend (`routes → controller → service → repository → dto`). Controllers are thin; business rules and authorization live in services; database queries are strictly encapsulated within typed repository classes.
- **Repository Pattern & Allowlist Protection:** Queries parameterize all inputs and enforce per-table column allowlists to prevent mass-assignment vulnerabilities.
- **Rate Limit Isolation:** Custom `RateLimitProvider` featuring tracked memory stores (`resetAllStores()`) to prevent test suite cross-contamination while preserving 100% of production security limits.

---

## Documentation Index

- `docs/ARCHITECTURE.md` — Complete system architecture, request lifecycle, auth flows, and ER diagram.
- `docs/architecture/ENTERPRISE_REBUILD_BLUEPRINT.md` — Milestone-by-milestone backend rebuild blueprint.
- `docs/features/auth/phase-1-implementation-delta.md` — Phase 1 Email OTP & Verification Link specification.
- `docs/features/auth/account-security-and-oauth-implementation-delta.md` — Account Security, Phone OTP, and Google OAuth specification.
- `DEPLOYMENT_GUIDE.md`, `DATABASE_SETUP.md`, `GROQ_SETUP_GUIDE.md`, `API_TESTING_GUIDE.md` — Setup and configuration guides.

---

## Getting Started

**Prerequisites:** Node.js 18+, PostgreSQL (Neon or local database).

```bash
# Backend
cd backend
npm install
cp .env.example .env   # Fill in DATABASE_URL, JWT_SECRET, GROQ_API_KEY, GOOGLE_CLIENT_ID, etc.
npm run migrate:up     # Apply database migrations locally
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

> [!NOTE]
> Environment variables must be configured locally. Never commit secrets, passwords, or private keys to source control.
