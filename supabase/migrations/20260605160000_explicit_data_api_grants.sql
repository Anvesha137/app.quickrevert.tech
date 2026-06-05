-- ============================================================
-- Explicit Data API grants for all public schema tables
-- (Ahead of Supabase Oct 30 2026 enforcement)
--
-- From Oct 30 2026, new tables won't be auto-exposed to the
-- Data API. Running explicit GRANTs now future-proofs the
-- project against that change.
-- ============================================================

-- Tables accessed read-only by supabase-js / PostgREST
GRANT SELECT ON public.user_limits TO anon, authenticated;
GRANT SELECT ON public.automation_activities TO anon, authenticated;
GRANT SELECT ON public.contacts TO anon, authenticated;
GRANT SELECT ON public.automations TO anon, authenticated;
GRANT SELECT ON public.instagram_accounts TO anon, authenticated;
GRANT SELECT ON public.n8n_workflows TO anon, authenticated;
GRANT SELECT ON public.subscriptions TO anon, authenticated;

-- user_limits also needs write access (triggers increment counters)
GRANT INSERT, UPDATE ON public.user_limits TO authenticated;
