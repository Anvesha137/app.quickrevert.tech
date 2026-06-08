ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS conversation_state TEXT;

-- Backfill from existing JSONB
UPDATE contacts SET
  next_followup_at = (metadata -> 'conversation_state' ->> 'next_followup_at')::TIMESTAMPTZ,
  conversation_state = metadata -> 'conversation_state' ->> 'state'
WHERE metadata -> 'conversation_state' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_next_followup_at 
ON contacts (next_followup_at) 
WHERE next_followup_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_conversation_state 
ON contacts (conversation_state) 
WHERE conversation_state IS NOT NULL;
