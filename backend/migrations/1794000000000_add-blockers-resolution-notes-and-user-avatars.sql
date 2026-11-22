-- Migration 1794000000000: Add resolution_notes to blockers and persistent user_avatars storage
ALTER TABLE blockers ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

CREATE TABLE IF NOT EXISTS user_avatars (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    mime_type VARCHAR(64) NOT NULL,
    file_size INTEGER NOT NULL,
    image_data BYTEA NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_avatars_updated ON user_avatars(updated_at DESC);
