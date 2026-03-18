-- Add missing columns to subscriptions table used by verify-razorpay-payment
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
ADD COLUMN IF NOT EXISTS coupon_code TEXT;

COMMENT ON COLUMN public.subscriptions.instagram_handle IS 'Instagram handle linked to this subscription';
COMMENT ON COLUMN public.subscriptions.coupon_code IS 'Promo/coupon code used during this subscription purchase';
