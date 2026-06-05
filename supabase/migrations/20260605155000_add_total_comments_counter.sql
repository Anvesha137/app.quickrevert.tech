-- ============================================================
-- Total Comments Counter (mirrors the total_dms pattern)
--
-- Adds total_comments to user_limits — a forever-growing
-- counter incremented by a trigger on every comment/reply
-- inserted into automation_activities.
--
-- Also adds the guard trigger so total_comments can NEVER
-- decrease (same protection as total_dms).
-- ============================================================

-- Step 1: Add total_comments column (safe, idempotent)
ALTER TABLE public.user_limits
ADD COLUMN IF NOT EXISTS total_comments BIGINT NOT NULL DEFAULT 0;

-- Step 2: Backfill from automation_activities (use GREATEST
--         so existing counters are never lowered)
UPDATE public.user_limits ul
SET total_comments = GREATEST(
    ul.total_comments,
    COALESCE((
        SELECT COUNT(*)
        FROM public.automation_activities aa
        WHERE aa.user_id = ul.user_id
          AND aa.activity_type IN ('comment', 'reply', 'incoming_comment', 'comment_reply')
    ), 0)
);

-- Step 3: Trigger function to auto-increment on new comment rows
CREATE OR REPLACE FUNCTION public.increment_user_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.activity_type IN ('comment', 'reply', 'incoming_comment', 'comment_reply') THEN
        INSERT INTO public.user_limits (user_id, total_comments)
        VALUES (NEW.user_id, 1)
        ON CONFLICT (user_id)
        DO UPDATE SET total_comments = public.user_limits.total_comments + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Attach trigger to automation_activities
DROP TRIGGER IF EXISTS on_automation_activity_comment_count ON public.automation_activities;
CREATE TRIGGER on_automation_activity_comment_count
    AFTER INSERT ON public.automation_activities
    FOR EACH ROW EXECUTE FUNCTION public.increment_user_comment_count();

-- Step 5: Extend the guard trigger to also protect total_comments
CREATE OR REPLACE FUNCTION public.guard_total_dms_from_decrease()
RETURNS TRIGGER AS $$
BEGIN
    -- total_dms: lifetime DM counter — can ONLY go up
    IF NEW.total_dms < OLD.total_dms THEN
        NEW.total_dms := OLD.total_dms;
    END IF;
    -- total_comments: lifetime comment counter — can ONLY go up
    IF NEW.total_comments < OLD.total_comments THEN
        NEW.total_comments := OLD.total_comments;
    END IF;
    -- monthly_dms is intentionally NOT guarded — the billing cycle
    -- trigger legitimately resets it for basic/free plan users.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (trigger guard_total_dms_decrease already exists on user_limits —
--  replacing the function above is enough, no need to recreate the trigger)

-- Step 6: Also expose total_comments as a safe aggregate RPC
CREATE OR REPLACE FUNCTION public.get_aggregate_total_comments()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(total_comments), 0)::BIGINT
    FROM public.user_limits;
$$;

GRANT EXECUTE ON FUNCTION public.get_aggregate_total_comments() TO anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_total_comments() TO authenticated;
