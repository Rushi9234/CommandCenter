-- Up Migration
-- Milestone 5: team_members.role has been a free-text VARCHAR(50) with no
-- constraint since the original schema -- the audit flagged this as one of
-- ~9 unconstrained "enum-like" columns. Constrains it to the five roles the
-- RBAC model defines. Before adding the constraint, backfills 'owner' for
-- the one case that can be inferred unambiguously: a team_members row whose
-- user_id matches that team's created_by was always the creator, who has
-- been getting 'admin' (not 'owner') since createTeam's original
-- implementation -- this corrects that without guessing at any row where
-- creator identity isn't directly verifiable from existing data.

UPDATE team_members tm
SET role = 'owner'
FROM teams t
WHERE tm.team_id = t.team_id
  AND tm.user_id = t.created_by
  AND tm.role = 'admin';

ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer'));

-- Down Migration

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;

-- Backfilled 'owner' rows are left as 'owner' on rollback -- reverting them
-- to 'admin' would be lossy in the other direction (we'd be guessing they
-- were never meant to be distinguished), and 'owner' remains a valid value
-- for that column with or without the constraint in place.
