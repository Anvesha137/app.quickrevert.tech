/*
  # Create Leads Table for Internal Storage
  
  1. New Tables
    - `leads`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - The dashboard user who owns this lead
      - `instagram_username` (text)
      - `full_name` (text, nullable)
      - `email` (text, nullable)
      - `phone` (text, nullable)
      - `automation_id` (uuid, nullable)
      - `automation_name` (text) - Stored as string to persist after automation deletion
      - `created_at` (timestamptz)
      - `metadata` (jsonb)
      
  2. Security
    - Enable RLS
    - Policies for owner to view/insert
*/

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  instagram_username TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  automation_id UUID,
  automation_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own leads" ON public.leads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leads" ON public.leads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own leads" ON public.leads
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON public.leads 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
