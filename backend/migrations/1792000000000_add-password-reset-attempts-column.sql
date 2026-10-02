-- Migration 1792000000000: Add password_reset_attempts column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER DEFAULT 0;
