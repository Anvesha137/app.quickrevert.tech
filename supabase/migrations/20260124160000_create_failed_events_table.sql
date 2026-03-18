-- Create failed_events table for Dead Letter Queue (DLQ)

CREATE TABLE IF NOT EXISTS public.failed_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id TEXT, -- Optional, if we have it
    payload JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for querying recent failures
CREATE INDEX idx_failed_events_created_at ON public.failed_events(created_at DESC);

-- RLS
ALTER TABLE public.failed_events ENABLE ROW LEVEL SECURITY;

-- Service Role full access (Edge Functions)
CREATE POLICY "Service Role full access" 
ON public.failed_events
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- No public access
