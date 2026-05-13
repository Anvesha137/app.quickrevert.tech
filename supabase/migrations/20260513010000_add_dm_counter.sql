-- ============================================================
-- Phase 1: DM Counter Migration
-- Adds total_dms running counter to user_limits table.
-- Zero risk — only adds a column and a trigger.
-- Existing users are backfilled from current real data.
-- ============================================================

-- Step 1: Add the counter column (safe to run even if re-run)
ALTER TABLE public.user_limits 
ADD COLUMN IF NOT EXISTS total_dms BIGINT NOT NULL DEFAULT 0;

-- Step 2: Backfill all existing users with their REAL current DM count
-- Reads automation_activities ONCE here as a migration (not on every request)
UPDATE public.user_limits ul
SET total_dms = COALESCE((
    SELECT COUNT(*)
    FROM public.automation_activities aa
    WHERE aa.user_id = ul.user_id
      AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
), 0);

-- Step 3: Create the trigger function that auto-increments on every new DM row
CREATE OR REPLACE FUNCTION public.increment_user_dm_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Only count DM-type activities (same types as limit enforcement)
    IF NEW.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction') THEN
        INSERT INTO public.user_limits (user_id, total_dms)
        VALUES (NEW.user_id, 1)
        ON CONFLICT (user_id)
        DO UPDATE SET total_dms = public.user_limits.total_dms + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Attach trigger to automation_activities table
DROP TRIGGER IF EXISTS on_automation_activity_dm_count ON public.automation_activities;
CREATE TRIGGER on_automation_activity_dm_count
    AFTER INSERT ON public.automation_activities
    FOR EACH ROW EXECUTE FUNCTION public.increment_user_dm_count();
