/*
  # Fix Remaining RLS Performance and Security Issues

  ## 1. RLS Performance Optimizations
  
  ### Profiles Table (3 policies)
  - Replace `auth.uid()` with `(select auth.uid())` in:
    - "Users can view own profile" (SELECT)
    - "Users can update own profile" (UPDATE)
    - "Users can insert own profile" (INSERT)

  ### Automations Table (4 policies)
  - Replace `auth.uid()` with `(select auth.uid())` in:
    - "Users can view own automations" (SELECT)
    - "Users can create own automations" (INSERT)
    - "Users can update own automations" (UPDATE)
    - "Users can delete own automations" (DELETE)

  ### Instagram Accounts Table (4 policies)
  - Replace `auth.uid()` with `(select auth.uid())` in:
    - "Users can view their own Instagram accounts" (SELECT)
    - "Users can insert their own Instagram accounts" (INSERT)
    - "Users can update their own Instagram accounts" (UPDATE)
    - "Users can delete their own Instagram accounts" (DELETE)

  ## 2. Remove Unused Indexes
  
  The following indexes are not being used and should be dropped to improve write performance:
  - `idx_automations_status` - not used in queries
  - `idx_automations_trigger_type` - not used in queries
  - `idx_automation_activities_created_at` - not used in queries
  - `idx_automation_activities_automation_id` - not used in queries
  - `idx_automation_activities_status` - not used in queries
  - `idx_promo_codes_user_id` - not used in queries

  ## 3. Fix Function Security Issues
  
  ### Set Immutable Search Path for Functions
  - `handle_new_user()` - set search_path to prevent SQL injection
  - `update_updated_at_column()` - set search_path to prevent SQL injection

  Setting explicit search_path prevents security vulnerabilities where an attacker
  could create malicious functions in a user-controlled schema.

  ## Technical Notes
  
  - Using `(select auth.uid())` forces PostgreSQL to evaluate once per query instead of per row
  - This is critical for performance at scale (10,000+ rows)
  - See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
*/

-- =============================================
-- FIX PROFILES TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

-- =============================================
-- FIX AUTOMATIONS TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view own automations" ON automations;
DROP POLICY IF EXISTS "Users can create own automations" ON automations;
DROP POLICY IF EXISTS "Users can update own automations" ON automations;
DROP POLICY IF EXISTS "Users can delete own automations" ON automations;

CREATE POLICY "Users can view own automations"
  ON automations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create own automations"
  ON automations
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own automations"
  ON automations
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own automations"
  ON automations
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- =============================================
-- FIX INSTAGRAM ACCOUNTS TABLE RLS POLICIES
-- =============================================

DROP POLICY IF EXISTS "Users can view their own Instagram accounts" ON instagram_accounts;
DROP POLICY IF EXISTS "Users can insert their own Instagram accounts" ON instagram_accounts;
DROP POLICY IF EXISTS "Users can update their own Instagram accounts" ON instagram_accounts;
DROP POLICY IF EXISTS "Users can delete their own Instagram accounts" ON instagram_accounts;

CREATE POLICY "Users can view their own Instagram accounts"
  ON instagram_accounts
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own Instagram accounts"
  ON instagram_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own Instagram accounts"
  ON instagram_accounts
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own Instagram accounts"
  ON instagram_accounts
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- =============================================
-- REMOVE UNUSED INDEXES
-- =============================================

DROP INDEX IF EXISTS idx_automations_status;
DROP INDEX IF EXISTS idx_automations_trigger_type;
DROP INDEX IF EXISTS idx_automation_activities_created_at;
DROP INDEX IF EXISTS idx_automation_activities_automation_id;
DROP INDEX IF EXISTS idx_automation_activities_status;
DROP INDEX IF EXISTS idx_promo_codes_user_id;

-- =============================================
-- FIX FUNCTION SECURITY - SET IMMUTABLE SEARCH PATH
-- =============================================

-- Fix handle_new_user function with secure search_path
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Fix update_updated_at_column function with secure search_path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;