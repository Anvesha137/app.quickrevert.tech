-- Function to get daily activity counts for a user (Optimized for Egress)
CREATE OR REPLACE FUNCTION get_daily_activity_stats(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  date TEXT,
  activity_type TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as date,
    a.activity_type,
    count(*)::BIGINT
  FROM public.automation_activities a
  WHERE a.user_id = p_user_id
    AND a.created_at >= p_start_date
    AND a.created_at <= p_end_date
  GROUP BY 1, 2
  ORDER BY 1 DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get top performing automations for a user (Optimized for Egress)
CREATE OR REPLACE FUNCTION get_top_performing_automations(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  automation_id UUID,
  automation_name TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.automation_id,
    MAX(aut.name) as automation_name,
    count(*)::BIGINT as count
  FROM public.automation_activities a
  JOIN public.automations aut ON aut.id = a.automation_id
  WHERE a.user_id = p_user_id
    AND a.automation_id IS NOT NULL
  GROUP BY a.automation_id
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
