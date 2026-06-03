-- ============================================================
-- Phase 1: Monthly DM Limit Migration (Based on Join Date Cycle)
-- ============================================================

-- Step 1: Add columns
ALTER TABLE public.user_limits 
ADD COLUMN IF NOT EXISTS monthly_dms BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS dm_reset_date TIMESTAMPTZ;

-- Step 2: Initialize dm_reset_date to user's created_at date
UPDATE public.user_limits ul
SET dm_reset_date = (
    SELECT created_at FROM auth.users u WHERE u.id = ul.user_id
)
WHERE dm_reset_date IS NULL;

-- Step 3: Advance the dm_reset_date to the START of the current billing cycle
-- E.g., joined Jan 18, today is June 3 -> dm_reset_date becomes May 18
UPDATE public.user_limits
SET dm_reset_date = dm_reset_date + make_interval(
    months => (
        (EXTRACT(year FROM age(CURRENT_TIMESTAMP, dm_reset_date)) * 12) + 
        EXTRACT(month FROM age(CURRENT_TIMESTAMP, dm_reset_date))
    )::int
)
WHERE dm_reset_date IS NOT NULL 
  AND dm_reset_date + INTERVAL '1 month' <= CURRENT_TIMESTAMP;

-- Step 4: Backfill monthly_dms based ONLY on activity in the current cycle
UPDATE public.user_limits ul
SET monthly_dms = COALESCE((
    SELECT COUNT(*)
    FROM public.automation_activities aa
    WHERE aa.user_id = ul.user_id
      AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
      AND aa.created_at >= ul.dm_reset_date
), 0);

-- Step 5: Update the Trigger
CREATE OR REPLACE FUNCTION public.increment_user_dm_count()
RETURNS TRIGGER AS $$
DECLARE
    current_limit_row public.user_limits%ROWTYPE;
    months_passed INT;
BEGIN
    IF NEW.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction') THEN
        
        SELECT * INTO current_limit_row FROM public.user_limits WHERE user_id = NEW.user_id;

        IF NOT FOUND THEN
            INSERT INTO public.user_limits (user_id, total_dms, monthly_dms, dm_reset_date)
            VALUES (NEW.user_id, 1, 1, CURRENT_TIMESTAMP);
        ELSE
            -- Fallback if dm_reset_date is somehow null
            IF current_limit_row.dm_reset_date IS NULL THEN
                current_limit_row.dm_reset_date := CURRENT_TIMESTAMP;
                UPDATE public.user_limits SET dm_reset_date = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
            END IF;

            -- Check if we've crossed the 1-month cycle threshold
            IF CURRENT_TIMESTAMP >= current_limit_row.dm_reset_date + INTERVAL '1 month' THEN
                -- Calculate how many cycles have passed so we can advance the reset_date properly
                months_passed := (EXTRACT(year FROM age(CURRENT_TIMESTAMP, current_limit_row.dm_reset_date)) * 12) + 
                                  EXTRACT(month FROM age(CURRENT_TIMESTAMP, current_limit_row.dm_reset_date));
                                  
                UPDATE public.user_limits 
                SET total_dms = total_dms + 1,
                    monthly_dms = 1,
                    dm_reset_date = current_limit_row.dm_reset_date + make_interval(months => months_passed)
                WHERE user_id = NEW.user_id;
            ELSE
                -- Still in the same cycle
                UPDATE public.user_limits 
                SET total_dms = total_dms + 1,
                    monthly_dms = monthly_dms + 1
                WHERE user_id = NEW.user_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
