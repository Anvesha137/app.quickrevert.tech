-- Migration to add discount_amount to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS discount_amount integer DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.discount_amount IS 'Total discount amount applied in rupees';
