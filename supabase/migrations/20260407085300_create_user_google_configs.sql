/*
  # Create User Google Configs Table

  1. New Tables
    - `user_google_configs`
      - `user_id` (uuid, primary key, references auth.users)
      - `google_refresh_token` (text, encrypted if possible, but for now plain)
      - `google_email` (text)
      - `is_connected` (boolean)
      - `updated_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `user_google_configs` table
    - Add policy for users to manage their own config
*/

CREATE TABLE IF NOT EXISTS user_google_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_refresh_token text NOT NULL,
  google_email text,
  is_connected boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_google_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own google config"
  ON user_google_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own google config"
  ON user_google_configs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);
