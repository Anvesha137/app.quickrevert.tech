import { useState, useEffect } from 'react';
import { Zap, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { n8nService } from '../lib/n8nService';

interface Automation {
  id: string;
  name: string;
  activityCount: number;
  successRate: number;
  trigger_type: string;
}

export default function TopAutomations() {
  const { user } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchTopAutomations();
    }
  }, [user]);

  // Set up periodic refresh of top automations
  useEffect(() => {
    if (user) {
      const interval = setInterval(fetchTopAutomations, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchTopAutomations = async () => {
    try {
      // Get all automations from Supabase
      const { data: allAutomations, error: automationsError } = await supabase
        .from('automations')
        .select('id, name, trigger_type')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      if (!allAutomations || allAutomations.length === 0) {
        setAutomations([]);
        return;
      }
      
      // Try to get metrics from N8N service
      let metrics;
      try {
        metrics = await n8nService.getWorkflowMetrics(user!.id);
      } catch (n8nError) {
        console.error('Error fetching metrics from N8N:', n8nError);
        // Fallback: get metrics from Supabase
        const { data: activities, error: activitiesError } = await supabase
          .from('automation_activities')
          .select('automation_id, activity_type, activity_data')
          .eq('user_id', user!.id);
        
        if (activitiesError) throw activitiesError;
        
        const dms = activities?.filter(a => a.activity_type === 'dm_sent') || [];
        const comments = activities?.filter(a => a.activity_type === 'reply') || [];
        
        const seenDms = dms.filter(dm => dm.activity_data?.metadata?.seen === true).length;
        const dmOpenRate = dms.length > 0 ? Math.round((seenDms / dms.length) * 100) : 0;
        
        metrics = {
          dmsTriggered: dms.length,
          dmOpenRate,
          commentReplies: comments.length,
          uniqueUsers: 0,
          recentActivities: [],
        };
      }
      
      // Map automation stats based on metrics
      const automationStats = allAutomations.map(auto => {
        // For now, we'll assign metrics based on the automation name or ID
        // In a real implementation, we would have more specific metrics per automation
        const activityCount = metrics.commentReplies; // Using comment replies as a proxy for now
        const successRate = metrics.dmOpenRate; // Using DM open rate as a proxy for now
        
        return {
          id: auto.id,
          name: auto.name,
          activityCount,
          successRate,
          trigger_type: auto.trigger_type,
        };
      });

      const topThree = automationStats
        .sort((a, b) => b.activityCount - a.activityCount)
        .slice(0, 3);

      setAutomations(topThree);
    } catch (error) {
      console.error('Error fetching top automations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Set up periodic refresh of top automations
  useEffect(() => {
    if (user) {
      const interval = setInterval(fetchTopAutomations, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Top Performing Automations</h2>
        <p className="text-sm text-gray-600 mb-4">Your best performing workflows</p>
        <div className="space-y-3">
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

  if (automations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Top Performing Automations</h2>
        <p className="text-sm text-gray-600 mb-4">Your best performing workflows</p>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No active automations yet</p>
          <p className="text-xs text-gray-400 mt-1">Create automations to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Top Performing Automations</h2>
      <p className="text-sm text-gray-600 mb-4">Your best performing workflows</p>

      <div className="space-y-3">
        {automations.map((automation) => {

          return (
            <div
              key={automation.id}
              onClick={() => navigate('/automation')}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group cursor-pointer"
            >
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-lg">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                  {automation.name}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {automation.activityCount} executions • {automation.successRate}% success rate
                </p>
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}
