import { useEffect, useState } from 'react';
import { Search, Zap, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AutomationActivityDetail from './AutomationActivityDetail';

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  activityCount: number;
  lastActivity: string | null;
}

export default function ActivityLog() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAutomations();
  }, []);

  async function fetchAutomations() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: automationsData, error: automationsError } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });

      if (automationsError) throw automationsError;

      // Get n8n workflows for each automation
      const { data: workflowsData } = await supabase
        .from('n8n_workflows')
        .select('automation_id, n8n_workflow_id')
        .not('automation_id', 'is', null);

      const workflowMap = new Map<string, string[]>();
      workflowsData?.forEach((wf) => {
        if (wf.automation_id) {
          const existing = workflowMap.get(wf.automation_id) || [];
          existing.push(wf.n8n_workflow_id);
          workflowMap.set(wf.automation_id, existing);
        }
      });

      // Fetch execution counts from n8n for each workflow
      const executionCounts = new Map<string, { count: number; lastActivity: string | null }>();
      
      for (const automation of automationsData || []) {
        const workflowIds = workflowMap.get(automation.id) || [];
        let totalExecutions = 0;
        let lastExecution: string | null = null;

        for (const workflowId of workflowIds) {
          try {
            const { N8nWorkflowService } = await import('../lib/n8nService');
            const executionsResult = await N8nWorkflowService.getExecutions(workflowId, 100, session.user.id);
            
            if (executionsResult.executions) {
              totalExecutions += executionsResult.executions.length;
              
              // Find most recent execution
              executionsResult.executions.forEach((exec: any) => {
                const execTime = exec.startedAt || exec.createdAt;
                if (execTime && (!lastExecution || new Date(execTime) > new Date(lastExecution))) {
                  lastExecution = execTime;
                }
              });
            }
          } catch (err) {
            console.error(`Error fetching executions for workflow ${workflowId}:`, err);
          }
        }

        if (totalExecutions > 0 || lastExecution) {
          executionCounts.set(automation.id, {
            count: totalExecutions,
            lastActivity: lastExecution,
          });
        }
      }

      const automationsWithStats = automationsData?.map((automation) => {
        const stats = executionCounts.get(automation.id);
        return {
          ...automation,
          activityCount: stats?.count || 0,
          lastActivity: stats?.lastActivity || null,
        };
      }) || [];

      setAutomations(automationsWithStats);
      if (automationsWithStats.length > 0 && !selectedAutomation) {
        setSelectedAutomation(automationsWithStats[0].id);
      }
    } catch (error) {
      console.error('Error fetching automations:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAutomations = automations.filter((automation) =>
    automation.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function formatTimeAgo(date: string | null) {
    if (!date) return 'No activity';

    const now = new Date();
    const activityDate = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - activityDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  }

  if (loading) {
    return (
      <div className="fixed top-0 bottom-0 left-64 right-0 flex bg-gray-50">
        <div className="w-96 border-r border-gray-200 bg-white p-4">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 bottom-0 left-64 right-0 flex bg-gradient-to-br from-gray-50 to-green-50/20">
      <div className="w-96 border-r border-gray-200 bg-white/80 backdrop-blur-sm flex flex-col h-full shadow-lg">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-white to-green-50/30">
          <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Activity Log</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search automations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm hover:border-gray-300 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredAutomations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Activity className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 font-medium text-lg mb-2">No automations found</p>
              <p className="text-sm text-gray-500">
                Create automations to see their activity logs here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredAutomations.map((automation) => (
                <button
                  key={automation.id}
                  onClick={() => setSelectedAutomation(automation.id)}
                  className={`w-full p-4 flex items-center gap-4 hover:bg-gradient-to-r hover:from-green-50 hover:to-transparent transition-all text-left group ${
                    selectedAutomation === automation.id
                      ? 'bg-gradient-to-r from-green-50 via-emerald-50 to-transparent border-l-4 border-green-600 shadow-sm'
                      : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-xl ${automation.is_active ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-gray-200'} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow`}>
                    <Zap className={`w-7 h-7 ${automation.is_active ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-gray-900 truncate flex-1">
                        {automation.name}
                      </p>
                      <span className={`w-2.5 h-2.5 rounded-full ${automation.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                    </div>
                    <p className="text-xs text-gray-600 mb-2 truncate capitalize font-medium">
                      {automation.trigger_type.replace('_', ' ')}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                        <span className="text-blue-700 font-semibold">
                          {automation.activityCount} execution{automation.activityCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-gray-500 font-semibold px-2 py-0.5 bg-gray-100 rounded-full">{formatTimeAgo(automation.lastActivity)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 h-full overflow-hidden">
        {selectedAutomation ? (
          <AutomationActivityDetail automationId={selectedAutomation} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-white via-green-50/30 to-emerald-50/20">
            <div className="text-center">
              <div className="w-28 h-28 bg-gradient-to-br from-green-100 to-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                <Activity className="w-14 h-14 text-green-600" />
              </div>
              <p className="text-gray-900 font-bold text-2xl mb-2">Select an automation</p>
              <p className="text-base text-gray-600">Choose an automation from the list to view its activity</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
