-- Up Migration
-- Discovered live during Milestone 5 testing: acceptInvite's SQL sets
-- accepted_at, but the column never existed on team_invites -- the exact
-- same class of bug as M2/M3's missing updated_at columns. This code path
-- was never exercised end-to-end (with a real, matching invite) by any
-- prior milestone's testing.

ALTER TABLE team_invites ADD COLUMN accepted_at TIMESTAMP;

-- Down Migration

ALTER TABLE team_invites DROP COLUMN accepted_at;
