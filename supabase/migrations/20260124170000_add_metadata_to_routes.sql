-- Add metadata column to automation_routes for Schema Flexibility
-- Allows storing additional routing rules or configuration (e.g. regex patterns, keyword filters) without schema changes.

ALTER TABLE public.automation_routes 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
