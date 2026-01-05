/*
  # Add page_id to instagram_accounts table

  1. Changes
    - Add `page_id` column to store the Facebook Page ID
    - This is required for Instagram Graph API calls and token management
  
  2. Notes
    - The page_id is the Facebook Page ID linked to the Instagram Business account
    - Required for making Instagram API requests and refreshing tokens
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'instagram_accounts' AND column_name = 'page_id'
  ) THEN
    ALTER TABLE instagram_accounts ADD COLUMN page_id text;
  END IF;
END $$;
