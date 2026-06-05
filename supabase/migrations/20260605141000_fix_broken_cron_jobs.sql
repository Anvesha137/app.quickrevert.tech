-- ============================================================
-- Fix Broken Cron Jobs
--
-- Job 18 (send-lead-followups): ERROR "unrecognized configuration
--   parameter app.settings.supabase_url"
-- Job 8 (sweep-inactive-webhooks-cron): ERROR "null value in column url"
--   because app.settings.project_ref and service_role_key are null.
--
-- Fix: Hardcode the known Supabase URL and read the service_role_key
-- from the Supabase vault (supabase_functions.get_secret).
-- ============================================================

-- Step 1: Drop the broken jobs (use correct names, ignore if not found)
DO $$
BEGIN
  PERFORM cron.unschedule('send-lead-followups');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send-lead-followups not found, skipping';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sweep-inactive-webhooks-cron');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sweep-inactive-webhooks-cron not found, skipping';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-all-followers-every-2-days');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync-all-followers-every-2-days not found, skipping';
END $$;

-- Step 2: Recreate send-lead-followups with hardcoded URL + vault secret
SELECT cron.schedule(
  'send-lead-followups',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'x-quickrevert-internal', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Step 3: Recreate sweep-inactive-webhooks with hardcoded URL + vault secret
SELECT cron.schedule(
  'sweep-inactive-webhooks-cron',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/sweep-inactive-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Step 4: Recreate sync-all-followers with hardcoded URL + vault secret
SELECT cron.schedule(
  'sync-all-followers-every-2-days',
  '30 21 */2 * *',
  $$
  SELECT net.http_post(
    url := 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/sync-all-followers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'x-quickrevert-internal', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);
