-- Add expiration_notified flag to track if we've sent the 55-day warning
ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS expiration_notified boolean DEFAULT false;

-- Add pg_cron and pg_net extensions if not already present
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the daily token refresh job (runs at midnight UTC)
SELECT cron.schedule(
    'daily-token-refresh',
    '0 0 * * *',
    $$
    SELECT net.http_post(
        url := 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/instagram-refresh-token',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
    $$
);
