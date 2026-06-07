-- Migration: Add email unsubscribe columns to Neon users table
-- Feature: Email unsubscribe flow (DPDP / CAN-SPAM compliance)
-- Created: 2026-06-08

-- email_unsubscribed: set to TRUE when user clicks the unsubscribe link in any email
-- unsubscribe_token:  deprecated field kept for reference; token is now generated on-the-fly via HMAC

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unsubscribed_at    TIMESTAMP WITH TIME ZONE;

-- Index for fast opt-out lookups (called before every email send)
CREATE INDEX IF NOT EXISTS idx_users_email_unsubscribed
  ON users (email)
  WHERE email_unsubscribed = TRUE;

-- Comment for clarity
COMMENT ON COLUMN users.email_unsubscribed IS
  'Set to TRUE when the user clicks the unsubscribe link in any QuickRevert email. sendEmail() checks this before sending.';
COMMENT ON COLUMN users.unsubscribed_at IS
  'Timestamp of when the user unsubscribed (UTC). Set automatically by the unsubscribe edge function trigger or app logic.';
