-- Create n8n_workflows table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.n8n_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  n8n_workflow_id TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'instagram_automation_v1',
  variables JSONB,
  n8n_workflow_name TEXT,
  webhook_path TEXT,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable row level security
ALTER TABLE public.n8n_workflows ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'n8n_workflows' AND policyname = 'Users can view own workflows'
  ) THEN
    CREATE POLICY "Users can view own workflows" ON public.n8n_workflows
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'n8n_workflows' AND policyname = 'Users can insert own workflows'
  ) THEN
    CREATE POLICY "Users can insert own workflows" ON public.n8n_workflows
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'n8n_workflows' AND policyname = 'Users can update own workflows'
  ) THEN
    CREATE POLICY "Users can update own workflows" ON public.n8n_workflows
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'n8n_workflows' AND policyname = 'Users can delete own workflows'
  ) THEN
    CREATE POLICY "Users can delete own workflows" ON public.n8n_workflows
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add missing columns if table already exists
ALTER TABLE public.n8n_workflows 
  ADD COLUMN IF NOT EXISTS n8n_workflow_name TEXT,
  ADD COLUMN IF NOT EXISTS webhook_path TEXT,
  ADD COLUMN IF NOT EXISTS instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_instagram_account_id ON public.n8n_workflows(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_user_id ON public.n8n_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_automation_id ON public.n8n_workflows(automation_id);

-- Add update trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_n8n_workflows_updated_at ON public.n8n_workflows;
CREATE TRIGGER update_n8n_workflows_updated_at 
    BEFORE UPDATE ON public.n8n_workflows 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();