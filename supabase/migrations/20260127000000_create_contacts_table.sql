/*
  # Create Contacts Table

  1. New Tables
    - `contacts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - The dashboard user who owns this contact
      - `instagram_account_id` (uuid, references instagram_accounts) - The IG account this contact interacted with
      - `instagram_user_id` (text) - The IG ID of the contact (sender)
      - `username` (text)
      - `full_name` (text, nullable)
      - `avatar_url` (text, nullable)
      - `first_interaction_at` (timestamptz)
      - `last_interaction_at` (timestamptz)
      - `interaction_count` (integer)
      - `is_followed_by_us` (boolean)
      - `follows_us` (boolean)
      - `metadata` (jsonb)

  2. Security
    - Enable RLS
    - Policies for owner to view/update
*/

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
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to avoid duplicates per account
  UNIQUE(user_id, instagram_account_id, instagram_user_id)
);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_instagram_user_id ON public.contacts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_interaction_at ON public.contacts(last_interaction_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON public.contacts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
