-- ============================================================
-- Safe Aggregate Function: get_aggregate_total_dms()
--
-- Returns ONLY the platform-wide SUM of total_dms.
-- Callable with the public anon key via REST API:
--   POST /rest/v1/rpc/get_aggregate_total_dms
--
-- This means the admin dashboard does NOT need the
-- service_role key to get this number — the anon key
-- (already public in the frontend) is enough.
--
-- Security properties:
--   - Returns a single integer (no user data, no PII)
--   - SECURITY DEFINER so it can read user_limits
--     without each caller needing table access
--   - search_path locked to public to prevent injection
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_aggregate_total_dms()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(total_dms), 0)::BIGINT
    FROM public.user_limits;
$$;

-- Grant execute to anon (public, no auth required)
-- Safe because it returns only one aggregate number.
GRANT EXECUTE ON FUNCTION public.get_aggregate_total_dms() TO anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_total_dms() TO authenticated;
