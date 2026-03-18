-- Add new columns to contacts table
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS follows_us BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS interacted_automations TEXT[] DEFAULT '{}';

-- Index for follows_us
CREATE INDEX IF NOT EXISTS idx_contacts_follows_us ON public.contacts(follows_us);
