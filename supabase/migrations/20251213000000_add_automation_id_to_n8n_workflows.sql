-- Add automation_id column to n8n_workflows table to link workflows with automations
ALTER TABLE public.n8n_workflows 
  ADD COLUMN IF NOT EXISTS automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_automation_id ON public.n8n_workflows(automation_id);
