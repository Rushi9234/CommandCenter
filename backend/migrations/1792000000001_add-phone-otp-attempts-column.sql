-- Migration 1792000000001: Add missing phone_otp_attempts column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS phone_otp_attempts INTEGER DEFAULT 0;
