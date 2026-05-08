-- Add custom_data and custom_label columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS custom_data TEXT,
ADD COLUMN IF NOT EXISTS custom_label TEXT;
