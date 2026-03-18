-- Add account_id to processed_events and failed_events for Rate Limiting and improved querying

-- processed_events
ALTER TABLE public.processed_events ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_processed_events_account_timestamp ON public.processed_events(account_id, created_at DESC);

-- failed_events
ALTER TABLE public.failed_events ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_failed_events_account_timestamp ON public.failed_events(account_id, created_at DESC);
