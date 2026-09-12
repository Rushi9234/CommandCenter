-- CommandCenter Database Schema for PostgreSQL

-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    impact_score INTEGER DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    total_logs INTEGER DEFAULT 0,
    team_id UUID,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    privacy_settings JSONB DEFAULT '{"ai_enabled": true, "sentiment_tracking": true, "leaderboard_visible": true, "analytics_opt_in": true}',
    -- Migration 1787000000000: notification category preferences, same
    -- JSONB-settings-object convention as privacy_settings above. All
    -- categories default ON; a missing/false key means that category is
    -- suppressed at notification-creation time (server-authoritative).
    notification_preferences JSONB DEFAULT '{"team_join_request": true, "goal_creation": true, "goal_completion": true, "task_assignment": true, "blocker": true}',
    verification_token_expires TIMESTAMP,
    password_reset_token_hash VARCHAR(255),
    password_reset_expires TIMESTAMP,
    -- Added by migration 1786217161622_add-users-password-changed-at.sql
    -- (Milestone 38). NULL until the first resetPassword() call for this
    -- user; authenticate() uses it to reject a JWT issued before the most
    -- recent password reset.
    password_changed_at TIMESTAMP,
    -- Profile fields (migration 1788000000000_add-profile-fields.sql)
    bio TEXT,
    pronouns VARCHAR(50),
    location VARCHAR(100),
    is_profile_public BOOLEAN DEFAULT false,
    -- Avatar fields (migration 1788000001000_add-avatar-fields.sql)
    avatar_key VARCHAR(500),
    avatar_mime_type VARCHAR(50),
    avatar_size INTEGER,
    avatar_width INTEGER,
    avatar_height INTEGER,
    avatar_uploaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    team_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(user_id),
    is_public BOOLEAN DEFAULT true,
    is_discoverable BOOLEAN DEFAULT true,
    max_team_size INTEGER DEFAULT 10,
    parent_team_id UUID REFERENCES teams(team_id),
    department VARCHAR(255),
    team_type VARCHAR(50) DEFAULT 'main',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members table
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
    permissions JSONB DEFAULT '{"can_assign_tasks": false, "can_delete_tasks": false, "can_view_analytics": false, "can_view_individual_performance": false, "can_export_data": false, "can_manage_members": false, "can_manage_settings": false}',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
);

