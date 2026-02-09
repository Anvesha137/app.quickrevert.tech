-- Consolidated Migration for Instagram Dashboard
-- Includes 9 tables + processed_events/failed_events (wait, 9 tables total mentioned)
-- 1. profiles
-- 2. instagram_accounts
-- 3. contacts
-- 4. automations
-- 5. automation_activities
-- 6. automation_routes
-- 7. n8n_workflows
-- 8. processed_events
-- 9. failed_events

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shared utility function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-------------------------------------------------------------------------------
-- 1. Table: profiles
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-------------------------------------------------------------------------------
-- 2. Table: instagram_accounts
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  profile_picture_url text,
  page_id text, -- Added column
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, instagram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON public.instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON public.instagram_accounts(status);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Instagram accounts" ON public.instagram_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram accounts" ON public.instagram_accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Instagram accounts" ON public.instagram_accounts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Instagram accounts" ON public.instagram_accounts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 3. Table: contacts
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE CASCADE NOT NULL,
  instagram_user_id TEXT NOT NULL,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  first_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  interaction_count INTEGER DEFAULT 1,
  platform TEXT DEFAULT 'instagram', -- Added column
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, instagram_account_id, instagram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_instagram_user_id ON public.contacts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_interaction_at ON public.contacts(last_interaction_at DESC);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON public.contacts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 4. Table: automations
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('post_comment', 'story_reply', 'user_directed_messages')),
  actions jsonb DEFAULT '[]'::jsonb,
  trigger_config jsonb DEFAULT '{}'::jsonb, -- Added column
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_user_id ON public.automations(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_status ON public.automations(status);
CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON public.automations(trigger_type);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automations" ON public.automations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own automations" ON public.automations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own automations" ON public.automations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own automations" ON public.automations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 5. Table: automation_activities
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  instagram_account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  target_username text NOT NULL,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL, -- Added column
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_activities_user_id ON public.automation_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_activities_created_at ON public.automation_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_activities_automation_id ON public.automation_activities(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_activities_status ON public.automation_activities(status);
CREATE INDEX IF NOT EXISTS idx_automation_activities_contact_id ON public.automation_activities(contact_id);

ALTER TABLE public.automation_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automations activities" ON public.automation_activities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own automations activities" ON public.automation_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-------------------------------------------------------------------------------
-- 6. Table: automation_routes (V2)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL, -- Meta ID
    event_type TEXT NOT NULL, -- e.g., 'messaging'
    sub_type TEXT,            -- e.g., 'message', 'postback' OR NULL (for wildcard)
    n8n_workflow_id TEXT NOT NULL, -- Specific n8n ID
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_routes_lookup 
ON public.automation_routes (account_id, event_type, sub_type, is_active);

CREATE INDEX IF NOT EXISTS idx_automation_routes_user 
ON public.automation_routes (user_id);

ALTER TABLE public.automation_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role full access routes" 
ON public.automation_routes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage own routes" 
ON public.automation_routes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-------------------------------------------------------------------------------
-- 7. Table: n8n_workflows
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.n8n_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  n8n_workflow_id TEXT NOT NULL,
  template TEXT NOT NULL,
  variables JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.n8n_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workflows" ON public.n8n_workflows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workflows" ON public.n8n_workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows" ON public.n8n_workflows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows" ON public.n8n_workflows
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_n8n_workflows_updated_at 
    BEFORE UPDATE ON public.n8n_workflows 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 8. Table: processed_events
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processed_events (
    event_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role full access processed_events" 
ON public.processed_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-------------------------------------------------------------------------------
-- 9. Table: failed_events
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.failed_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id TEXT, 
    payload JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_failed_events_created_at ON public.failed_events(created_at DESC);

ALTER TABLE public.failed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role full access failed_events" 
ON public.failed_events FOR ALL TO service_role USING (true) WITH CHECK (true);
