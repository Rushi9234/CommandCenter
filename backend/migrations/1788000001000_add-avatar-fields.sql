-- Avatar/Media Fields Migration
-- Adds avatar storage reference and metadata to users table

ALTER TABLE users ADD COLUMN avatar_key VARCHAR(500);
ALTER TABLE users ADD COLUMN avatar_mime_type VARCHAR(50);
ALTER TABLE users ADD COLUMN avatar_size INTEGER;
ALTER TABLE users ADD COLUMN avatar_width INTEGER;
ALTER TABLE users ADD COLUMN avatar_height INTEGER;
ALTER TABLE users ADD COLUMN avatar_uploaded_at TIMESTAMP;
