import { useState, useEffect } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, ArrowDownLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { N8nWorkflowService } from '../lib/n8nService';
import { extractN8nExecutionData } from '../lib/n8nHelpers';

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

const activityConfig = {
  comment: { icon: MessageSquare, label: 'Comment', color: 'text-blue-600', bg: 'bg-blue-50' },
  reply: { icon: Reply, label: 'Comment Reply', color: 'text-green-600', bg: 'bg-green-50' },
  follow_request: { icon: UserPlus, label: 'Follow Request', color: 'text-purple-600', bg: 'bg-purple-50' },
  dm: { icon: Mail, label: 'User DM', color: 'text-orange-600', bg: 'bg-orange-50' },
  dm_sent: { icon: Send, label: 'DM Sent', color: 'text-pink-600', bg: 'bg-pink-50' },
  incoming_message: { icon: ArrowDownLeft, label: 'Received Message', color: 'text-gray-700', bg: 'bg-gray-100' },
  incoming_comment: { icon: ArrowDownLeft, label: 'Received Comment', color: 'text-gray-700', bg: 'bg-gray-100' },
  incoming_event: { icon: ArrowDownLeft, label: 'Received Event', color: 'text-gray-700', bg: 'bg-gray-100' },
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-600' },
  failed: { icon: XCircle, color: 'text-red-600' },
  pending: { icon: AlertCircle, color: 'text-yellow-600' }
};

function formatTimeAgo(date: string) {
  const now = new Date();
  const activityDate = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - activityDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export default function RecentActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchActivities();
    }
  }, [user]);

  const fetchActivities = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Fetch from automation_activities table
      const { data: automationActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10); // Fetch a bit more to ensure we have enough after merging

      if (activitiesError) throw activitiesError;

      // Fetch n8n executions
      let n8nExecutions: Activity[] = [];
      try {
        const executionsResult = await N8nWorkflowService.getExecutions(undefined, 10, user.id);
        if (executionsResult.executions) {
          const rawN8n = executionsResult.executions.map((exec: any) => ({
            id: `n8n-${exec.id}`,
            activity_type: 'dm',
            target_username: 'Unknown',
            message: exec.data?.message || exec.data?.text || 'Workflow execution',
            metadata: { source: 'n8n' },
            status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending' as 'success' | 'failed' | 'pending',
            created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
            isN8nExecution: true,
          }));
          n8nExecutions = rawN8n;
        }
      } catch (n8nError) {
        console.error('Error fetching n8n executions:', n8nError);
      }

      // Merge: Prefer DB activities
      const dbTimestamps = new Set((automationActivities || []).map(a => new Date(a.created_at).getTime()));

      const uniqueN8n = n8nExecutions.filter(n8n => {
        const n8nTime = new Date(n8n.created_at).getTime();
        for (const dbTime of dbTimestamps) {
          if (Math.abs(dbTime - n8nTime) < 5000) return false;
        }
        return true;
      });

      // Combine and sort activities
      const allActivities = [
        ...(automationActivities || []),
        ...uniqueN8n
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 7); // keep original limit for display

      setActivities(allActivities as Activity[]);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-sm text-gray-600 mb-6">Latest executions</p>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-sm text-gray-600 mb-6">Latest executions</p>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No activity yet</p>
          <p className="text-xs text-gray-400 mt-1">Activities will appear here when your automations run</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
      <p className="text-sm text-gray-600 mb-6">Latest executions</p>

      <div className="space-y-4">
        {activities.map((activity) => {
          const config = activityConfig[activity.activity_type as keyof typeof activityConfig] || activityConfig.dm;
          const StatusIcon = statusConfig[activity.status].icon;
          const Icon = config.icon;

          // Basic direction check for styling
          const isReply = ['reply', 'dm_sent', 'reply_to_comment', 'send_dm'].includes(activity.activity_type);

          return (
            <div key={activity.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
              <div className="flex items-start gap-3">
                <div className={`${config.bg} p-2.5 rounded-lg`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{config.label}</p>
                    <StatusIcon className={`w-3.5 h-3.5 ${statusConfig[activity.status].color}`} />
                  </div>

                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-900">@{isReply ? 'QuickRevert' : activity.target_username}</span>
                    </p>
                  </div>

                  {activity.message && (
                    <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg p-2 border border-gray-100 line-clamp-2">
                      {activity.message}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {activity.metadata.following !== undefined && (
                      <span className={`flex items-center gap-1 ${activity.metadata.following ? 'text-green-600' : 'text-gray-500'}`}>
                        {activity.metadata.following ? '✓ I am following' : '○ Not following'}
                      </span>
                    )}
                    <span className="text-gray-400 ml-auto">{formatTimeAgo(activity.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={fetchActivities}
        className="w-full mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 py-2 hover:bg-blue-50 rounded-lg transition-colors"
      >
        Refresh activity
      </button>
    </div>
  );
}
