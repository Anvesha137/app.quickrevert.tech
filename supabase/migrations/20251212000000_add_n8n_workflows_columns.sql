-- Add missing columns to n8n_workflows table
ALTER TABLE public.n8n_workflows 
  ADD COLUMN IF NOT EXISTS n8n_workflow_name TEXT,
  ADD COLUMN IF NOT EXISTS webhook_path TEXT,
  ADD COLUMN IF NOT EXISTS instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_instagram_account_id ON public.n8n_workflows(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_user_id ON public.n8n_workflows(user_id);
