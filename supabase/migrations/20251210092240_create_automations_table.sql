/*
  # Create automations table

  1. New Tables
    - `automations`
      - `id` (uuid, primary key) - unique identifier for each automation
      - `user_id` (uuid, foreign key) - references auth.users
      - `name` (text) - automation name
      - `description` (text, nullable) - automation description
      - `status` (text) - 'active' or 'inactive'
      - `trigger_type` (text) - trigger type: 'post_comment', 'story_reply', 'user_directed_messages'
      - `actions` (jsonb) - automation actions configuration
      - `created_at` (timestamptz) - creation timestamp
      - `updated_at` (timestamptz) - last update timestamp
  
  2. Security
    - Enable RLS on `automations` table
    - Add policy for users to view their own automations
    - Add policy for users to create their own automations
    - Add policy for users to update their own automations
    - Add policy for users to delete their own automations
  
  3. Indexes
    - Index on user_id for faster queries
    - Index on status for filtering
    - Index on trigger_type for filtering
*/

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('post_comment', 'story_reply', 'user_directed_messages')),
  actions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own automations"
  ON automations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own automations"
  ON automations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own automations"
  ON automations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own automations"
  ON automations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);
CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(trigger_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();