-- Add n8n_workflows table
CREATE TABLE IF NOT EXISTS public.n8n_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  n8n_workflow_id TEXT NOT NULL,
  template TEXT NOT NULL,
  variables JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add row level security
ALTER TABLE public.n8n_workflows ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own workflows" ON public.n8n_workflows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workflows" ON public.n8n_workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows" ON public.n8n_workflows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows" ON public.n8n_workflows
  FOR DELETE USING (auth.uid() = user_id);

-- Add update trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_n8n_workflows_updated_at 
    BEFORE UPDATE ON public.n8n_workflows 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();