-- Migration: Add webhook_path to tracked_payloads
-- Description: Adds the missing webhook_path column to the tracked_payloads table for targeted routing.

ALTER TABLE public.tracked_payloads 
ADD COLUMN IF NOT EXISTS webhook_path TEXT;

-- Data Sync: Populate webhook_path for existing records from n8n_workflows
UPDATE public.tracked_payloads tp
SET webhook_path = nw.webhook_path
FROM public.n8n_workflows nw
WHERE tp.n8n_workflow_id = nw.n8n_workflow_id
AND tp.webhook_path IS NULL;

-- Add a comment for clarity
COMMENT ON COLUMN public.tracked_payloads.webhook_path IS 'Specific webhook path for this payload to allow targeted triggering';
