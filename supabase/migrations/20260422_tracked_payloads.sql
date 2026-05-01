-- Migration: tracked_payloads table
-- Purpose: Map postback payload strings → specific n8n workflow IDs so that
-- webhook-meta fires ONLY the one workflow that sent the button, instead of
-- waking up every active workflow and relying on the n8n ownership guard.

CREATE TABLE IF NOT EXISTS public.tracked_payloads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payload TEXT NOT NULL,
    n8n_workflow_id TEXT NOT NULL,
    automation_id UUID REFERENCES public.automations(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,  -- Meta Instagram Business ID (same as automation_routes.account_id)
    webhook_path TEXT,         -- Specific webhook path for this payload
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fast lookup: payload + account_id is what webhook-meta will query on every postback
CREATE INDEX IF NOT EXISTS idx_tracked_payloads_lookup ON public.tracked_payloads(payload, account_id);
-- Cleanup index: delete all payloads for a workflow when it's recreated
CREATE INDEX IF NOT EXISTS idx_tracked_payloads_workflow ON public.tracked_payloads(n8n_workflow_id);
