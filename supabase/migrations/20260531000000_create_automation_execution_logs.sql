-- ============================================================
-- Create automation_execution_logs table for code engine observability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automation_execution_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    automation_id UUID,
    automation_name TEXT,
    instagram_account_id UUID,
    trigger_type TEXT NOT NULL,           -- 'post_comment', 'user_dm', 'postback'
    event_id TEXT,                        -- links to processed_events for dedup tracing
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'partial', 'failed', 'no_match'
    steps JSONB DEFAULT '[]'::jsonb,     -- [{step, ok, duration_ms, error, detail}]
    duration_ms INTEGER,                  -- total execution time
    error_message TEXT,                   -- top-level crash error
    event_data JSONB,                    -- the original eventData (for retry)
    request_body JSONB,                  -- full request body (for retry)
    metadata JSONB DEFAULT '{}'::jsonb,  -- any extra context
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_exec_logs_user_id ON public.automation_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_exec_logs_status ON public.automation_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_exec_logs_created_at ON public.automation_execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_logs_automation_id ON public.automation_execution_logs(automation_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own execution logs
DROP POLICY IF EXISTS "Users can view own execution logs" ON public.automation_execution_logs;
CREATE POLICY "Users can view own execution logs"
    ON public.automation_execution_logs
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);
