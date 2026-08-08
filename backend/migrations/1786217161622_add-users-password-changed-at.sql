-- Up Migration
-- Milestone 38: resetPassword() revoked refresh_tokens rows but had no way
-- to invalidate a JWT (legacy 7-day bearer token, or the short-lived
-- cookie access token) already issued before the reset -- both are purely
-- stateless (middleware/auth.ts's authenticate() never touched the
-- database before this milestone), so a stolen token kept working for up
-- to 7 days after a reset explicitly meant to end every existing session.
-- Nullable and un-backfilled on purpose: NULL means "this account has
-- never gone through resetPassword," which must NOT retroactively
-- invalidate every token already issued to every existing user the moment
-- this migration runs.

ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;

-- Down Migration

ALTER TABLE users DROP COLUMN password_changed_at;
