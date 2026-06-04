-- ============================================================
-- Plan-Aware Monthly DM Reset
-- ONLY Basic (Free) plan users get their monthly_dms reset.
-- Gift Premium, Try Me Out, Premium, Professional → NEVER reset.
-- ============================================================

-- Step 1: Add plan_type column to user_limits (if not already present)
ALTER TABLE public.user_limits
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic';

-- Step 2: Backfill plan_type from Neon users table via the sync-user-neon edge function
-- (This will be populated automatically when users trigger DMs or when the admin updates them)
-- For now, default everything to 'basic' — the trigger below will handle future inserts.
-- Admin should manually set plan_type for existing premium users via:
--   UPDATE public.user_limits SET plan_type = 'premium' WHERE is_gifted = TRUE;
UPDATE public.user_limits SET plan_type = 'gift_premium' WHERE is_gifted = TRUE;

-- Step 3: Rebuild the trigger to be plan-aware
-- ONLY reset monthly_dms for plan_type IN ('basic', 'free')
-- All other plans (premium, gift_premium, try_me_out, professional) NEVER reset.
CREATE OR REPLACE FUNCTION public.increment_user_dm_count()
RETURNS TRIGGER AS $$
DECLARE
    current_limit_row public.user_limits%ROWTYPE;
    months_passed INT;
    should_reset BOOLEAN;
BEGIN
    IF NEW.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction') THEN

        SELECT * INTO current_limit_row FROM public.user_limits WHERE user_id = NEW.user_id;

        IF NOT FOUND THEN
            -- Brand-new user — default to basic, start counter
            INSERT INTO public.user_limits (user_id, total_dms, monthly_dms, dm_reset_date, plan_type)
            VALUES (NEW.user_id, 1, 1, CURRENT_TIMESTAMP, 'basic');
        ELSE
            -- Fallback if dm_reset_date is somehow null
            IF current_limit_row.dm_reset_date IS NULL THEN
                current_limit_row.dm_reset_date := CURRENT_TIMESTAMP;
                UPDATE public.user_limits SET dm_reset_date = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
            END IF;

            -- ✅ PLAN-AWARE RESET GUARD:
            -- Only Basic/Free plan users get monthly_dms reset when the cycle rolls over.
            -- Gift Premium, Try Me Out, Premium, Professional → monthly_dms keeps accumulating forever.
            should_reset := (
                LOWER(COALESCE(current_limit_row.plan_type, 'basic')) IN ('basic', 'free')
                AND CURRENT_TIMESTAMP >= current_limit_row.dm_reset_date + INTERVAL '1 month'
            );

            IF should_reset THEN
                -- Calculate how many full cycles have passed so dm_reset_date stays aligned
                months_passed := (
                    EXTRACT(year  FROM age(CURRENT_TIMESTAMP, current_limit_row.dm_reset_date)) * 12 +
                    EXTRACT(month FROM age(CURRENT_TIMESTAMP, current_limit_row.dm_reset_date))
                )::INT;

                UPDATE public.user_limits
                SET total_dms    = total_dms + 1,
                    monthly_dms  = 1,              -- reset to 1 (this DM is the first of new cycle)
                    dm_reset_date = current_limit_row.dm_reset_date + make_interval(months => months_passed)
                WHERE user_id = NEW.user_id;

            ELSE
                -- Same cycle, OR non-basic plan → just increment both counters
                UPDATE public.user_limits
                SET total_dms   = total_dms + 1,
                    monthly_dms = monthly_dms + 1
                WHERE user_id = NEW.user_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Comment confirming the plan_type values used in this system
-- plan_type values (set by admin or sync-user-neon):
--   'basic'        → Free plan (monthly_dms resets every cycle)
--   'free'         → Alias for basic (same behavior)
--   'premium'      → Paid premium (NO reset, ever)
--   'gift_premium' → Gifted premium (NO reset, ever)
--   'try_me_out'   → Trial plan (NO reset, ever)
--   'professional' → Pro plan (NO reset, ever)
