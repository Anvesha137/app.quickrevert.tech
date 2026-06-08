-- Migration: Trial Abuse Prevention and Log Rotation

-- 1. Create table to store historical trials
CREATE TABLE IF NOT EXISTS public.historical_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    instagram_user_id TEXT,
    instagram_business_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_historical_trials_email ON public.historical_trials (email);

-- Secure it
ALTER TABLE public.historical_trials ENABLE ROW LEVEL SECURITY;

-- 2. Schedule the cleanup job for automation_execution_logs
-- Runs every day at midnight
SELECT cron.schedule(
  'sweep-execution-logs',
  '0 0 * * *',
  $$
  DELETE FROM public.automation_execution_logs WHERE created_at < NOW() - INTERVAL '15 days';
  $$
);
