-- Create processed_events table for Idempotency

CREATE TABLE IF NOT EXISTS public.processed_events (
    event_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

-- Service Role full access (Edge Functions)
CREATE POLICY "Service Role full access" 
ON public.processed_events
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- No public access
