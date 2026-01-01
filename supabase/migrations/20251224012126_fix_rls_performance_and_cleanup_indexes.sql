/*
  # Fix RLS Performance Issues and Remove Unused Indexes

  ## Performance Optimizations
  
  1. **Promo Codes RLS Policies**
     - Replace `auth.uid()` with `(select auth.uid())` in all policies
     - This prevents re-evaluation of auth function for each row
     - Significantly improves query performance at scale
  
  2. **Automation Activities RLS Policies**
     - Apply same optimization to prevent future performance issues
  
  ## Index Cleanup
  
  3. **Remove Unused Indexes**
     - Drop `idx_automation_activities_instagram_account_id` (not used)
     - Drop `idx_promo_codes_code` (redundant - UNIQUE constraint already creates index)
     - Drop `idx_promo_codes_status` (not used)
  
  ## Technical Details
  
  Using `(select auth.uid())` forces PostgreSQL to evaluate the function once
  and cache the result, rather than calling it for every row in the table.
  This is especially important for large tables with many rows.
  
  See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
*/

-- Drop and recreate promo_codes policies with optimized syntax
DROP POLICY IF EXISTS "Users can view their own promo codes" ON promo_codes;
DROP POLICY IF EXISTS "Users can create promo codes" ON promo_codes;
DROP POLICY IF EXISTS "Users can update their own promo codes" ON promo_codes;

CREATE POLICY "Users can view their own promo codes"
  ON promo_codes
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create promo codes"
  ON promo_codes
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own promo codes"
  ON promo_codes
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Drop and recreate automation_activities policies with optimized syntax
DROP POLICY IF EXISTS "Users can view own activities" ON automation_activities;
DROP POLICY IF EXISTS "Users can insert own activities" ON automation_activities;

CREATE POLICY "Users can view own activities"
  ON automation_activities
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own activities"
  ON automation_activities
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Remove unused indexes
DROP INDEX IF EXISTS idx_automation_activities_instagram_account_id;
DROP INDEX IF EXISTS idx_promo_codes_code;
DROP INDEX IF EXISTS idx_promo_codes_status;
