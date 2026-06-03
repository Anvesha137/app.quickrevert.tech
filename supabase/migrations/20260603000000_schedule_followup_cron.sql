-- Run every 1 minute. The edge function itself quickly checks if there is any work.
-- This keeps the routing logic in code_logic rather than splitting it with SQL jsonb paths.
SELECT cron.schedule(
  'send-lead-followups',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-quickrevert-internal', 'true'
    ),
    body := '{}'::jsonb
  );
  $$
);
