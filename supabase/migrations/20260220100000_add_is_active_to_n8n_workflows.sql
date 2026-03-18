-- Add is_active column to n8n_workflows table
ALTER TABLE public.n8n_workflows 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing rows to have is_active = true
UPDATE public.n8n_workflows SET is_active = true WHERE is_active IS NULL;
