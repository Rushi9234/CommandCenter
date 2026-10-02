-- Up Migration
-- Resolves the schema mismatch found during the M2 review: every dynamic
-- UPDATE ... SET clause in the repository layer sets `updated_at =
-- CURRENT_TIMESTAMP`, but no table actually had that column, so every
-- "edit" endpoint in the app (users, teams, projects, tasks, goals,
-- blockers, daily_logs) threw a 500. This adds the missing column to
-- exactly the 7 tables whose repository code references it -- no other
-- schema change.

ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE teams ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE projects ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE goals ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE blockers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE daily_logs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Down Migration

ALTER TABLE users DROP COLUMN updated_at;
ALTER TABLE teams DROP COLUMN updated_at;
ALTER TABLE projects DROP COLUMN updated_at;
ALTER TABLE tasks DROP COLUMN updated_at;
ALTER TABLE goals DROP COLUMN updated_at;
ALTER TABLE blockers DROP COLUMN updated_at;
ALTER TABLE daily_logs DROP COLUMN updated_at;
