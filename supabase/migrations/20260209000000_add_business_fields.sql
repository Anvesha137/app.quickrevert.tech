-- Migration to add Instagram Business specific fields
ALTER TABLE public.instagram_accounts 
ADD COLUMN IF NOT EXISTS instagram_business_id text,
ADD COLUMN IF NOT EXISTS page_access_token text;

-- Optional: Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_business_id ON public.instagram_accounts(instagram_business_id);
