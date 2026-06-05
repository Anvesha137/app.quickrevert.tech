-- Fix: Hide access_token from client-side RLS queries
-- Revoke the broad SELECT privilege on the whole table for public roles
REVOKE SELECT ON public.instagram_accounts FROM authenticated, anon;

-- Grant SELECT only on non-sensitive columns
GRANT SELECT (
    id, 
    user_id, 
    instagram_user_id, 
    username, 
    profile_picture_url, 
    connected_at, 
    last_synced_at, 
    status, 
    token_expires_at,
    created_at, 
    updated_at,
    followers_count,
    initial_followers_count,
    followers_last_updated
) ON public.instagram_accounts TO authenticated, anon;

-- The service_role (used by Edge Functions) retains full access through the postgres role.
