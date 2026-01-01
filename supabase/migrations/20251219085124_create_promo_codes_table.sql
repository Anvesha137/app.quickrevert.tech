-- Create Promo Codes Table
--
-- 1. New Tables
--    - promo_codes
--      - id (uuid, primary key)
--      - code (text, unique) - The promo code itself
--      - user_id (uuid, foreign key to auth.users) - User who generated the code
--      - pack_type (text) - Either 'starter' or 'professional'
--      - discount_amount (integer) - Discount in rupees (0 for starter, 100 for professional)
--      - generated_for (text) - Username the code was generated for
--      - expires_at (timestamptz) - Expiry date of the code
--      - usage_limit (integer) - Number of times code can be used
--      - used_count (integer) - Number of times code has been used
--      - status (text) - Status: 'active', 'used', or 'expired'
--      - created_at (timestamptz) - When code was generated
--      - updated_at (timestamptz) - Last update time
--
-- 2. Security
--    - Enable RLS on promo_codes table
--    - Add policy for authenticated users to read their own promo codes
--    - Add policy for authenticated users to create promo codes
--    - Add policy for authenticated users to update their own promo codes
--
-- 3. Important Notes
--    - Promo codes are unique across the system
--    - Each user can generate multiple promo codes
--    - Starter pack codes make the amount 0 Rs (free)
--    - Professional pack codes provide ₹100 discount

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pack_type text NOT NULL CHECK (pack_type IN ('starter', 'professional')),
  discount_amount integer NOT NULL DEFAULT 0,
  generated_for text NOT NULL,
  expires_at timestamptz NOT NULL,
  usage_limit integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own promo codes"
  ON promo_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create promo codes"
  ON promo_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own promo codes"
  ON promo_codes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_promo_codes_user_id ON promo_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_status ON promo_codes(status);