-- ============================================================
-- Schedule sync-all-followers cron (replaces n8n Schedule Trigger)
-- Runs every 2 days at 3:00 AM IST (21:30 UTC previous day)
-- This replaces the n8n analytics workflow that ran every 2 days
-- ============================================================

SELECT cron.schedule(
  'sync-all-followers-every-2-days',
  '30 21 */2 * *',  -- every 2 days at 21:30 UTC (3:00 AM IST)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-all-followers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-quickrevert-internal', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Also ensure all existing users have use_code_logic = true
-- (removes any last n8n-routed users)
UPDATE public.user_limits
SET use_code_logic = true
WHERE use_code_logic IS NULL OR use_code_logic = false;
