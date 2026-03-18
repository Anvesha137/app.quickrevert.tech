-- Add contact_id to automation_activities for Identity Linking
ALTER TABLE public.automation_activities 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_automation_activities_contact_id ON public.automation_activities(contact_id);

-- Update contacts table
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'instagram';

-- Ensure interaction_count exists (it was in create script, but good to be safe)
-- ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 1;
