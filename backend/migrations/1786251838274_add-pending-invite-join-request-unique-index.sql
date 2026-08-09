-- Up Migration

-- Milestone 40: team_invites/join_requests had no unique constraint at
-- all, so calling POST /teams/:teamId/invite or POST /teams/:teamId/join
-- repeatedly for the same team+email/caller silently inserted a new row
-- every time -- no error, no dedup. getUserInvites/getTeamJoinRequests
-- return every duplicate row, so this let a single caller spam an admin's
-- invite/join-request queue with an unbounded number of identical
-- pending entries. Not an authorization bypass (accepting/approving any
-- one of the duplicates still requires the same authorization it always
-- did), but a real data-integrity/availability nuisance worth closing the
-- same way M24/M25 closed the equivalent daily_logs/team_members
-- problem: a partial unique index scoped to 'pending' rows only, so
-- historical accepted/rejected/revoked rows (which legitimately can
-- repeat -- someone can be invited, leave, and be invited again) are
-- never constrained, only the "more than one still-open invite/request
-- for the same team+email/caller at once" case.
--
-- Guard: refuse to add either index if a pending duplicate already
-- exists, rather than silently picking one to keep. Verified against both
-- the dev and test databases before writing this migration -- zero
-- duplicates exist in either as of Milestone 40.
DO $$
DECLARE
  invite_dupe_count INTEGER;
  join_request_dupe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invite_dupe_count
  FROM (
    SELECT team_id, email
    FROM team_invites
    WHERE status = 'pending'
    GROUP BY team_id, email
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF invite_dupe_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique index: % duplicate pending (team_id, email) group(s) already exist in team_invites. Resolve them before re-running this migration.', invite_dupe_count;
  END IF;

  SELECT COUNT(*) INTO join_request_dupe_count
  FROM (
    SELECT team_id, user_id
    FROM join_requests
    WHERE status = 'pending'
    GROUP BY team_id, user_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF join_request_dupe_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique index: % duplicate pending (team_id, user_id) group(s) already exist in join_requests. Resolve them before re-running this migration.', join_request_dupe_count;
  END IF;
END $$;

CREATE UNIQUE INDEX idx_team_invites_pending_unique ON team_invites (team_id, email) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_join_requests_pending_unique ON join_requests (team_id, user_id) WHERE status = 'pending';

-- Down Migration

DROP INDEX IF EXISTS idx_team_invites_pending_unique;
DROP INDEX IF EXISTS idx_join_requests_pending_unique;
