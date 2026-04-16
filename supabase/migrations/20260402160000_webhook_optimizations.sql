-- Phase 1: DB Tracking
-- Add is_subscribed and active_automations_count to instagram_accounts
ALTER TABLE public.instagram_accounts 
ADD COLUMN IF NOT EXISTS is_subscribed BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS active_automations_count INTEGER DEFAULT 0;

-- Create indexes for fast webhook gating
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_business_id
ON public.instagram_accounts(instagram_business_id);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_is_subscribed_active
ON public.instagram_accounts(is_subscribed, active_automations_count);

-- Phase 1: Trigger for active_automations_count
CREATE OR REPLACE FUNCTION public.update_active_automations_count()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_user_id := OLD.user_id;
    ELSE
        target_user_id := NEW.user_id;
    END IF;

    IF target_user_id IS NOT NULL THEN
        UPDATE public.instagram_accounts
        SET active_automations_count = (
            SELECT count(*) 
            FROM public.automations 
            WHERE user_id = target_user_id 
              AND status = 'active'
        )
        WHERE user_id = target_user_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_automation_status_change ON public.automations;

-- Create trigger on automations table
CREATE TRIGGER on_automation_status_change
AFTER INSERT OR UPDATE OF status, user_id OR DELETE ON public.automations
FOR EACH ROW EXECUTE FUNCTION public.update_active_automations_count();

-- Recalculate existing counts for all accounts to set baseline
UPDATE public.instagram_accounts ia
SET active_automations_count = (
    SELECT count(*) 
    FROM public.automations a 
    WHERE a.user_id = ia.user_id 
      AND a.status = 'active'
);

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Setup cron job for sweeping inactive webhooks every 15 minutes
-- NOTE: We use pg_net's http_post to securely invoke the Edge Function
-- Ensure you update the bearer token with your actual service role key in production
DO $do_block$
BEGIN
    -- Unschedule if exists to avoid duplicates (safely catch if it doesn't exist)
    BEGIN
        PERFORM cron.unschedule('sweep-inactive-webhooks-cron');
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Schedule the sweeper
    PERFORM cron.schedule(
        'sweep-inactive-webhooks-cron',
        '*/15 * * * *',
         $cron_cmd$ 
         SELECT net.http_post(
             url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1/sweep-inactive-webhooks',
             headers := jsonb_build_object(
                 'Authorization', current_setting('app.settings.service_role_key', true),
                 'Content-Type', 'application/json'
             )
         );
         $cron_cmd$
    );
END $do_block$;
