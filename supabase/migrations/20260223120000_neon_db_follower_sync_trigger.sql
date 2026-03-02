-- Migration to add a Webhook Trigger for Neon DB Follower Sync
-- This trigger fires the sync-user-neon Edge Function whenever followers_count changes in instagram_accounts.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.sync_followers_to_neon()
RETURNS TRIGGER AS $$
DECLARE
  user_email text;
  req_id bigint;
BEGIN
  -- Only trigger if the followers_count changed
  IF NEW.followers_count IS DISTINCT FROM OLD.followers_count THEN
    
    -- Get user email from the auth.users table since public.users was split
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
    
    IF user_email IS NOT NULL THEN
      -- Prepare the URL and payload for the sync-user-neon edge function
      SELECT net.http_post(
        url := 'https://quickrevert.jiobase.com/functions/v1/sync-user-neon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud2lqaHFvcXZ3enRwYmFobGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTg1NjgsImV4cCI6MjA4MzE3NDU2OH0.XxljpvAbv1kR0yWdRBDimBCkvXG0fnmQ0g-e4kJcowY'
        ),
        body := jsonb_build_object(
          'userId', NEW.user_id,
          'email', user_email
        )
      ) INTO req_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_followers_to_neon ON public.instagram_accounts;

CREATE TRIGGER trigger_sync_followers_to_neon
AFTER UPDATE OF followers_count ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_followers_to_neon();
