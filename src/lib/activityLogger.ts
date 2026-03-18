import { supabase } from './supabase';

export type ActivityType = 'comment' | 'reply' | 'follow_request' | 'dm' | 'dm_sent';
export type ActivityStatus = 'success' | 'failed' | 'pending';

interface LogActivityParams {
  activityType: ActivityType;
  targetUsername: string;
  message?: string;
  automationId?: string;
  instagramAccountId?: string;
  metadata?: {
    seen?: boolean;
    following?: boolean;
    [key: string]: unknown;
  };
  status?: ActivityStatus;
}

export async function logActivity({
  activityType,
  targetUsername,
  message,
  automationId,
  instagramAccountId,
  metadata = {},
  status = 'success'
}: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('No authenticated user found');
      return { error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('automation_activities')
      .insert({
        user_id: user.id,
        activity_type: activityType,
        target_username: targetUsername,
        message: message || null,
        automation_id: automationId || null,
        instagram_account_id: instagramAccountId || null,
        metadata,
        status
      })
      .select()
      .single();

    if (error) throw error;
    return { data };
  } catch (error) {
    console.error('Error logging activity:', error);
    return { error };
  }
}

export async function logComment(targetUsername: string, message: string, metadata?: Record<string, unknown>) {
  return logActivity({
    activityType: 'comment',
    targetUsername,
    message,
    metadata
  });
}

export async function logReply(targetUsername: string, message: string, metadata?: Record<string, unknown>) {
  return logActivity({
    activityType: 'reply',
    targetUsername,
    message,
    metadata
  });
}

export async function logFollowRequest(targetUsername: string, message?: string, following = false) {
  return logActivity({
    activityType: 'follow_request',
    targetUsername,
    message,
    metadata: { following }
  });
}

export async function logDM(targetUsername: string, following = false, seen = false) {
  return logActivity({
    activityType: 'dm',
    targetUsername,
    metadata: { following, seen }
  });
}

export async function logDMSent(targetUsername: string, message: string, seen = false) {
  return logActivity({
    activityType: 'dm_sent',
    targetUsername,
    message,
    metadata: { seen }
  });
}
