-- Up Migration

-- Milestone 24: daily_logs had no constraint at all preventing two rows
-- for the same (user_id, log_date). logs.service.ts's createLog() only
-- enforced "one log per day" with a SELECT-then-check in application
-- code, with a slow AI call between the check and the INSERT -- two
-- concurrent requests (a double-submitted form, a retried request) could
-- both pass the check before either committed, silently creating a
-- duplicate. This constraint is the actual fix; the application check
-- stays as the fast common-case path (see logs.service.ts).
--
-- Guard: refuse to add the constraint if a duplicate already exists,
-- rather than silently leaving the table in a state where the next
-- migration step would just fail with a less informative error, or
-- (worse) picking a row to keep without anyone deciding that on purpose.
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, log_date
    FROM daily_logs
    GROUP BY user_id, log_date
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot add UNIQUE constraint: % duplicate (user_id, log_date) group(s) already exist in daily_logs. Resolve them before re-running this migration.', duplicate_count;
  END IF;
END $$;

ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_user_id_log_date_unique UNIQUE (user_id, log_date);

-- Down Migration

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_user_id_log_date_unique;