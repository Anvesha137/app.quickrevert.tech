-- ============================================================
-- PERMANENT FIX: total_dms can NEVER decrease for any user.
--
-- Root cause: sync-user-neon's upsert() was resetting total_dms
-- to 0 whenever it ran (on every login). This trigger makes it
-- physically impossible for any UPDATE to lower total_dms —
-- protecting against bugs, manual mistakes, and future code changes.
-- ============================================================

-- Step 1: Add a BEFORE UPDATE trigger that clamps total_dms to
--         never go below the existing value.
--
-- ⚠️  IMPORTANT: We ONLY protect total_dms here, NOT monthly_dms.
--     monthly_dms is legitimately reset to 1 each billing cycle by
--     the increment_user_dm_count trigger — blocking that would break
--     the monthly limit system for basic/free plan users.
CREATE OR REPLACE FUNCTION public.guard_total_dms_from_decrease()
RETURNS TRIGGER AS $$
BEGIN
    -- total_dms is a lifetime counter — it must ONLY ever go up.
    -- If any UPDATE tries to lower it (bug, bad script, upsert mishap),
    -- silently keep the old value instead.
    IF NEW.total_dms < OLD.total_dms THEN
        NEW.total_dms := OLD.total_dms;
    END IF;
    -- monthly_dms is intentionally NOT guarded here — the billing cycle
    -- trigger (increment_user_dm_count) legitimately resets it to 1
    -- when a new monthly cycle begins for basic/free plan users.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_total_dms_decrease ON public.user_limits;
CREATE TRIGGER guard_total_dms_decrease
    BEFORE UPDATE ON public.user_limits
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_total_dms_from_decrease();

-- Step 2: Fix the backfill to NEVER decrease anyone's current counter.
-- Use GREATEST() so we only ever RAISE the counter, never lower it.
-- For users whose counter was wiped to 0, this sets them back to real count.
-- For users whose counter is already higher (correct), this leaves them alone.
UPDATE public.user_limits ul
SET total_dms = GREATEST(
    ul.total_dms,  -- keep current value if it's already higher
    COALESCE((
        SELECT COUNT(*)
        FROM public.automation_activities aa
        WHERE aa.user_id = ul.user_id
          AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
    ), 0)
);

-- Step 3: Same GREATEST protection for monthly_dms
UPDATE public.user_limits ul
SET monthly_dms = GREATEST(
    ul.monthly_dms,
    COALESCE((
        SELECT COUNT(*)
        FROM public.automation_activities aa
        WHERE aa.user_id = ul.user_id   
          AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
          AND aa.created_at >= COALESCE(ul.dm_reset_date, '2020-01-01'::timestamptz)
    ), 0)
);

-- Step 4: Also REVERT the dangerous backfill migration we ran earlier
-- (20260605140000_backfill_dm_counters.sql used plain UPDATE which
--  could decrease counters — Step 2 above already fixes this properly
--  using GREATEST, so no further action needed here beyond the trigger.)

-- ============================================================
-- VERIFICATION — run this after the migration:
-- All rows should have gap = 0 (no user's counter went down).
--
-- SELECT ul.user_id, ul.total_dms AS stored,
--        COALESCE(aa.real_count, 0) AS in_activities_table,
--        ul.total_dms - COALESCE(aa.real_count, 0) AS extra_historical_dms
-- FROM user_limits ul
-- LEFT JOIN (
--     SELECT user_id, COUNT(*) AS real_count
--     FROM automation_activities
--     WHERE activity_type IN ('dm','send_dm','incoming_message','incoming_event','interaction')
--     GROUP BY user_id
-- ) aa ON ul.user_id = aa.user_id
-- ORDER BY extra_historical_dms DESC;
-- ============================================================
