-- Up Migration
-- Every index below backs a WHERE clause that already exists in a live
-- repository method today (not speculative) -- team_invites and
-- join_requests had zero indexes despite being queried by email/team_id on
-- every invite/join-request lookup, and projects had none at all despite
-- every "my projects" and "team projects" read filtering on exactly these
-- columns. The two composite indexes (blockers, tasks) support the
-- status-scoped queries the leaderboard/dashboard code already filters on
-- in application code today, ahead of that filtering moving into SQL.

CREATE INDEX idx_team_invites_email ON team_invites(email);
CREATE INDEX idx_team_invites_team ON team_invites(team_id);
CREATE INDEX idx_join_requests_team ON join_requests(team_id);
CREATE INDEX idx_projects_team ON projects(team_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_goals_created_by ON goals(created_by);
CREATE INDEX idx_daily_logs_log_date ON daily_logs(log_date);
CREATE INDEX idx_blockers_team_status ON blockers(team_id, status);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

-- Down Migration

DROP INDEX IF EXISTS idx_team_invites_email;
DROP INDEX IF EXISTS idx_team_invites_team;
DROP INDEX IF EXISTS idx_join_requests_team;
DROP INDEX IF EXISTS idx_projects_team;
DROP INDEX IF EXISTS idx_projects_created_by;
DROP INDEX IF EXISTS idx_goals_created_by;
DROP INDEX IF EXISTS idx_daily_logs_log_date;
DROP INDEX IF EXISTS idx_blockers_team_status;
DROP INDEX IF EXISTS idx_tasks_project_status;
