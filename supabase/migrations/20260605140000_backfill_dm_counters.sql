-- ============================================================
-- Backfill DM Counters After sync-user-neon Upsert Bug Fix
-- Root cause: sync-user-neon was calling upsert() without
--   total_dms/monthly_dms in the payload, causing Supabase
--   to reset those columns to their DEFAULT (0).
--
-- This migration recalculates both counters from the ground
-- truth (automation_activities) for ALL users.
--
-- Safe to re-run. Run AFTER deploying the sync-user-neon fix.
-- ============================================================

-- Step 1: Recalculate total_dms (all-time lifetime count)
-- from the canonical source — automation_activities.
UPDATE public.user_limits ul
SET total_dms = COALESCE((
    SELECT COUNT(*)
    FROM public.automation_activities aa
    WHERE aa.user_id = ul.user_id
      AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
), 0);

-- Step 2: Recalculate monthly_dms (current billing cycle only)
-- Uses dm_reset_date as the cycle start. Falls back to epoch
-- if dm_reset_date is somehow null (shouldn't happen after
-- the 20260603 migration, but safe to guard).
UPDATE public.user_limits ul
SET monthly_dms = COALESCE((
    SELECT COUNT(*)
    FROM public.automation_activities aa
    WHERE aa.user_id = ul.user_id
      AND aa.activity_type IN ('dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction')
      AND aa.created_at >= COALESCE(ul.dm_reset_date, '2020-01-01'::timestamptz)
), 0);

-- Step 3: Verification query — run this manually after the migration
-- to confirm all discrepancies are now 0.
-- SELECT ul.user_id,
--        ul.total_dms       AS stored_total,
--        COALESCE(aa.real_count, 0) AS real_total,
--        COALESCE(aa.real_count, 0) - ul.total_dms AS gap
-- FROM user_limits ul
-- LEFT JOIN (
--     SELECT user_id, COUNT(*) AS real_count
--     FROM automation_activities
--     WHERE activity_type IN ('dm','send_dm','incoming_message','incoming_event','interaction')
--     GROUP BY user_id
-- ) aa ON ul.user_id = aa.user_id
-- WHERE ABS(COALESCE(aa.real_count, 0) - ul.total_dms) > 5
-- ORDER BY gap DESC;
