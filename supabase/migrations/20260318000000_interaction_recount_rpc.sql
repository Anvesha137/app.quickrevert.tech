-- Create RPC to recalculate interaction counts for contacts
CREATE OR REPLACE FUNCTION recalculate_contact_interactions(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- First, link any unlinked activities to contacts based on instagram_user_id and account_id
  -- This handles activities created via sync/backfill that might not have had a contact_id at insertion time
  UPDATE public.automation_activities a
  SET contact_id = c.id
  FROM public.contacts c
  WHERE a.contact_id IS NULL
    AND a.user_id = p_user_id
    AND c.user_id = p_user_id
    AND a.instagram_account_id = c.instagram_account_id
    AND (
      a.metadata->>'raw_id' = c.instagram_user_id 
      OR 
      a.metadata->>'sender_id' = c.instagram_user_id
    );

  -- Update interaction counts
  UPDATE public.contacts c
  SET 
    interaction_count = (
      SELECT count(*)
      FROM public.automation_activities a
      WHERE a.contact_id = c.id
    ),
    last_interaction_at = (
      SELECT max(created_at)
      FROM public.automation_activities a
      WHERE a.contact_id = c.id
    )
  WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
