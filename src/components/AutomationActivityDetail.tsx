import { useEffect, useState } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, Zap, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { N8nWorkflowService } from '../lib/n8nService';
import { useAuth } from '../contexts/AuthContext';

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
  isN8nExecution?: boolean;
  executionData?: any;
}

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  description: string | null;
}

interface AutomationActivityDetailProps {
  automationId: string;
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
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  pending: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50' }
};

function formatDateTime(date: string | null | undefined) {
  if (!date) return 'N/A';
  const activityDate = new Date(date);
  if (isNaN(activityDate.getTime())) return 'Invalid date';
  return activityDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimeAgo(date: string | null | undefined) {
  if (!date) return 'N/A';
  const now = new Date();
  const activityDate = new Date(date);
  if (isNaN(activityDate.getTime())) return 'Invalid date';
  const diffInSeconds = Math.floor((now.getTime() - activityDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export default function AutomationActivityDetail({ automationId }: AutomationActivityDetailProps) {
  const { user } = useAuth();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAutomationAndActivities();
  }, [automationId, user]);

  async function fetchAutomationAndActivities() {
    if (!user) return;

    setLoading(true);
    try {
      const { data: automationData, error: automationError } = await supabase
        .from('automations')
        .select('*')
        .eq('id', automationId)
        .maybeSingle();

      if (automationError) throw automationError;
      setAutomation(automationData);

      // Fetch activities from automation_activities table
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('automation_id', automationId)
        .order('created_at', { ascending: false });

      if (activitiesError) throw activitiesError;

      // Fetch n8n workflow ID for this automation
      let n8nWorkflowId: string | null = null;
      try {
        const { data: workflowData, error: workflowError } = await supabase
          .from('n8n_workflows')
          .select('n8n_workflow_id')
          .eq('automation_id', automationId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!workflowError && workflowData) {
          n8nWorkflowId = workflowData.n8n_workflow_id;
        }
      } catch (workflowErr) {
        console.error('Error fetching n8n workflow:', workflowErr);
      }

      // Fetch n8n executions for this workflow
      let n8nExecutions: Activity[] = [];
      if (n8nWorkflowId) {
        try {
          const executionsResult = await N8nWorkflowService.getExecutions(n8nWorkflowId, 50, user.id);

          if (executionsResult.executions && executionsResult.executions.length > 0) {
            const rawN8n = executionsResult.executions.map((exec: any) => ({
              id: `n8n-${exec.id}`,
              activity_type: 'dm',
              target_username: 'Unknown', // Default, will filter mostly
              message: exec.data?.message || exec.data?.text || 'Workflow execution',
              metadata: { source: 'n8n' },
              status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending',
              created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
              isN8nExecution: true
            }));
            n8nExecutions = rawN8n;
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Merge: Prefer DB activities. Only add N8n activity if it's significantly different timestamp
      const dbTimestamps = new Set((activitiesData || []).map(a => new Date(a.created_at).getTime()));

      const uniqueN8n = n8nExecutions.filter(n8n => {
        const n8nTime = new Date(n8n.created_at).getTime();
        // Check if any DB activity is within 5 seconds - if so, assume DB record covers it
        for (const dbTime of dbTimestamps) {
          if (Math.abs(dbTime - n8nTime) < 5000) return false;
        }
        return true;
      });

      // Combine and sort all activities
      const allActivities = [
        ...(activitiesData || []),
        ...uniqueN8n
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActivities(allActivities as Activity[]);
    } catch (error) {
      console.error('Error fetching automation activities:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading activities...</p>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Automation not found</p>
        </div>
      </div>
    );
  }

  const successCount = activities.filter((a) => a.status === 'success').length;
  const failedCount = activities.filter((a) => a.status === 'failed').length;
  const pendingCount = activities.filter((a) => a.status === 'pending').length;

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="border-b border-gray-200 bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-20 h-20 rounded-2xl ${automation.is_active ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-gray-300'} flex items-center justify-center flex-shrink-0 shadow-lg`}>
            <Zap className={`w-10 h-10 ${automation.is_active ? 'text-white' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-gray-900">{automation.name}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${automation.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {automation.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-gray-600 capitalize text-lg">{automation.trigger_type.replace('_', ' ')} Trigger</p>
            {automation.description && (
              <p className="text-sm text-gray-500 mt-1">{automation.description}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-600 mb-1 font-medium">Total</p>
            <p className="text-3xl font-bold text-gray-900">{activities.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200 shadow-sm">
            <p className="text-xs text-green-700 mb-1 font-medium">Success</p>
            <p className="text-3xl font-bold text-green-600">{successCount}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border-2 border-red-200 shadow-sm">
            <p className="text-xs text-red-700 mb-1 font-medium">Failed</p>
            <p className="text-3xl font-bold text-red-600">{failedCount}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border-2 border-yellow-200 shadow-sm">
            <p className="text-xs text-yellow-700 mb-1 font-medium">Pending</p>
            <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {activities.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 font-medium text-lg mb-2">No activity yet</p>
              <p className="text-sm text-gray-500">This automation hasn't executed any actions yet</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide">
                Execution History ({activities.length})
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

                    <div className={`max-w-[70%] rounded-xl border p-4 hover:shadow-lg transition-all 
                        ${isReply ? 'bg-blue-50 border-blue-200 rounded-tr-none' : 'bg-white border-gray-200 rounded-tl-none'}`}>

                      <div className="flex items-center gap-3 mb-3 border-b border-black/5 pb-2">
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${config.color}`}>{config.label}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {(isReply ? 'QR' : activity.target_username[0])?.toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold text-gray-900 truncate">@{isReply ? 'QuickRevert' : activity.target_username}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{formatTimeAgo(activity.created_at)}</span>
                      </div>

                      {activity.message && (
                        <div className="mb-3">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {activity.message}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-4 mt-1 border-t border-black/5 pt-2">
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${statusConfig[activity.status].bg}`}>
                          <StatusIcon className={`w-3 h-3 ${statusConfig[activity.status].color}`} />
                          <span className={`text-[10px] font-semibold ${statusConfig[activity.status].color} capitalize`}>
                            {activity.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">{formatDateTime(activity.created_at)}</span>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
