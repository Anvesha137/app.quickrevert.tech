-- Add unique constraint to n8n_workflow_id to support in-place 'upsert' updates
-- This ensures that only one n8n_workflow record exists per unique n8n_workflow_id (global) or per automation.
-- Usually n8n_workflow_id is globally unique across n8n, so this is the correct column for onConflict.

BEGIN;

-- Check if constraint already exists (just in case)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'n8n_workflows_n8n_workflow_id_key'
    ) THEN
        ALTER TABLE public.n8n_workflows 
        ADD CONSTRAINT n8n_workflows_n8n_workflow_id_key UNIQUE (n8n_workflow_id);
    END IF;
END $$;

COMMIT;
