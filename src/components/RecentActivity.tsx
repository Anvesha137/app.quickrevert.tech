import { useState, useEffect } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, ArrowDownLeft, Activity as ActivityIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { N8nWorkflowService } from '../lib/n8nService';

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
  comment: { icon: MessageSquare, label: 'Comment', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  reply: { icon: Reply, label: 'Reply', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  follow_request: { icon: UserPlus, label: 'Follow', color: 'text-purple-600', bg: 'bg-purple-500/10' },
  dm: { icon: Mail, label: 'Message', color: 'text-orange-600', bg: 'bg-orange-500/10' },
  dm_sent: { icon: Send, label: 'DM Sent', color: 'text-pink-600', bg: 'bg-pink-500/10' },
  incoming_message: { icon: ArrowDownLeft, label: 'Received', color: 'text-slate-600', bg: 'bg-slate-500/10' },
  incoming_comment: { icon: ArrowDownLeft, label: 'Commented', color: 'text-slate-600', bg: 'bg-slate-500/10' },
  incoming_event: { icon: ArrowDownLeft, label: 'Event', color: 'text-slate-600', bg: 'bg-slate-500/10' },
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
  pending: { icon: AlertCircle, color: 'text-amber-500' }
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
      const { data: automationActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (activitiesError) throw activitiesError;

      // Filter and Merge n8n executions
      let processedActivities = (automationActivities || [])
        .filter(a => a.target_username && a.target_username !== 'Unknown' && a.target_username !== 'UnknownError')
        .map(a => ({ ...a, isN8nExecution: false }));

      // Fetch n8n executions (optional layer)
      try {
        const executionsResult = await N8nWorkflowService.getExecutions(undefined, 10, user.id);
        if (executionsResult.executions) {
          const n8nExecs = executionsResult.executions
            .filter((exec: any) => exec.data?.username && exec.data?.username !== 'Unknown')
            .map((exec: any) => ({
              id: `n8n-${exec.id}`,
              activity_type: 'dm',
              target_username: exec.data?.username,
              message: exec.data?.message || exec.data?.text || 'Workflow execution',
              metadata: { source: 'n8n' },
              status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending' as 'success' | 'failed' | 'pending',
              created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
              isN8nExecution: true,
            }));

          // Basic deduplication
          const existingIds = new Set(processedActivities.map(p => p.id));
          n8nExecs.forEach(exec => {
            if (!existingIds.has(exec.id)) processedActivities.push(exec);
          });
        }
      } catch (n8nError) {
        console.error('Error fetching n8n executions:', n8nError);
      }

      const finalActivities = processedActivities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      setActivities(finalActivities as Activity[]);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/60 border border-white/40 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-blue-500" />
              Recent Activity
            </h2>
            <p className="text-xs text-gray-500 font-medium">Monitoring your automation performance</p>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="w-12 h-12 bg-gray-200/50 rounded-2xl" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200/50 rounded w-3/4" />
                <div className="h-3 bg-gray-200/50 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/60 border border-white/40 rounded-3xl p-6 shadow-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ActivityIcon className="w-5 h-5 text-blue-500" />
            Recent Activity
          </h2>
          <p className="text-xs text-gray-500 font-medium tracking-wide">LATEST AUTOMATION EXECUTIONS</p>
        </div>
        <button
          onClick={fetchActivities}
          className="p-2 hover:bg-white/50 rounded-xl transition-all text-gray-500 hover:text-blue-500"
        >
          <Clock className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
              <ActivityIcon className="w-8 h-8" />
            </div>
            <p className="text-gray-800 font-bold">No activity yet</p>
            <p className="text-xs text-gray-500 max-w-[180px]">Your automation triggers will appear here in real-time.</p>
          </div>
        ) : (
          activities.map((activity) => {
            const config = activityConfig[activity.activity_type as keyof typeof activityConfig] || activityConfig.dm;
            const status = statusConfig[activity.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const Icon = config.icon;
            const isOutbound = activity.metadata.direction === 'outbound' || ['reply', 'dm_sent', 'reply_to_comment', 'send_dm'].includes(activity.activity_type);

            return (
              <div key={activity.id} className="group relative backdrop-blur-md bg-white/40 border border-white/20 p-4 rounded-2xl hover:bg-white/60 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className={`${config.bg} w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {config.label}
                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-tighter">@{isOutbound ? 'Bot' : activity.target_username}</span>
                      </p>
                      <StatusIcon className={`w-4 h-4 ${status.color}`} />
                    </div>

                    <p className="text-xs text-gray-600 line-clamp-1 italic font-medium">
                      {activity.message || 'Processing event...'}
                    </p>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[10px] text-gray-400 font-bold">{formatTimeAgo(activity.created_at)}</span>
                      {activity.metadata.following !== undefined && (
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${activity.metadata.following ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {activity.metadata.following ? '• Following' : '• Not Following'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={fetchActivities}
        className="mt-6 w-full py-3 rounded-2xl bg-white/60 border border-white/40 text-xs font-bold text-gray-700 hover:bg-blue-500 hover:text-white hover:border-blue-400 transition-all duration-300 shadow-sm"
      >
        VIEW FULL HISTORY
      </button>
    </div>
  );
}
