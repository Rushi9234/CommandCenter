-- Profile Phase 4 (Step 1): Email-change verification and phone verification columns
-- Per PROFILE_PHASE4_EMAIL_PHONE_VERIFICATION_AUDIT.md section 6.2. All columns
-- nullable/additive -- no backfill needed, no impact on existing rows.
--
-- Email-change verification (distinct from signup's existing is_verified /
-- verification_token -- those columns are untouched and keep their exact
-- existing meaning). Single-pending-slot design: pending_email is the target
-- address, cleared on successful verification or superseded by a new request.
ALTER TABLE users ADD COLUMN pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_expires TIMESTAMP;
-- Session-invalidation timestamp, checked by authenticate() the same way
-- password_changed_at already is -- not implemented in this slice.
ALTER TABLE users ADD COLUMN email_changed_at TIMESTAMP;

-- Phone verification. Deliberately separate from is_verified (signup-account
-- verification is an unrelated concept) and deliberately NOT unique (shared
-- family numbers are legitimate; phone is not a login identifier).
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN phone_otp_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN phone_otp_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN phone_otp_attempts INTEGER DEFAULT 0;
