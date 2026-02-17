-- Add user_email column to subscriptions table for better identification
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Index the email column for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email ON subscriptions(user_email);
