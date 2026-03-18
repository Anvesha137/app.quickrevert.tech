import { useEffect, useState } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
    direction?: 'inbound' | 'outbound';
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
  dm_sent: { icon: Send, label: 'DM Sent', color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  story_reply: { icon: MessageSquare, label: 'Story Reply', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  // New types
  incoming_message: { icon: ArrowDownLeft, label: 'Received Message', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200' },
  incoming_comment: { icon: ArrowDownLeft, label: 'Received Comment', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200' },
  incoming_event: { icon: ArrowDownLeft, label: 'Received Event', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200' },
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
      // Fetch from automation_activities table
      const { data: automationActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('target_username', username)
        .order('created_at', { ascending: false });

      if (activitiesError) throw activitiesError;

      // Filter out n8n executions if we have DB records to avoid duplicates
      // We'll mostly rely on DB records now
      let n8nActivities: Activity[] = [];

      if (user) {
        try {
          const executionsResult = await N8nWorkflowService.getExecutions(undefined, 50, user.id);
          if (executionsResult.executions) {
            const rawN8n = executionsResult.executions.filter((exec: any) => {
              // Loose check: only include if we don't have a DB record around the same time
              // or if the username loosely matches in the raw data
              const execData = exec.data || exec;
              const dataStr = JSON.stringify(execData).toLowerCase();
              return dataStr.includes(username.toLowerCase());
            });

            n8nActivities = rawN8n.map((exec: any) => ({
              id: exec.id || `n8n-${exec.executionId}`,
              activity_type: 'dm', // Generic fallback
              target_username: username,
              message: exec.data?.message || exec.data?.text || 'Workflow execution log',
              metadata: { source: 'n8n' },
              status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending',
              created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
            }));
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Merge: Prefer DB activities. Only add N8n activity if it's significantly different timestamp
      // simple de-dupe strategy: if an n8n activity is within 2 seconds of a db activity, ignore it (assume it was the trigger)
      const dbTimestamps = new Set((automationActivities || []).map(a => new Date(a.created_at).getTime()));

      const uniqueN8n = n8nActivities.filter(n8n => {
        const n8nTime = new Date(n8n.created_at).getTime();
        // Check if any DB activity is within 5 seconds
        for (const dbTime of dbTimestamps) {
          if (Math.abs(dbTime - n8nTime) < 5000) return false;
        }
        return true;
      });

      const allActivities = [
        ...(automationActivities || []),
        ...uniqueN8n
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Conversation History ({activities.length})
        </h3>
      </div>

      <div className="space-y-4">
        {activities.map((activity) => {
          const config = activityConfig[activity.activity_type as keyof typeof activityConfig] || activityConfig.dm;
          const StatusIcon = statusConfig[activity.status].icon;
          const Icon = config.icon;

          // Determine direction
          const isIncoming = ['incoming_message', 'incoming_comment', 'incoming_event', 'comment', 'dm'].includes(activity.activity_type) || activity.metadata?.direction === 'inbound';

          // Helper to check if it's a "reply" action (outgoing)
          const isReply = ['reply', 'dm_sent', 'reply_to_comment', 'send_dm'].includes(activity.activity_type);

          return (
            <div key={activity.id} className={`flex flex-col ${isReply ? 'items-end' : 'items-start'}`}>

              <div className={`max-w-[85%] rounded-xl border p-4 hover:shadow-md transition-shadow 
                   ${isReply ? 'bg-blue-50 border-blue-100 rounded-tr-none' : 'bg-white border-gray-200 rounded-tl-none'}`}>

                <div className="flex items-center gap-2 mb-2 border-b border-black/5 pb-2">
                  <div className={`p-1.5 rounded-md ${config.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  </div>
                  <span className={`text-xs font-bold ${config.color}`}>{isReply ? 'QuickRevert' : activity.target_username}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{formatTimeAgo(activity.created_at)}</span>
                </div>

                {activity.message && (
                  <div className="mb-2">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {activity.message}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 mt-1">
                  {activity.metadata.following !== undefined && (
                    <span className={`text-[10px] flex items-center gap-1 ${activity.metadata.following ? 'text-green-600' : 'text-gray-500'}`}>
                      {activity.metadata.following ? 'Following' : 'Not following'}
                    </span>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <StatusIcon className={`w-3 h-3 ${statusConfig[activity.status].color}`} />
                    <span className="text-[10px] text-gray-400">{formatDateTime(activity.created_at)}</span>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
