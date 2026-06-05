-- Add tracking flags to prevent duplicate expiry warning emails
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_3day BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_1day BOOLEAN DEFAULT FALSE;

-- Index for the daily cron query (fast lookup on active expiring subs)
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry_warnings
  ON subscriptions (status, current_period_end)
  WHERE status = 'active';
