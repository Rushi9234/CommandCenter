-- Up Migration
-- Notifications system (P2). One user-scoped notifications table + one
-- preferences column on users, reusing the exact JSONB-settings-object
-- convention users.privacy_settings already established (a default JSON
-- literal, per-category booleans, no normalized preferences table --
-- preferences are a small, read-heavy/write-rare per-user map, not a
-- relational query target).
--
-- user_id CASCADEs (matches every other recipient-owned table in this
-- schema: team_members, refresh_tokens, daily_logs, join_requests,
-- daily_work_entries/submissions all cascade their user_id). The entity-
-- reference columns (team/project/goal/task/blocker) SET NULL instead --
-- a notification is owned by its RECIPIENT, not by the entity it's
-- about, so deleting that entity later should not silently erase the
-- user's own notification history, only null out the now-dead
-- cross-reference (same reasoning as projects.team_id/goals.team_id
-- already using SET NULL for an optional, non-owning link).
--
-- category is free text (VARCHAR), not a DB enum -- consistent with
-- goal_type/status/team_type elsewhere in this schema, and required by
-- the product instruction that new categories must be addable without a
-- schema change. Validated at the application layer instead.
--
-- read_at follows the same NULL-means-nothing-pending convention already
-- used throughout (requested_status, submitted_for_review_at, etc.):
-- NULL = unread, a timestamp = read (and doubles as the read timestamp,
-- no separate is_read boolean needed).
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    team_id UUID REFERENCES teams(team_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    goal_id UUID REFERENCES goals(goal_id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(task_id) ON DELETE SET NULL,
    blocker_id UUID REFERENCES blockers(blocker_id) ON DELETE SET NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Real access patterns: "my notifications, newest first" (list) and "my
-- unread count" (badge) are both always scoped by user_id first --
-- composite indexes lead with user_id, matching the existing
-- idx_daily_logs_user_date / idx_blockers_team_status convention.
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);

ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{
  "team_join_request": true,
  "goal_creation": true,
  "goal_completion": true,
  "task_assignment": true,
  "blocker": true
}';

-- Down Migration

DROP TABLE notifications;
ALTER TABLE users DROP COLUMN notification_preferences;