-- Refresh tokens table (Milestone 4)
CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily logs table
CREATE TABLE daily_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entry_text TEXT NOT NULL,
    log_date DATE NOT NULL,
    log_time TIME NOT NULL,
    crypto_signature VARCHAR(255),
    entry_summary TEXT,
    bullet_points JSONB,
    sentiment_score DECIMAL(3,2),
    word_count INTEGER,
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name VARCHAR(255) NOT NULL,
    description TEXT,
    team_id UUID REFERENCES teams(team_id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'planning',
    priority VARCHAR(50) DEFAULT 'medium',
    is_public BOOLEAN DEFAULT true,
    deadline TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner UUID REFERENCES users(user_id),
    contributors JSONB DEFAULT '[]',
    reviewer UUID REFERENCES users(user_id),
    dependencies JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'todo',
    priority VARCHAR(50) DEFAULT 'medium',
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Blockers table
CREATE TABLE blockers (
    blocker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    blocker_type VARCHAR(50),
    urgency VARCHAR(50),
    impact VARCHAR(50),
    affected_tasks JSONB DEFAULT '[]',
    attempted_solutions TEXT,
    severity VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open',
    created_by UUID NOT NULL REFERENCES users(user_id),
    resolved_by UUID REFERENCES users(user_id),
    ai_suggestions JSONB,
    similar_blockers JSONB,
    suggested_helpers JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES blockers(blocker_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    message_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Goals table
CREATE TABLE goals (
    goal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'planning',
    progress INTEGER DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(user_id),
    team_id UUID REFERENCES teams(team_id) ON DELETE SET NULL,
    parent_goal_id UUID REFERENCES goals(goal_id),
    target_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    -- Migration 1786700000000: review workflow for team goals -- a member
    -- submits for review, a team owner/admin (leader) approves or returns
    -- it. Always NULL for personal (teamless) goals, which skip this
    -- workflow entirely.
    submitted_for_review_by UUID REFERENCES users(user_id),
    submitted_for_review_at TIMESTAMP,
    approved_by UUID REFERENCES users(user_id),
    approved_at TIMESTAMP,
    -- Migration 1786800000000: what the submitter is actually requesting
    -- ('completed' for a real completion request; any other status value
    -- for "please sign off on this stage/progress, not finished yet").
    -- approve() applies this verbatim instead of always completing.
    requested_status VARCHAR(50),
    -- Migration 1786900000000: goal CREATION governance, separate from the
    -- completion-review workflow above. NULL = not a pending/rejected
    -- proposal (personal goals, leader-created team goals, and every
    -- pre-existing team goal are all grandfathered as approved via NULL --
    -- same convention as requested_status). 'pending_approval' = a
    -- non-leader team member proposed this team goal; 'rejected' = a
    -- leader declined the proposal.
    creation_status VARCHAR(50),
    creation_reviewed_by UUID REFERENCES users(user_id),
    creation_reviewed_at TIMESTAMP
);

-- Team invites table
CREATE TABLE team_invites (
    invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP
);

-- Join requests table
CREATE TABLE join_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Milestone 40 (backend/migrations/1786251838274_add-pending-invite-join-request-unique-index.sql):
-- partial unique indexes so at most one PENDING invite/join-request can
-- exist per (team, email)/(team, user) at a time -- historical
-- accepted/rejected/revoked rows are unconstrained and can repeat.
CREATE UNIQUE INDEX idx_team_invites_pending_unique ON team_invites (team_id, email) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_join_requests_pending_unique ON join_requests (team_id, user_id) WHERE status = 'pending';

-- Milestone 49 (backend/migrations/1786462800000_add-daily-work-entries-and-submissions.sql):
-- raw multi-entry daily work log (many per user/team/day) feeding an
-- AI-drafted, user-confirmed final submission (at most one per
-- user/team/day, enforced the same way daily_logs' own M24
-- UNIQUE(user_id, log_date) is). Deliberately separate from daily_logs
-- (personal, single free-form entry, unchanged) -- see the migration's
-- own comment for why a new, team-scoped model was verified necessary
-- rather than assumed.
CREATE TABLE daily_work_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    entry_text VARCHAR(1000) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_work_submissions (
    submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    ai_summary TEXT,
    confirmed_summary VARCHAR(5000) NOT NULL,
    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id, work_date)
);

CREATE INDEX idx_daily_work_entries_user_team_date ON daily_work_entries(user_id, team_id, entry_date);
CREATE INDEX idx_daily_work_submissions_team_date ON daily_work_submissions(team_id, work_date);

-- Migration 1787000000000: notifications system. user_id CASCADEs (owned
-- by the recipient); entity-reference columns SET NULL on the referenced
-- row's deletion so a user's own notification history survives (they are
-- not owned by the team/project/goal/task/blocker they're about).
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

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_owner ON tasks(owner);
CREATE INDEX idx_blockers_team ON blockers(team_id);
CREATE INDEX idx_messages_blocker ON messages(blocker_id);
CREATE INDEX idx_goals_team ON goals(team_id);
CREATE INDEX idx_goals_parent ON goals(parent_goal_id);

-- Added by backend/migrations/1786004336567_add-updated-at-columns.sql and
-- 1786004376387_add-missing-indexes.sql (Milestone 3). This file documents
-- the schema for onboarding; backend/migrations/ is the actual source of
-- truth going forward -- run `npm run migrate:up` there, not this file, to
-- apply future schema changes.
CREATE INDEX idx_team_invites_email ON team_invites(email);
CREATE INDEX idx_team_invites_team ON team_invites(team_id);
CREATE INDEX idx_join_requests_team ON join_requests(team_id);
CREATE INDEX idx_projects_team ON projects(team_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_goals_created_by ON goals(created_by);
CREATE INDEX idx_daily_logs_log_date ON daily_logs(log_date);
CREATE INDEX idx_blockers_team_status ON blockers(team_id, status);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

-- Added by backend/migrations/1786005423769_add-auth-tables.sql (Milestone 4)
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Added by backend/migrations/1786050608547_add-tasks-created-by-index.sql (Milestone 10)
CREATE INDEX idx_tasks_created_by ON tasks(created_by);

-- Milestone 24's backend/migrations/1786134769436_add-daily-logs-unique-constraint.sql
-- added a UNIQUE(user_id, log_date) constraint here, but it was later
-- dropped by backend/migrations/1786600000000_allow-multiple-daily-logs.sql
-- (multiple daily log entries per user are intentional -- log_id
-- identifies each entry, log_date remains available for history/streaks/
-- reporting). This snapshot previously still had the since-removed
-- constraint, which made a CI database provisioned from this file (see
-- .github/workflows/ci.yml) reject a second same-day log with a stale
-- 409 that the real, migration-tracked database does not produce.
