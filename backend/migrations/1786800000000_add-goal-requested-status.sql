-- Up Migration
-- Corrective fix: the original review-workflow migration (1786700000000)
-- recorded WHO submitted/approved a review but never WHAT was actually
-- being requested -- so approve() always finalized status='completed',
-- regardless of whether the member intended a completion request or just
-- wanted the leader to sign off on an ordinary progress/stage change
-- (e.g. 40% -> 60%, still "In Progress"). requested_status records the
-- member's actual intent at submission time (defaults to the goal's
-- current status when they aren't asking for a status change at all);
-- approve() now applies exactly this value instead of unconditionally
-- completing the goal. NULL means "no review currently pending" -- same
-- convention as the other three review columns, never "this goal /
-- migration state is incompatible."

ALTER TABLE goals ADD COLUMN requested_status VARCHAR(50);

-- Down Migration

ALTER TABLE goals DROP COLUMN requested_status;
