/*
  # Create Instagram Connected Accounts Table

  1. New Tables
    - `instagram_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `instagram_user_id` (text, Instagram's user ID)
      - `username` (text, Instagram username)
      - `access_token` (text, encrypted access token)
      - `token_expires_at` (timestamptz, token expiration time)
      - `profile_picture_url` (text, user's profile picture)
      - `connected_at` (timestamptz, when account was connected)
      - `last_synced_at` (timestamptz, last time data was synced)
      - `status` (text, account status: active/expired/revoked)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `instagram_accounts` table
    - Add policy for users to read their own connected accounts
    - Add policy for users to insert their own connected accounts
    - Add policy for users to update their own connected accounts
    - Add policy for users to delete their own connected accounts

  3. Indexes
    - Add index on user_id for faster queries
    - Add unique constraint on (user_id, instagram_user_id)
*/

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  profile_picture_url text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, instagram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON instagram_accounts(status);

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Instagram accounts"
  ON instagram_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram accounts"
  ON instagram_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Instagram accounts"
  ON instagram_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Instagram accounts"
  ON instagram_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_instagram_accounts_updated_at
  BEFORE UPDATE ON instagram_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
