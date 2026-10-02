-- Phase 1: Core Profile Fields Migration
-- Adds basic profile data fields to users table (bio, pronouns, location, visibility flag)

ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN pronouns VARCHAR(50);
ALTER TABLE users ADD COLUMN location VARCHAR(100);
ALTER TABLE users ADD COLUMN is_profile_public BOOLEAN DEFAULT false;
