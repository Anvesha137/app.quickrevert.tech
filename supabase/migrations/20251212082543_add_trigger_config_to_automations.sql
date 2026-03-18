/*
  # Add trigger configuration column

  1. Changes
    - Add `trigger_config` (jsonb) column to `automations` table
      - Stores trigger configuration like posts to monitor, keywords, etc.
      - Default value is an empty object
  
  2. Notes
    - This allows storing complex trigger configurations
    - Examples:
      - Post Comment: { postsType: 'all' | 'specific', specificPosts: [], commentsType: 'all' | 'keywords', keywords: [] }
      - Story Reply: { storiesType: 'all' | 'specific' }
      - User Direct Message: { messageType: 'all' | 'keywords', keywords: [] }
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automations' AND column_name = 'trigger_config'
  ) THEN
    ALTER TABLE automations ADD COLUMN trigger_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
