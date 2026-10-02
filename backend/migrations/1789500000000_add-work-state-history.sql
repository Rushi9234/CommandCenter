-- Migration 1789500000000_add-work-state-history.sql
-- Task #6: Work-State / Progress History Foundation
-- Append-only audit log for real work artifact state transitions (tasks, goals, daily work, blockers).

CREATE TABLE IF NOT EXISTS work_state_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN ('task', 'goal', 'daily_work', 'blocker')),
    artifact_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    previous_state JSONB,
    new_state JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_state_history_team_created ON work_state_history(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_state_history_artifact ON work_state_history(artifact_type, artifact_id, created_at DESC);
