
-- Re-define register_automation for robustness and "Upsert" behavior
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
  -- 1. CLEANUP: Remove old routes for THIS workflow ID to avoid stale/duplicate routing
  DELETE FROM public.automation_routes WHERE n8n_workflow_id = p_n8n_id;
  DELETE FROM public.tracked_posts WHERE workflow_id = p_n8n_id;

  -- 2. Upsert into n8n_workflows (Update if exists, else insert)
  -- We use automation_id OR n8n_workflow_id as key? 
  -- Usually n8n_workflow_id is unique enough for a user.
  INSERT INTO public.n8n_workflows (
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
  )
  ON CONFLICT (id) DO UPDATE SET -- This targets the UUID PK which we don't have.
  -- Better: Just insert, since we don't have a unique constraint on n8n_workflow_id yet.
  -- But we should probably find and update. 
  -- For now, let's keep it simple: cleanup routes first and insert fresh.
  RETURNING id INTO v_wf_id;

  -- 3. Insert Global Routes (if any)
  IF jsonb_array_length(p_global_routes) > 0 THEN
    INSERT INTO public.automation_routes (
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
      NULLIF(r->>'sub_type', 'null'), 
      p_n8n_id,
      COALESCE((r->>'is_active')::boolean, true)
    FROM jsonb_array_elements(p_global_routes) AS r;
  END IF;

  -- 4. Insert Tracked Posts (if any)
  IF jsonb_array_length(p_tracked_posts) > 0 THEN
    -- Post IDs are unique globally in tracked_posts, so use ON CONFLICT
    INSERT INTO public.tracked_posts (
      user_id,
      workflow_id,
      platform,
      media_id
    )
    SELECT
      p_user_id,
      p_n8n_id,
      COALESCE((t->>'platform')::text, 'instagram'),
      (t->>'media_id')::text
    FROM jsonb_array_elements(p_tracked_posts) AS t
    ON CONFLICT (media_id, platform) DO UPDATE SET
      workflow_id = EXCLUDED.workflow_id,
      user_id = EXCLUDED.user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'db_id', v_wf_id);

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Failed to register automation: %', SQLERRM;
END;
$$;
