-- Migration 1790100000000: Add AI Conversation Sessions Table
CREATE TABLE IF NOT EXISTS ai_conversation_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    scope_type VARCHAR(32) NOT NULL,
    scope_id UUID,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial Unique Index for Non-Null Scopes (team, class, project)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversation_user_scope_id 
ON ai_conversation_sessions(user_id, scope_type, scope_id) 
WHERE scope_id IS NOT NULL;

-- Partial Unique Index for Null Scopes (global, personal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversation_user_scope_null 
ON ai_conversation_sessions(user_id, scope_type) 
WHERE scope_id IS NULL;
