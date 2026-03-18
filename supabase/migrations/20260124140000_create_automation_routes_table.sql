-- Create automation_routes table for Meta Webhook Router

CREATE TABLE IF NOT EXISTS public.automation_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id TEXT NOT NULL, -- Meta ID (Page ID or IG Business ID)
    event_type TEXT NOT NULL, -- e.g., 'messaging', 'changes'
    sub_type TEXT,            -- e.g., 'message', 'postback', 'feed', 'mention' (Nullable)
    workflow_ref TEXT NOT NULL, -- The internal reference (e.g., URL or n8n ID)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_automation_routes_lookup 
ON public.automation_routes (account_id, event_type, is_active);

-- RLS Policies
ALTER TABLE public.automation_routes ENABLE ROW LEVEL SECURITY;

-- Service Role has full access
CREATE POLICY "Service Role full access" 
ON public.automation_routes
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Authenticated users (Admins) can manage routes
CREATE POLICY "Admins can manage routes" 
ON public.automation_routes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Anon users (Public) cannot access this table
-- The Edge Function uses SERVICE_ROLE_KEY to read this table.
