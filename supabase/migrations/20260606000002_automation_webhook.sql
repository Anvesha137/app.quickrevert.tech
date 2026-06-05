-- ============================================================
-- Webhook trigger for new automations
-- Sends a payload to the on-new-automation edge function
-- ============================================================

-- Drop if exists
DROP TRIGGER IF EXISTS trigger_on_new_automation ON public.automations;
DROP FUNCTION IF EXISTS public.webhook_on_new_automation();

-- Create the function
CREATE OR REPLACE FUNCTION public.webhook_on_new_automation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/on-new-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-quickrevert-internal', 'true'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER trigger_on_new_automation
  AFTER INSERT ON public.automations
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_on_new_automation();
