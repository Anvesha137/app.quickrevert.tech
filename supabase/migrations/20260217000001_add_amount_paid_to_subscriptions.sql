-- Migration to add amount_paid to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS amount_paid integer DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.amount_paid IS 'Total amount paid for this period in paise (INR)';
