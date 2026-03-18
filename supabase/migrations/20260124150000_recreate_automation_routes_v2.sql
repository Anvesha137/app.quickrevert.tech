-- Recreate automation_routes table for n8n Platform Architecture (V2 - with sub_type)

DROP TABLE IF EXISTS public.automation_routes;

CREATE TABLE public.automation_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL, -- Meta ID
    event_type TEXT NOT NULL, -- e.g., 'messaging'
    sub_type TEXT,            -- e.g., 'message', 'postback' OR NULL (for wildcard)
    n8n_workflow_id TEXT NOT NULL, -- Specific n8n ID
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes (Updated for sub_type)
CREATE INDEX idx_automation_routes_lookup 
ON public.automation_routes (account_id, event_type, sub_type, is_active);

CREATE INDEX idx_automation_routes_user 
ON public.automation_routes (user_id);

-- RLS
ALTER TABLE public.automation_routes ENABLE ROW LEVEL SECURITY;

-- Service Role full access (Edge Functions)
CREATE POLICY "Service Role full access" 
ON public.automation_routes
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Authenticated users (Admins) can view/manage their own routes
CREATE POLICY "Users can manage own routes" 
ON public.automation_routes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
