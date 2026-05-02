-- Migration: Add webhook_path to remaining routing tables
-- Description: Adds webhook_path to automation_routes and tracked_posts for targeted n8n triggering.

-- 1. Update automation_routes
ALTER TABLE public.automation_routes 
ADD COLUMN IF NOT EXISTS webhook_path TEXT;

COMMENT ON COLUMN public.automation_routes.webhook_path IS 'Specific n8n webhook path for this route';

-- 2. Update tracked_posts
ALTER TABLE public.tracked_posts 
ADD COLUMN IF NOT EXISTS webhook_path TEXT;

COMMENT ON COLUMN public.tracked_posts.webhook_path IS 'Specific n8n webhook path for this post-specific route';

-- 3. Data Sync: Populate from n8n_workflows for existing records
UPDATE public.automation_routes ar
SET webhook_path = nw.webhook_path
FROM public.n8n_workflows nw
WHERE ar.n8n_workflow_id = nw.n8n_workflow_id
AND ar.webhook_path IS NULL;

UPDATE public.tracked_posts tp
SET webhook_path = nw.webhook_path
FROM public.n8n_workflows nw
WHERE tp.workflow_id = nw.n8n_workflow_id
AND tp.webhook_path IS NULL;
