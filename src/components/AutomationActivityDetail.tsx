import { useEffect, useState } from 'react';
import { MessageSquare, Reply, UserPlus, Mail, Send, CheckCircle2, XCircle, AlertCircle, Clock, Zap } from 'lucide-react';
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
  story_reply: { icon: MessageSquare, label: 'Story Reply', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' }
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
          const executionsResult = await N8nWorkflowService.getExecutions(n8nWorkflowId, 100, user.id);
          
          if (executionsResult.executions && executionsResult.executions.length > 0) {
            // Fetch detailed execution data for each execution
            const executionDetailsPromises = executionsResult.executions.map(async (exec: any) => {
              try {
                // Get detailed execution data using getExecution
                const detailedResult = await N8nWorkflowService.getExecution(exec.id, user.id);
                
                if (detailedResult.execution) {
                  const execData = detailedResult.execution;
                  
                  // Debug: Log execution data structure (remove in production if not needed)
                  // console.log('Execution data structure:', {
                  //   hasResultData: !!execData.data?.resultData,
                  //   hasRunData: !!execData.data?.resultData?.runData,
                  //   nodeNames: execData.data?.resultData?.runData ? Object.keys(execData.data.resultData.runData) : [],
                  //   httpRequestData: execData.data?.resultData?.runData?.['HTTP Request']?.[0]?.data,
                  //   webhookData: execData.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data
                  // });
                  
                  // Extract recipient username from execution data
                  // Check HTTP Request node output first (where we fetch username)
                  let recipientUsername = 'Unknown';
                  
                  // Try multiple paths for HTTP Request node output
                  const httpRequestNode = execData.data?.resultData?.runData?.['HTTP Request'];
                  if (httpRequestNode) {
                    // Try main array path
                    if (httpRequestNode[0]?.data?.main?.[0]?.[0]?.json?.username) {
                      recipientUsername = httpRequestNode[0].data.main[0][0].json.username;
                    } else if (httpRequestNode[0]?.data?.json?.username) {
                      recipientUsername = httpRequestNode[0].data.json.username;
                    } else if (httpRequestNode[0]?.data?.main?.[0]?.[0]?.json?.id) {
                      // If we got the ID, try to extract username from other fields
                      const nodeData = httpRequestNode[0].data.main[0][0].json;
                      recipientUsername = nodeData.username || nodeData.name || 'Unknown';
                    }
                  }
                  
                  // Fallback paths if HTTP Request node not found
                  if (recipientUsername === 'Unknown') {
                    recipientUsername = 
                      execData.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data?.main?.[0]?.[0]?.json?.body?.entry?.[0]?.messaging?.[0]?.sender?.id ||
                      execData.data?.data?.body?.sender?.username ||
                      execData.data?.data?.body?.entry?.[0]?.messaging?.[0]?.sender?.id ||
                      execData.data?.body?.from?.username ||
                      execData.data?.body?.entry?.[0]?.changes?.[0]?.value?.from?.username ||
                      execData.data?.sender_name ||
                      execData.data?.from?.username ||
                      'Unknown';
                  }

                  // Extract message text from webhook body
                  // Primary path: $json.body.entry[0].messaging[0].message.text
                  let message = 'Workflow execution';
                  
                  // Try to get message from Instagram Webhook node output
                  const webhookNode = execData.data?.resultData?.runData?.['Instagram Webhook'];
                  if (webhookNode) {
                    const webhookData = webhookNode[0]?.data?.main?.[0]?.[0]?.json;
                    // Primary path: body.entry[0].messaging[0].message.text
                    if (webhookData?.body?.entry?.[0]?.messaging?.[0]?.message?.text) {
                      message = webhookData.body.entry[0].messaging[0].message.text;
                    } 
                    // For comments: body.entry[0].changes[0].value.text
                    else if (webhookData?.body?.entry?.[0]?.changes?.[0]?.value?.text) {
                      message = webhookData.body.entry[0].changes[0].value.text;
                    }
                    // Also check direct body path
                    else if (webhookData?.body?.entry?.[0]?.messaging?.[0]?.message?.text) {
                      message = webhookData.body.entry[0].messaging[0].message.text;
                    }
                  }
                  
                  // Fallback paths - check other possible locations
                  if (message === 'Workflow execution') {
                    message = 
                      execData.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data?.main?.[0]?.[0]?.json?.body?.entry?.[0]?.messaging?.[0]?.message?.text ||
                      execData.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data?.main?.[0]?.[0]?.json?.body?.entry?.[0]?.changes?.[0]?.value?.text ||
                      execData.data?.data?.body?.entry?.[0]?.messaging?.[0]?.message?.text ||
                      execData.data?.data?.body?.entry?.[0]?.changes?.[0]?.value?.text ||
                      execData.data?.data?.body?.text ||
                      execData.data?.data?.body?.message ||
                      execData.data?.message ||
                      execData.data?.text ||
                      'Workflow execution';
                  }

                  return {
                    id: `n8n-${exec.id}`,
                    activity_type: 'dm',
                    target_username: recipientUsername,
                    message: message,
                    metadata: {},
                  status: execData.finished ? (execData.stoppedAt ? 'success' : 'failed') : 'pending' as 'success' | 'failed' | 'pending',
                  created_at: execData.startedAt || execData.createdAt || new Date().toISOString(),
                  isN8nExecution: true,
                  executionData: execData,
                } as Activity;
                }
                // Return basic execution data if detailed execution data is not available
                // Try to extract from basic exec structure
                let basicUsername = 'Unknown';
                let basicMessage = 'Workflow execution';
                
                if (exec.data?.resultData?.runData?.['HTTP Request']?.[0]?.data?.main?.[0]?.[0]?.json?.username) {
                  basicUsername = exec.data.resultData.runData['HTTP Request'][0].data.main[0][0].json.username;
                } else if (exec.data?.resultData?.runData?.['HTTP Request']?.[0]?.data?.json?.username) {
                  basicUsername = exec.data.resultData.runData['HTTP Request'][0].data.json.username;
                } else {
                  basicUsername = exec.data?.sender_name || exec.data?.from?.username || 'Unknown';
                }
                
                // Extract message from body.entry[0].messaging[0].message.text
                const webhookDataBasic = exec.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data?.main?.[0]?.[0]?.json;
                if (webhookDataBasic?.body?.entry?.[0]?.messaging?.[0]?.message?.text) {
                  basicMessage = webhookDataBasic.body.entry[0].messaging[0].message.text;
                } else if (webhookDataBasic?.body?.entry?.[0]?.changes?.[0]?.value?.text) {
                  basicMessage = webhookDataBasic.body.entry[0].changes[0].value.text;
                } else {
                  basicMessage = exec.data?.message || exec.data?.text || 'Workflow execution';
                }
                
                return {
                  id: `n8n-${exec.id}`,
                  activity_type: 'dm',
                  target_username: basicUsername,
                  message: basicMessage,
                  metadata: {},
                  status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending' as 'success' | 'failed' | 'pending',
                  created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
                  isN8nExecution: true,
                  executionData: exec,
                } as Activity;
              } catch (execErr) {
                console.error(`Error fetching detailed execution ${exec.id}:`, execErr);
                // Return basic execution data if detailed fetch fails
                // Try to extract from basic exec structure
                let basicUsername = 'Unknown';
                let basicMessage = 'Workflow execution';
                
                if (exec.data?.resultData?.runData?.['HTTP Request']?.[0]?.data?.main?.[0]?.[0]?.json?.username) {
                  basicUsername = exec.data.resultData.runData['HTTP Request'][0].data.main[0][0].json.username;
                } else if (exec.data?.resultData?.runData?.['HTTP Request']?.[0]?.data?.json?.username) {
                  basicUsername = exec.data.resultData.runData['HTTP Request'][0].data.json.username;
                } else {
                  basicUsername = exec.data?.sender_name || exec.data?.from?.username || 'Unknown';
                }
                
                // Extract message from body.entry[0].messaging[0].message.text
                const webhookDataError = exec.data?.resultData?.runData?.['Instagram Webhook']?.[0]?.data?.main?.[0]?.[0]?.json;
                if (webhookDataError?.body?.entry?.[0]?.messaging?.[0]?.message?.text) {
                  basicMessage = webhookDataError.body.entry[0].messaging[0].message.text;
                } else if (webhookDataError?.body?.entry?.[0]?.changes?.[0]?.value?.text) {
                  basicMessage = webhookDataError.body.entry[0].changes[0].value.text;
                } else {
                  basicMessage = exec.data?.message || exec.data?.text || 'Workflow execution';
                }
                
                return {
                  id: `n8n-${exec.id}`,
                  activity_type: 'dm',
                  target_username: basicUsername,
                  message: basicMessage,
                  metadata: {},
                  status: exec.finished ? (exec.stoppedAt ? 'success' : 'failed') : 'pending' as 'success' | 'failed' | 'pending',
                  created_at: exec.startedAt || exec.createdAt || new Date().toISOString(),
                  isN8nExecution: true,
                  executionData: exec,
                } as Activity;
              }
            });

            const executionDetails = await Promise.all(executionDetailsPromises);
            n8nExecutions = executionDetails.filter((exec): exec is Activity => exec !== null);
          }
        } catch (n8nError) {
          console.error('Error fetching n8n executions:', n8nError);
        }
      }

      // Combine and sort all activities
      const allActivities = [
        ...(activitiesData || []),
        ...n8nExecutions
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActivities(allActivities);
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

            <div className="space-y-3">
              {activities.map((activity) => {
                const config = activityConfig[activity.activity_type as keyof typeof activityConfig] || activityConfig.dm;
                const StatusIcon = statusConfig[activity.status].icon;
                const Icon = config.icon;

                return (
                  <div
                    key={activity.id}
                    className="bg-white rounded-xl border-2 border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`${config.bg} p-3 rounded-xl flex-shrink-0 shadow-sm`}>
                        <Icon className={`w-6 h-6 ${config.color}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${statusConfig[activity.status].bg}`}>
                            <StatusIcon className={`w-3.5 h-3.5 ${statusConfig[activity.status].color}`} />
                            <span className={`text-xs font-semibold ${statusConfig[activity.status].color} capitalize`}>
                              {activity.status}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 ml-auto font-medium">{formatTimeAgo(activity.created_at)}</span>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                            {activity.target_username[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-gray-900">@{activity.target_username}</span>
                        </div>

                        {activity.message && (
                          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-3">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{activity.message}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-4 text-xs">
                          {activity.metadata.following !== undefined && (
                            <span className={`flex items-center gap-1 font-medium ${activity.metadata.following ? 'text-green-600' : 'text-gray-500'}`}>
                              {activity.metadata.following ? '✓ Following' : '○ Not following'}
                            </span>
                          )}
                          {activity.metadata.seen !== undefined && (
                            <span className="text-gray-500 font-medium">
                              Seen: {activity.metadata.seen ? 'Yes' : 'No'}
                            </span>
                          )}
                          <span className="text-gray-400 ml-auto font-medium">{formatDateTime(activity.created_at)}</span>
                        </div>
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
