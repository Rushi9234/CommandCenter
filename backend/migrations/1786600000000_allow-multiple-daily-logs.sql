-- Up Migration
--
-- Daily logs are individual work entries. Multiple entries from the same
-- user on the same date are valid, so the previous user/date uniqueness
-- constraint must no longer be enforced.

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_user_id_log_date_unique;

-- Down Migration
--
-- Re-enable the old one-log-per-day rule when rolling this migration back.
-- This will fail intentionally if multiple same-day rows already exist;
-- those rows must be reconciled before rollback.

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_user_id_log_date_unique
  UNIQUE (user_id, log_date);