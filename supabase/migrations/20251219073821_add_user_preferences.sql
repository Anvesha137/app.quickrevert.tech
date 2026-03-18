/*
  # Add User Preferences
  
  1. Changes
    - Add `color_palette` and `display_name` columns to `profiles` table
    - Create `delete_user_account` function for safe account deletion
  
  2. Security
    - Only authenticated users can delete their own account
    - Cascading deletes handled for all related data
*/

-- Add color_palette and display_name columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'color_palette'
  ) THEN
    ALTER TABLE profiles ADD COLUMN color_palette text DEFAULT 'default';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN display_name text;
  END IF;
END $$;

-- Create function to safely delete user account
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all user's automations (cascades to automation_activities)
  DELETE FROM automations WHERE user_id = auth.uid();
  
  -- Delete user's instagram accounts
  DELETE FROM instagram_accounts WHERE user_id = auth.uid();
  
  -- Delete user profile
  DELETE FROM profiles WHERE id = auth.uid();
  
  -- Delete auth user
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;
