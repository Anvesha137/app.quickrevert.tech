-- Migration to add detailed automation counts to Neon users table
-- Run this in the Neon SQL Console

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS automations_active integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS automations_deactivated integer DEFAULT 0;

-- Optional: Rename no_of_automations to automations_total if you want to be very clear, 
-- but we'll keep it for backward compatibility as the "Total" count.
COMMENT ON COLUMN users.no_of_automations IS 'Total number of automations (active + deactivated)';
COMMENT ON COLUMN users.automations_active IS 'Number of currently active automations';
COMMENT ON COLUMN users.automations_deactivated IS 'Number of currently deactivated automations';
