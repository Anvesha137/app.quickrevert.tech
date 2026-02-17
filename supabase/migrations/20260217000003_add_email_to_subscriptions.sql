-- Add user_email column to subscriptions table for better identification
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Index the email column for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email ON subscriptions(user_email);

-- Add email column to instagram_accounts table
ALTER TABLE instagram_accounts 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Index the email column in instagram_accounts
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_email ON instagram_accounts(email);

-- Backfill existing subscriptions with user emails
UPDATE subscriptions
SET user_email = au.email
FROM auth.users au
WHERE subscriptions.user_id = au.id
AND (subscriptions.user_email IS NULL OR subscriptions.user_email = '');

-- Backfill existing instagram_accounts with user emails
UPDATE instagram_accounts
SET email = au.email
FROM auth.users au
WHERE instagram_accounts.user_id = au.id
AND (instagram_accounts.email IS NULL OR instagram_accounts.email = '');
