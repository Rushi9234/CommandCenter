-- Up Migration
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE notifications DROP COLUMN IF EXISTS conversation_id;
