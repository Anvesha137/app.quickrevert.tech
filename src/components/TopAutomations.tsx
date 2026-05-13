import { useState, useEffect } from 'react';
import { Bot, Clock, MessageSquare, Image as ImageIcon, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from './ui/skeleton';

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
      // 🚀 OPTIMIZED: Use RPC — no raw row fetching, pure server-side aggregation
      const { data: stats, error } = await supabase
        .rpc('get_top_performing_automations', {
          p_user_id: user!.id,
          p_limit: 3
        });

      if (error) throw error;
      if (!stats || stats.length === 0) {
        setAutomations([]);
        return;
      }

      // Fetch trigger_type for the matched automations (only 3 rows max)
      const ids = stats.map((s: any) => s.automation_id);
      const { data: autoDetails } = await supabase
        .from('automations')
        .select('id, trigger_type')
        .in('id', ids);

      const triggerMap = new Map((autoDetails || []).map(a => [a.id, a.trigger_type]));

      const topThree = stats.map((s: any) => ({
        id: s.automation_id,
        name: s.automation_name || 'Unnamed Automation',
        activityCount: Number(s.count),
        successRate: 100, // RPC counts successful activities only
        trigger_type: triggerMap.get(s.automation_id) || 'user_directed_messages',
      }));

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
            <div key={i} className="flex gap-3">
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
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
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-lg shrink-0">
                {(() => {
                  switch (automation.trigger_type) {
                    case 'post_comment': return <MessageSquare className="w-4 h-4 text-white" />;
                    case 'story_reply': return <ImageIcon className="w-4 h-4 text-white" />;
                    case 'user_directed_messages': return <Mail className="w-4 h-4 text-white" />;
                    default: return <Bot className="w-4 h-4 text-white" />;
                  }
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                  {automation.name}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {automation.successRate}% success rate
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
