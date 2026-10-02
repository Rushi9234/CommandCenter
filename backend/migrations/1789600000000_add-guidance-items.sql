-- Migration 1789600000000_add-guidance-items.sql
-- Target #2: Guidance & Coordination Loop Foundation

CREATE TABLE IF NOT EXISTS guidance_items (
  guidance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('task', 'goal', 'blocker')),
  context_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guidance_team_id ON guidance_items(team_id);
CREATE INDEX IF NOT EXISTS idx_guidance_context ON guidance_items(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_guidance_recipient ON guidance_items(recipient_id);
CREATE INDEX IF NOT EXISTS idx_guidance_author ON guidance_items(author_id);
CREATE INDEX IF NOT EXISTS idx_guidance_status ON guidance_items(status);
