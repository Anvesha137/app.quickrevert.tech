-- Fresh Supabase Schema for Instagram Automation Dashboard

-- Enable Row Level Security
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.automation_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Create user profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create automations table
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT CHECK (trigger_type IN ('post_comment', 'story_reply', 'user_directed_messages')) NOT NULL,
  trigger_config JSONB,
  actions JSONB NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'disabled')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_run TIMESTAMP WITH TIME ZONE
);

-- Create instagram_accounts table
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  instagram_user_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  profile_picture_url TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  page_id TEXT,
  status TEXT CHECK (status IN ('active', 'expired', 'revoked')) DEFAULT 'active',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create automation_activities table
CREATE TABLE IF NOT EXISTS public.automation_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  activity_data JSONB,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create promo_codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  usage_limit INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('active', 'inactive', 'expired')) DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security Policies
-- Profiles RLS
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Automations RLS
CREATE POLICY "Users can view own automations" ON public.automations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own automations" ON public.automations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own automations" ON public.automations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own automations" ON public.automations
  FOR DELETE USING (auth.uid() = user_id);

-- Instagram Accounts RLS
CREATE POLICY "Users can view own Instagram accounts" ON public.instagram_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Instagram accounts" ON public.instagram_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Instagram accounts" ON public.instagram_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Instagram accounts" ON public.instagram_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Automation Activities RLS
CREATE POLICY "Users can view own automation activities" ON public.automation_activities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own automation activities" ON public.automation_activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User Preferences RLS
CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Promo Codes RLS
CREATE POLICY "Users can view all promo codes" ON public.promo_codes
  FOR SELECT USING (status = 'active' AND (valid_until IS NULL OR valid_until > NOW()));

-- Functions for automatic timestamps
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers to tables
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automations_updated_at 
    BEFORE UPDATE ON public.automations 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_instagram_accounts_updated_at 
    BEFORE UPDATE ON public.instagram_accounts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at 
    BEFORE UPDATE ON public.user_preferences 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for auth tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_accounts;