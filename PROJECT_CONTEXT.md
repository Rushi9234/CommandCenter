# CommandCenter Project Context

## Current Status
Version: v0.12
Latest milestone: M12 CI/CD Pipeline & Quality Gates

## Completed Milestones

M5:
- Enterprise RBAC
- Team roles and authorization hierarchy

M6:
- Repository/middleware authorization refactor

M7:
- Security hardening
- Headers
- Auth rate limiting
- AUTO_VERIFY guard

M8:
- Reliability hardening
- PostgreSQL startup retry
- Honest health checks
- Refresh token cleanup

M9:
- Jest + Supertest integration testing
- Auth and RBAC regression suite

M10:
- Leaderboard scalability rewrite
- Removed N+1 queries
- Aggregate SQL + bulk updates

M11:
- Observability foundation
- Request IDs
- Structured security logs
- Removed secret token logging

M12:
- GitHub Actions CI
- Node 20 pinning
- Package lockfiles
- Backend/frontend build gates

## Current Architecture

Backend:
- Node.js + Express + TypeScript
- PostgreSQL
- JWT authentication
- Repository pattern
- Middleware-based RBAC

Frontend:
- React + Vite + TypeScript

Testing:
- Jest
- Supertest
- commandcenter_test database

CI:
- GitHub Actions
- Backend + Frontend parallel jobs

## Important Rules

Before implementing any milestone:
1. Perform architecture audit first.
2. Do not change files outside approved scope.
3. Preserve existing API contracts.
4. Add tests for behavior changes.
5. Commit with milestone naming convention.

Current release:
v0.12

Next planned milestone:
M13 Production Deployment & Infrastructure Readiness