-- Up Migration
-- Goal CREATION governance -- deliberately separate from the existing
-- completion-review workflow (submitted_for_review_by/at, approved_by/at,
-- requested_status), which only ever governed marking a team goal
-- "completed." Nothing previously gated the *creation* of a team goal at
-- all: any non-viewer team member (owner/admin/manager/member) could
-- create a goal that was immediately live/official. The user wants team-
-- goal authority to belong to the team leader (owner/admin) -- a normal
-- member may PROPOSE a team goal, but it must enter a pending state until
-- a leader approves or rejects it.
--
-- creation_status: NULL means "not a pending/rejected proposal" -- same
-- NULL-convention already used by requested_status (1786800000000) --
-- covers personal/teamless goals (never applicable), goals created by a
-- team leader themselves (auto-approved, no self-approval step needed),
-- and every pre-existing team goal created before this migration
-- (grandfathered as approved -- no backfill needed, NULL already means
-- "no pending creation-approval workflow" for these exact same reasons
-- the other review columns use NULL for "nothing pending"). The only
-- other values are 'pending_approval' (member-proposed, awaiting a
-- leader) and 'rejected' (leader declined the proposal).
ALTER TABLE goals ADD COLUMN creation_status VARCHAR(50);
ALTER TABLE goals ADD COLUMN creation_reviewed_by UUID REFERENCES users(user_id);
ALTER TABLE goals ADD COLUMN creation_reviewed_at TIMESTAMP;

-- Down Migration

ALTER TABLE goals DROP COLUMN creation_status;
ALTER TABLE goals DROP COLUMN creation_reviewed_by;
ALTER TABLE goals DROP COLUMN creation_reviewed_at;
