-- Up Migration
-- Milestone 4: rebuilt authentication needs a refresh-token store and a
-- password-reset flow that doesn't exist yet. verification_token already
-- exists on users; from this milestone forward it stores a SHA-256 hash of
-- the raw token (never the raw token itself), and now has an expiry --
-- previously verification tokens never expired at all.

ALTER TABLE users ADD COLUMN verification_token_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP;

CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Down Migration

DROP INDEX IF EXISTS idx_refresh_tokens_hash;
DROP INDEX IF EXISTS idx_refresh_tokens_user;
DROP TABLE IF EXISTS refresh_tokens;

ALTER TABLE users DROP COLUMN IF EXISTS password_reset_expires;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token_hash;
ALTER TABLE users DROP COLUMN IF EXISTS verification_token_expires;
