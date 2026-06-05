-- ============================================================
-- Schedule send-expiry-warnings cron
-- Runs daily at 9:00 AM IST (03:30 UTC)
-- Sends 3-day and 1-day expiry warning emails to users
-- ============================================================

-- Remove if already exists (safe re-run)
SELECT cron.unschedule('send-expiry-warnings') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-expiry-warnings'
);

SELECT cron.schedule(
  'send-expiry-warnings',
  '30 3 * * *',  -- daily at 03:30 UTC (9:00 AM IST)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-expiry-warnings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-quickrevert-internal', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);
