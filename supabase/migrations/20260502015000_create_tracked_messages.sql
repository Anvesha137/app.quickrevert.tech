-- Migration: Create tracked_messages table (Robust Version)
-- Description: Similar to tracked_payloads, this table allows exclusive routing for plain-text DM keywords.

CREATE TABLE IF NOT EXISTS public.tracked_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    n8n_workflow_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure all required columns exist (Safe for existing tables)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tracked_messages' AND column_name='message') THEN
        ALTER TABLE public.tracked_messages ADD COLUMN message TEXT NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tracked_messages' AND column_name='automation_id') THEN
        ALTER TABLE public.tracked_messages ADD COLUMN automation_id UUID REFERENCES public.automations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tracked_messages' AND column_name='account_id') THEN
        ALTER TABLE public.tracked_messages ADD COLUMN account_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tracked_messages' AND column_name='webhook_path') THEN
        ALTER TABLE public.tracked_messages ADD COLUMN webhook_path TEXT;
    END IF;
END $$;

-- Fix constraint if account_id was added without NOT NULL
ALTER TABLE public.tracked_messages ALTER COLUMN account_id SET NOT NULL;

-- Index for fast lookup in webhook-meta
CREATE INDEX IF NOT EXISTS idx_tracked_messages_lookup ON public.tracked_messages(message, account_id);
-- Index for cleanup during workflow updates
CREATE INDEX IF NOT EXISTS idx_tracked_messages_workflow ON public.tracked_messages(n8n_workflow_id);

COMMENT ON TABLE public.tracked_messages IS 'Stores plain-text keywords for exclusive DM automation routing';
