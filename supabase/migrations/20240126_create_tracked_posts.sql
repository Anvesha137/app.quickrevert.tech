
-- Create tracked_posts table
CREATE TABLE IF NOT EXISTS tracked_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL, 
  platform TEXT NOT NULL DEFAULT 'instagram',
  media_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent multiple workflows from claiming the same post
  CONSTRAINT uk_tracked_posts_media_platform UNIQUE (media_id, platform)
);

-- Index for fast lookups during webhook dispatch
CREATE INDEX IF NOT EXISTS idx_tracked_posts_media_id ON tracked_posts(media_id);

-- Add comment
COMMENT ON TABLE tracked_posts IS 'Maps specific social media posts to specific automation workflows';

-- RPC Function for Atomic Automation Registration
CREATE OR REPLACE FUNCTION register_automation(
  p_user_id UUID,
  p_n8n_id TEXT,
  p_n8n_name TEXT,
  p_webhook_path TEXT,
  p_instagram_account_id TEXT, -- UUID of table instagram_accounts
  p_template TEXT,
  p_variables JSONB,
  p_automation_id TEXT,
  p_global_routes JSONB, -- Array of objects for automation_routes
  p_tracked_posts JSONB  -- Array of objects for tracked_posts
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wf_id UUID;
BEGIN
  -- 1. Insert into n8n_workflows
  INSERT INTO n8n_workflows (
    user_id,
    n8n_workflow_id,
    n8n_workflow_name,
    webhook_path,
    instagram_account_id,
    template,
    variables,
    automation_id
  ) VALUES (
    p_user_id,
    p_n8n_id,
    p_n8n_name,
    p_webhook_path,
    p_instagram_account_id::uuid,
    p_template,
    p_variables,
    p_automation_id::uuid
  ) RETURNING id INTO v_wf_id;

  -- 2. Insert Global Routes (if any)
  IF jsonb_array_length(p_global_routes) > 0 THEN
    INSERT INTO automation_routes (
      user_id,
      account_id,
      event_type,
      sub_type,
      n8n_workflow_id,
      is_active
    )
    SELECT
      p_user_id,
      (r->>'account_id')::text,
      (r->>'event_type')::text,
      NULLIF(r->>'sub_type', 'null'), -- Handle "null" string or actual null
      p_n8n_id,
      (r->>'is_active')::boolean
    FROM jsonb_array_elements(p_global_routes) AS r;
  END IF;

  -- 3. Insert Tracked Posts (if any)
  IF jsonb_array_length(p_tracked_posts) > 0 THEN
    INSERT INTO tracked_posts (
      user_id,
      workflow_id,
      platform,
      media_id
    )
    SELECT
      p_user_id,
      p_n8n_id,
      (t->>'platform')::text,
      (t->>'media_id')::text
    FROM jsonb_array_elements(p_tracked_posts) AS t;
  END IF;

  RETURN jsonb_build_object('success', true, 'db_id', v_wf_id);

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Failed to register automation: %', SQLERRM;
END;
$$;
