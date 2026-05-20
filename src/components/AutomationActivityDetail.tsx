import { useEffect, useState } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, Bot, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { N8nWorkflowService } from '../lib/n8nService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { extractN8nExecutionData } from '../lib/n8nHelpers';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
 
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  instagram_account_name?: string | null;
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
  const { darkMode } = useTheme();
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
        .select(`
          *,
          n8n_workflows!automation_id(
            n8n_workflow_id
          )
        `)
        .eq('id', automationId)
        .maybeSingle();

      if (automationError) throw automationError;

      // Fetch the instagram account linked to the most recent activity for this automation
      const { data: recentActivity } = await supabase
        .from('automation_activities')
        .select('instagram_account:instagram_accounts(username)')
        .eq('automation_id', automationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const accountName = (recentActivity?.instagram_account as any)?.username || null;

      setAutomation(automationData ? { ...automationData, instagram_account_name: accountName } : null);

      // Fetch activities from automation_activities table
      // JOIN with contacts to get the REAL resolved username
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('automation_activities')
        .select(`
            id, activity_type, message, status, created_at, target_username, metadata->direction, metadata->following, metadata->seen,
            contact:contacts(username, instagram_user_id, full_name, avatar_url)
        `)
        .eq('automation_id', automationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (activitiesError) throw activitiesError;

      // The massive payload fetching from N8n has been completely removed to prevent Cached Egress blowups.
      // All activity is now accurately tracked natively in Supabase 'automation_activities'.
      const allActivities = [...(activitiesData || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActivities(allActivities as Activity[]);
    } catch (error) {
      console.error('Error fetching automation activities:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("h-full flex items-center justify-center transition-colors duration-500", darkMode ? "bg-black" : "bg-white")}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className={darkMode ? "text-white/40" : "text-gray-500"}>Loading activities...</p>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className={cn("h-full flex items-center justify-center transition-colors duration-500", darkMode ? "bg-black" : "bg-white")}>
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <p className={cn("font-medium", darkMode ? "text-white/40" : "text-gray-500")}>Automation not found</p>
        </div>
      </div>
    );
  }

  const successCount = activities.filter((a) => a.status === 'success').length;
  const failedCount = activities.filter((a) => a.status === 'failed').length;
  const pendingCount = activities.filter((a) => a.status === 'pending').length;

  return (
    <div className={cn("h-full flex flex-col transition-colors duration-500", darkMode ? "bg-black" : "bg-white")}>
      <div className={cn(
        "p-6 border-b transition-colors duration-300",
        darkMode ? "bg-black border-white/5" : "border-gray-200 bg-gradient-to-br from-green-50 via-blue-50 to-purple-50"
      )}>
        <div className="flex items-center gap-4 mb-4">
          <div className={cn(
            "w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all",
            automation.is_active 
              ? (darkMode ? "bg-blue-600 shadow-none" : "bg-gradient-to-br from-green-400 to-emerald-500") 
              : "bg-gray-300"
          )}>
            <Bot className={cn("w-10 h-10", automation.is_active ? "text-white" : "text-gray-600")} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className={cn("text-3xl font-bold transition-colors", darkMode ? "text-white" : "text-gray-900")}>{automation.name}</h1>
              <span className={cn(
                "px-3 py-1 rounded-full text-sm font-semibold transition-colors",
                automation.is_active 
                  ? (darkMode ? "bg-blue-600/20 text-blue-400" : "bg-green-100 text-green-700") 
                  : (darkMode ? "bg-white/5 text-white/40" : "bg-gray-100 text-gray-700")
              )}>
                {automation.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={cn("capitalize text-lg transition-colors", darkMode ? "text-white/60" : "text-gray-600")}>{automation.trigger_type.replace('_', ' ')} Trigger</p>
              {automation.instagram_account_name && (
                <span className={cn(
                  "text-sm font-semibold px-2.5 py-0.5 border rounded-full transition-colors",
                  darkMode ? "bg-white/5 text-white/60 border-white/10" : "bg-purple-50 text-purple-700 border-purple-200"
                )}>
                  @{automation.instagram_account_name}
                </span>
              )}
            </div>
            {automation.description && (
              <p className={cn("text-sm mt-1 transition-colors", darkMode ? "text-white/40" : "text-gray-500")}>{automation.description}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className={cn("rounded-xl p-4 border shadow-sm transition-all", darkMode ? "bg-white/5 border-white/5 shadow-none" : "bg-white border-gray-200")}>
            <p className={cn("text-xs mb-1 font-medium transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Total</p>
            <p className={cn("text-3xl font-bold transition-colors", darkMode ? "text-white" : "text-gray-900")}>{activities.length}</p>
          </div>
          <div className={cn("rounded-xl p-4 border-2 shadow-sm transition-all", darkMode ? "bg-white/5 border-white/5 shadow-none" : "bg-green-50 border-green-200")}>
            <p className={cn("text-xs mb-1 font-medium transition-colors", darkMode ? "text-white/40" : "text-green-700")}>Success</p>
            <p className={cn("text-3xl font-bold transition-colors", darkMode ? "text-white" : "text-green-600")}>{successCount}</p>
          </div>
          <div className={cn("rounded-xl p-4 border-2 shadow-sm transition-all", darkMode ? "bg-white/5 border-white/5 shadow-none" : "bg-red-50 border-red-200")}>
            <p className={cn("text-xs mb-1 font-medium transition-colors", darkMode ? "text-white/40" : "text-red-700")}>Failed</p>
            <p className={cn("text-3xl font-bold transition-colors", darkMode ? "text-white" : "text-red-600")}>{failedCount}</p>
          </div>
          <div className={cn("rounded-xl p-4 border-2 shadow-sm transition-all", darkMode ? "bg-white/5 border-white/5 shadow-none" : "bg-yellow-50 border-yellow-200")}>
            <p className={cn("text-xs mb-1 font-medium transition-colors", darkMode ? "text-white/40" : "text-yellow-700")}>Pending</p>
            <p className={cn("text-3xl font-bold transition-colors", darkMode ? "text-white" : "text-yellow-600")}>{pendingCount}</p>
          </div>
        </div>
      </div>
 
      <div className={cn("flex-1 overflow-y-auto p-6 transition-colors duration-500", darkMode ? "bg-black" : "bg-gray-50")}>
        {activities.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors", darkMode ? "bg-white/5" : "bg-gray-100")}>
                <Clock className="w-10 h-10 text-gray-400" />
              </div>
              <p className={cn("font-medium text-lg mb-2 transition-colors", darkMode ? "text-white" : "text-gray-700")}>No activity yet</p>
              <p className={cn("text-sm transition-colors", darkMode ? "text-white/40" : "text-gray-500")}>This automation hasn't executed any actions yet</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <h3 className={cn("text-sm font-bold uppercase tracking-wide transition-colors", darkMode ? "text-white/20" : "text-gray-600")}>
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

                // RESOLVE DISPLAY NAME (Source of Truth: Contact Table)
                let displayName = 'Unknown';
                // @ts-ignore - Supabase join
                if (activity.contact) {
                  // @ts-ignore
                  displayName = activity.contact.username || activity.contact.full_name || activity.contact.instagram_user_id;
                } else if (activity.target_username && activity.target_username !== 'system_managed') {
                  // Fallback for legacy data or N8n objects
                  displayName = activity.target_username;
                }

                return (
                  <div key={activity.id} className={cn("flex flex-col transition-all duration-300", isReply ? 'items-end' : 'items-start')}>

                    <div className={cn(
                      "max-w-[70%] rounded-xl border p-4 transition-all duration-300",
                      isReply 
                        ? (darkMode ? 'bg-white/5 border-white/5 hover:bg-white/[0.08] rounded-tr-none shadow-none' : 'bg-blue-50 border-blue-200 hover:shadow-lg rounded-tr-none') 
                        : (darkMode ? 'bg-white/5 border-white/5 hover:bg-white/[0.08] rounded-tl-none shadow-none' : 'bg-white border-gray-200 hover:shadow-lg rounded-tl-none')
                    )}>

                      <div className={cn("flex items-center gap-3 mb-3 border-b pb-2", darkMode ? "border-white/5" : "border-black/5")}>
                        <div className={cn("p-2 rounded-lg transition-colors", darkMode ? "bg-white/5" : config.bg)}>
                          <Icon className={cn("w-4 h-4 transition-colors", darkMode ? "text-blue-400" : config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-bold transition-colors", darkMode ? "text-blue-400" : config.color)}>{config.label}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {(isReply ? 'QR' : displayName[0])?.toUpperCase()}
                            </div>
                            <span className={cn("text-xs font-semibold truncate transition-colors", darkMode ? "text-white" : "text-gray-900")}>@{isReply ? 'QuickRevert' : displayName}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{formatTimeAgo(activity.created_at)}</span>
                      </div>

                      {activity.message && (
                        <div className="mb-3">
                          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed transition-colors", darkMode ? "text-white/60" : "text-gray-800")}>
                            {activity.message}
                          </p>
                        </div>
                      )}

                      <div className={cn("flex items-center justify-between gap-4 mt-1 border-t pt-2 transition-colors", darkMode ? "border-white/5" : "border-black/5")}>
                        <div className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors", 
                          darkMode ? "bg-white/5" : statusConfig[activity.status].bg
                        )}>
                          <StatusIcon className={cn("w-3 h-3 transition-colors", darkMode ? "text-blue-400" : statusConfig[activity.status].color)} />
                          <span className={cn(
                            "text-[10px] font-semibold capitalize transition-colors", 
                            darkMode ? "text-blue-400" : statusConfig[activity.status].color
                          )}>
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
