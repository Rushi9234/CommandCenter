-- Migration 1791000000000: Add Google/Microsoft OAuth and 6-digit Email OTP fields
ALTER TABLE users 
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS email_otp_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_otp_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER DEFAULT 0;

-- Indexes for fast OAuth lookup
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_microsoft_id ON users(microsoft_id) WHERE microsoft_id IS NOT NULL;
