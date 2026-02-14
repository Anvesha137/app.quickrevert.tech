
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS initial_followers_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS followers_last_updated TIMESTAMPTZ;

-- Function to handle initial followers count
CREATE OR REPLACE FUNCTION handle_initial_followers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.followers_count IS NOT NULL AND (OLD.initial_followers_count IS NULL OR OLD.initial_followers_count = 0) THEN
        NEW.initial_followers_count := NEW.followers_count;
    END IF;
    NEW.followers_last_updated := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before update
DROP TRIGGER IF EXISTS set_initial_followers ON instagram_accounts;
CREATE TRIGGER set_initial_followers
BEFORE UPDATE ON instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION handle_initial_followers();
