-- Remove avatar_url column from profiles table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE profiles DROP COLUMN avatar_url;
  END IF;
END $$;
