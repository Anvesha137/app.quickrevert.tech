-- Add followers_count and follows_count to instagram_accounts
ALTER TABLE instagram_accounts 
ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS follows_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS name TEXT;

-- Create webhook_messages table to store incoming messages from webhooks
CREATE TABLE IF NOT EXISTS webhook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  message_text TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, video, etc.
  webhook_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_webhook_messages_user_id ON webhook_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_messages_sender_username ON webhook_messages(sender_username);
CREATE INDEX IF NOT EXISTS idx_webhook_messages_created_at ON webhook_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_messages_instagram_account_id ON webhook_messages(instagram_account_id);

-- Enable RLS
ALTER TABLE webhook_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own webhook messages"
  ON webhook_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhook messages"
  ON webhook_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create a view for message conversations (grouped by sender)
CREATE OR REPLACE VIEW message_conversations AS
SELECT 
  wm.user_id,
  wm.sender_username,
  wm.instagram_account_id,
  COUNT(*) as message_count,
  MAX(wm.created_at) as last_message_at,
  MIN(wm.created_at) as first_message_at,
  ARRAY_AGG(
    json_build_object(
      'id', wm.id,
      'message_text', wm.message_text,
      'message_type', wm.message_type,
      'created_at', wm.created_at
    ) ORDER BY wm.created_at DESC
  ) as messages
FROM webhook_messages wm
GROUP BY wm.user_id, wm.sender_username, wm.instagram_account_id;
