import { useState, useEffect } from 'react';
import { Zap, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

  const fetchTopAutomations = async () => {
    try {
      const { data: allAutomations, error: automationsError } = await supabase
        .from('automations')
        .select('id, name, trigger_type')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      if (!allAutomations || allAutomations.length === 0) {
        setAutomations([]);
        return;
      }

      const { data: activities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('automation_id, status')
        .eq('user_id', user!.id);

      if (activitiesError) throw activitiesError;

      const automationStats = allAutomations.map(auto => {
        const autoActivities = activities?.filter(a => a.automation_id === auto.id) || [];
        const successCount = autoActivities.filter(a => a.status === 'success').length;
        const successRate = autoActivities.length > 0
          ? Math.round((successCount / autoActivities.length) * 100)
          : 0;

        return {
          id: auto.id,
          name: auto.name,
          activityCount: autoActivities.length,
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

      <button
        onClick={() => navigate('/automation')}
        className="w-full mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 py-2 hover:bg-blue-50 rounded-lg transition-colors"
      >
        View all automations
      </button>
    </div>
  );
}
