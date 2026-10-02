-- Up Migration
-- Goals belonging to a team previously had no way to distinguish "a member
-- changed the status field to completed" from "the team leader actually
-- verified the work" -- any writer could set status='completed' directly
-- via PUT /goals/:goalId with no review step and no record of who signed
-- off. These four columns track that lightweight two-step workflow
-- (submit for review -> leader approves/returns) without introducing a
-- separate table: all four are nullable and un-backfilled on purpose, so
-- existing goals (and personal, teamless goals, which never go through
-- this workflow) are entirely unaffected.

ALTER TABLE goals ADD COLUMN submitted_for_review_by UUID REFERENCES users(user_id);
ALTER TABLE goals ADD COLUMN submitted_for_review_at TIMESTAMP;
ALTER TABLE goals ADD COLUMN approved_by UUID REFERENCES users(user_id);
ALTER TABLE goals ADD COLUMN approved_at TIMESTAMP;

-- Down Migration

ALTER TABLE goals DROP COLUMN submitted_for_review_by;
ALTER TABLE goals DROP COLUMN submitted_for_review_at;
ALTER TABLE goals DROP COLUMN approved_by;
ALTER TABLE goals DROP COLUMN approved_at;
