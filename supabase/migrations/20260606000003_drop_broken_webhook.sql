-- Remove the broken trigger
DROP TRIGGER IF EXISTS trigger_on_new_automation ON public.automations;
DROP FUNCTION IF EXISTS public.webhook_on_new_automation();
