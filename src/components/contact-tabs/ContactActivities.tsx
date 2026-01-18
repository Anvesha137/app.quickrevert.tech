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
      // Fetch from automation_activities table
      const { data: automationActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('target_username', username)
        .order('created_at', { ascending: false });

      if (activitiesError) throw activitiesError;

      // Fetch n8n executions if user is available
      let n8nExecutions: any[] = [];
      if (user) {
        try {
          const executionsResult = await N8nWorkflowService.getExecutions(undefined, 50, user.id);
          if (executionsResult.executions) {
            // Filter executions related to this contact (username)
            // Note: This depends on how n8n stores execution data - adjust based on actual structure
            n8nExecutions = executionsResult.executions.filter((exec: any) => {
              // Check if execution data contains the username
              const execData = exec.data || exec;
              const dataStr = JSON.stringify(execData).toLowerCase();
              return dataStr.includes(username.toLowerCase());
            });
          }
        } catch (n8nError) {
          console.error('Error fetching n8n executions:', n8nError);
          // Continue with automation activities even if n8n fails
        }
      }

      // Combine and sort activities
      const allActivities = [
        ...(automationActivities || []),
        // Map n8n executions to activity format
        ...n8nExecutions.map((exec: any) => ({
          id: exec.id || `n8n-${exec.executionId}`,
          activity_type: 'dm',
          target_username: username,
          message: exec.data?.message || exec.data?.text || 'Workflow execution',
          metadata: {},
          status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending',
          created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
          isN8nExecution: true,
        }))
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
          All Interactions ({activities.length})
        </h3>
      </div>

      <div className="space-y-4">
        {activities.map((activity) => {
          const config = activityConfig[activity.activity_type as keyof typeof activityConfig] || activityConfig.dm;
          const StatusIcon = statusConfig[activity.status].icon;
          const Icon = config.icon;

          return (
            <div
              key={activity.id}
              className={`bg-white rounded-xl border-2 ${config.border} p-4 hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start gap-4">
                <div className={`${config.bg} p-3 rounded-lg flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                    <StatusIcon className={`w-4 h-4 ${statusConfig[activity.status].color}`} />
                    <span className="text-xs text-gray-400 ml-auto">{formatTimeAgo(activity.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                      {activity.target_username[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">@{activity.target_username}</span>
                  </div>

                  {activity.message && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.message}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs">
                    {activity.metadata.following !== undefined && (
                      <span className={`flex items-center gap-1 ${activity.metadata.following ? 'text-green-600' : 'text-gray-500'}`}>
                        {activity.metadata.following ? '✓ Following' : '○ Not following'}
                      </span>
                    )}
                    {activity.metadata.seen !== undefined && (
                      <span className="text-gray-500">
                        Seen: {activity.metadata.seen ? 'Yes' : 'No'}
                      </span>
                    )}
                    <span className="text-gray-400 ml-auto">{formatDateTime(activity.created_at)}</span>
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
