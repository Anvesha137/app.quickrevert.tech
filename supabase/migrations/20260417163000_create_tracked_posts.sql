-- Migration: Create tracked_posts and register_automation RPC

CREATE TABLE IF NOT EXISTS public.tracked_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES public.n8n_workflows(n8n_workflow_id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'instagram',
  media_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for Gateway speed
CREATE INDEX IF NOT EXISTS idx_tracked_posts_lookup ON public.tracked_posts(media_id, workflow_id);

CREATE OR REPLACE FUNCTION public.register_automation(
  p_user_id UUID,
  p_n8n_id TEXT,
  p_n8n_name TEXT,
  p_webhook_path TEXT,
  p_instagram_account_id UUID,
  p_template TEXT,
  p_variables JSONB,
  p_automation_id UUID,
  p_global_routes JSONB,
  p_tracked_posts JSONB
) RETURNS void AS $$
DECLARE
  v_route JSONB;
  v_post JSONB;
BEGIN
  -- 1. Insert/Update n8n_workflows
  INSERT INTO public.n8n_workflows (
    n8n_workflow_id, n8n_workflow_name, user_id, instagram_account_id, webhook_path, template, variables, automation_id, is_active
  ) VALUES (
    p_n8n_id, p_n8n_name, p_user_id, p_instagram_account_id, p_webhook_path, p_template, p_variables, p_automation_id, true
  ) ON CONFLICT (n8n_workflow_id) DO UPDATE SET 
    is_active = true,
    n8n_workflow_name = EXCLUDED.n8n_workflow_name;

  -- 2. Clear old routes
  DELETE FROM public.automation_routes WHERE n8n_workflow_id = p_n8n_id;
  DELETE FROM public.tracked_posts WHERE workflow_id = p_n8n_id;

  -- 3. Insert global routes
  IF p_global_routes IS NOT NULL THEN
    FOR v_route IN SELECT * FROM jsonb_array_elements(p_global_routes)
    LOOP
      INSERT INTO public.automation_routes (
        account_id, user_id, n8n_workflow_id, event_type, sub_type, is_active
      ) VALUES (
        v_route->>'account_id', p_user_id, p_n8n_id, v_route->>'event_type', 
        NULLIF(v_route->>'sub_type', ''), CAST(v_route->>'is_active' AS BOOLEAN)
      );
    END LOOP;
  END IF;

  -- 4. Insert tracked posts
  IF p_tracked_posts IS NOT NULL THEN
    FOR v_post IN SELECT * FROM jsonb_array_elements(p_tracked_posts)
    LOOP
      INSERT INTO public.tracked_posts (
        workflow_id, platform, media_id
      ) VALUES (
        p_n8n_id, v_post->>'platform', v_post->>'media_id'
      );
    END LOOP;
  END IF;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
