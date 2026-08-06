-- Up Migration

-- Backs the Milestone 10 leaderboard rewrite's task_stats CTE, which joins
-- tasks to users on t.created_by for every user in one query instead of
-- once per user (tasks.repository.ts's getUserTasks had the same
-- created_by filter, but was never indexed for it since it only ran once
-- per user before now).
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

-- Down Migration

DROP INDEX IF EXISTS idx_tasks_created_by;
