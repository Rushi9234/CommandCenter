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
    role VARCHAR(50) DEFAULT 'member',
    permissions JSONB DEFAULT '{"can_assign_tasks": false, "can_delete_tasks": false, "can_view_analytics": false, "can_view_individual_performance": false, "can_export_data": false, "can_manage_members": false, "can_manage_settings": false}',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
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
    completed_at TIMESTAMP
);

-- Team invites table
CREATE TABLE team_invites (
    invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Join requests table
CREATE TABLE join_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
