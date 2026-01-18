import { useEffect, useState } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { N8nWorkflowService } from '../../lib/n8nService';

interface Activity {
  id: string;
  activity_type: string;
  target_username: string;
  message: string | null;
  metadata: {
    seen?: boolean;
    following?: boolean;
    [key: string]: unknown;
  };
  status: 'success' | 'failed' | 'pending';
  created_at: string;
}

interface ContactActivitiesProps {
  username: string;
}

const activityConfig = {
  comment: { icon: MessageSquare, label: 'Comment', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  reply: { icon: Reply, label: 'Comment Reply', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  follow_request: { icon: UserPlus, label: 'Follow Request', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  dm: { icon: Mail, label: 'User DM', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  dm_incoming: { icon: Mail, label: 'Incoming Message', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  dm_sent: { icon: Send, label: 'DM Sent', color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  story_reply: { icon: MessageSquare, label: 'Story Reply', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' }
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-600' },
  failed: { icon: XCircle, color: 'text-red-600' },
  pending: { icon: AlertCircle, color: 'text-yellow-600' }
};

function formatDateTime(date: string) {
  const activityDate = new Date(date);
  return activityDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimeAgo(date: string) {
  const now = new Date();
  const activityDate = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - activityDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export default function ContactActivities({ username }: ContactActivitiesProps) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [username, user]);

  async function fetchActivities() {
    setLoading(true);
    try {
      if (!user) return;

      // Fetch incoming messages from webhook_messages (messages sent TO the account)
      const { data: incomingMessages, error: webhookError } = await supabase
        .from('webhook_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('sender_username', username)
        .order('created_at', { ascending: false });

      if (webhookError) {
        console.error('Error fetching webhook messages:', webhookError);
      }

      // Fetch outgoing messages from automation_activities (messages sent FROM the account)
      const { data: automationActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user.id)
        .eq('target_username', username)
        .in('activity_type', ['dm_sent', 'reply', 'reply_to_comment'])
        .order('created_at', { ascending: false });

      if (activitiesError) throw activitiesError;

      // Convert incoming messages to activity format
      const incomingActivities = (incomingMessages || []).map((msg: any) => ({
        id: msg.id,
        activity_type: 'dm_incoming',
        target_username: username,
        message: msg.message_text,
        metadata: {},
        status: 'success' as const,
        created_at: msg.created_at,
        isIncoming: true,
      }));

      // Convert outgoing activities
      const outgoingActivities = (automationActivities || []).map((activity: any) => ({
        ...activity,
        isIncoming: false,
      }));

      // Combine and sort by date (oldest first for chat view)
      const allActivities = [
        ...incomingActivities,
        ...outgoingActivities,
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setActivities(allActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-16 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No activities yet</p>
          <p className="text-sm text-gray-400 mt-1">Activities with this contact will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 pb-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Chat History ({activities.length} messages)
        </h3>
      </div>

      <div className="space-y-3">
        {activities.map((activity) => {
          const isIncoming = (activity as any).isIncoming;
          const StatusIcon = statusConfig[activity.status].icon;

          return (
            <div
              key={activity.id}
              className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  isIncoming
                    ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                    : 'bg-blue-600 text-white rounded-tr-sm'
                }`}
              >
                {activity.message && (
                  <p className={`text-sm whitespace-pre-wrap ${isIncoming ? 'text-gray-900' : 'text-white'}`}>
                    {activity.message}
                  </p>
                )}
                <div className={`flex items-center gap-2 mt-2 text-xs ${isIncoming ? 'text-gray-500' : 'text-blue-100'}`}>
                  <span>{formatTimeAgo(activity.created_at)}</span>
                  {!isIncoming && (
                    <StatusIcon className={`w-3 h-3 ${statusConfig[activity.status].color}`} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
