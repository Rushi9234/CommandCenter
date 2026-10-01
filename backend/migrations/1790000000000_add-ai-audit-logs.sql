-- Migration 1790000000000: Add AI Query Audit Logs Table
CREATE TABLE IF NOT EXISTS ai_query_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    intent_category VARCHAR(32) NOT NULL,
    scope_type VARCHAR(32),
    scope_id UUID,
    tools_called TEXT[],
    token_usage_input INT NOT NULL DEFAULT 0,
    token_usage_output INT NOT NULL DEFAULT 0,
    execution_time_ms INT NOT NULL DEFAULT 0,
    status_code INT NOT NULL DEFAULT 200,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_query_audit_user_date ON ai_query_audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_query_audit_scope ON ai_query_audit_logs(scope_type, scope_id);
