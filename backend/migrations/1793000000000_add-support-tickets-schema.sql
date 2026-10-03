-- Migration 1793000000000: Add Support Ticket System & Admin Dashboard Schema
-- Additive, safe migration to create and extend feedback functionality into a full Support Ticketing System

-- 1. Create Base feedback_reports Table (If Not Exists)
CREATE TABLE IF NOT EXISTS feedback_reports (
  reference_id VARCHAR(32) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  report_type VARCHAR(32) NOT NULL CHECK (report_type IN ('bug', 'complaint', 'feature', 'suggestion', 'support', 'other')),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  affected_page VARCHAR(255),
  expected_behavior TEXT,
  actual_behavior TEXT,
  severity VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  contact_preference VARCHAR(16) NOT NULL DEFAULT 'email' CHECK (contact_preference IN ('email', 'in_app', 'none')),
  attachment_url VARCHAR(500),
  status VARCHAR(32) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'in_progress', 'waiting_for_user', 'resolved', 'reopened', 'closed')),
  user_name VARCHAR(255),
  user_email VARCHAR(255),
  delivery_status VARCHAR(32) DEFAULT 'saved_locally',
  assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Extend feedback_reports Table (Safely add columns if base table existed previously)
ALTER TABLE feedback_reports
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

-- Add updated status check constraint supporting full state machine
ALTER TABLE feedback_reports
  DROP CONSTRAINT IF EXISTS feedback_reports_status_check;

ALTER TABLE feedback_reports
  ADD CONSTRAINT feedback_reports_status_check
  CHECK (status IN ('submitted', 'under_review', 'in_progress', 'waiting_for_user', 'resolved', 'reopened', 'closed'));

CREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_assigned ON feedback_reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_user ON feedback_reports(user_id);

-- 3. Create feedback_messages Table (Conversation Threads & Internal Notes)
CREATE TABLE IF NOT EXISTS feedback_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id VARCHAR(32) NOT NULL REFERENCES feedback_reports(reference_id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('user', 'support', 'system')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_ref ON feedback_messages(reference_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_internal ON feedback_messages(reference_id, is_internal);

-- 4. Create feedback_attachments Table (PostgreSQL BYTEA Storage)
CREATE TABLE IF NOT EXISTS feedback_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id VARCHAR(32) NOT NULL REFERENCES feedback_reports(reference_id) ON DELETE CASCADE,
  message_id UUID REFERENCES feedback_messages(message_id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size <= 5242880), -- Max 5 MB limit
  file_data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_ref ON feedback_attachments(reference_id);
CREATE INDEX IF NOT EXISTS idx_feedback_attachments_msg ON feedback_attachments(message_id);

-- 5. Create feedback_audit_logs Table (Comprehensive Audit History)
CREATE TABLE IF NOT EXISTS feedback_audit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id VARCHAR(32) NOT NULL REFERENCES feedback_reports(reference_id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  previous_status VARCHAR(32),
  new_status VARCHAR(32) NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_audit_ref ON feedback_audit_logs(reference_id, created_at DESC);
