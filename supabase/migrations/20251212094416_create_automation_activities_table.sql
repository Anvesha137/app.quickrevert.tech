/*
  # Create Automation Activities Table

  1. New Tables
    - `automation_activities`
      - `id` (uuid, primary key) - unique identifier
      - `user_id` (uuid, foreign key) - references auth.users
      - `automation_id` (uuid, foreign key) - references automations table
      - `activity_type` (text) - type of activity (comment, reply, follow_request, dm, dm_sent, etc.)
      - `instagram_account_id` (uuid, foreign key) - which Instagram account performed the action
      - `target_username` (text) - Instagram username involved in the activity
      - `message` (text) - message content or description
      - `metadata` (jsonb) - additional data like seen status, following status, etc.
      - `status` (text) - success, failed, pending
      - `created_at` (timestamptz) - when the activity occurred

  2. Security
    - Enable RLS on `automation_activities` table
    - Add policy for users to read their own activities
    - Add policy for users to insert their own activities

  3. Indexes
    - Index on user_id for faster queries
    - Index on created_at for sorting
    - Index on automation_id for filtering by automation
*/

CREATE TABLE IF NOT EXISTS automation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  instagram_account_id uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  target_username text NOT NULL,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE automation_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities"
  ON automation_activities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
  ON automation_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_automation_activities_user_id ON automation_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_activities_created_at ON automation_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_activities_automation_id ON automation_activities(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_activities_status ON automation_activities(status);
