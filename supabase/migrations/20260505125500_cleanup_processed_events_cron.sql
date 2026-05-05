-- Enable pg_cron extension (Supabase has this available)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup of processed_events older than 24 hours
-- Runs every day at 3:00 AM UTC (8:30 AM IST)
SELECT cron.schedule(
  'cleanup-processed-events',
  '0 3 * * *',
  $$DELETE FROM processed_events WHERE created_at < NOW() - INTERVAL '24 hours'$$
);
