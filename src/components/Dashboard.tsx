import { useState, useEffect } from 'react';
import { MessageSquare, Eye, Zap, MessageCircle, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { n8nService } from '../lib/n8nService';
import KPICard from './KPICard';
import RecentActivity from './RecentActivity';
import TopAutomations from './TopAutomations';
import InstagramFeed from './InstagramFeed';
import InstagramConnectionStatus from './InstagramConnectionStatus';

interface DashboardStats {
  dmsTriggered: number;
  dmOpenRate: number;
  activeAutomations: number;
  commentReplies: number;
  uniqueUsers: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { displayName } = useTheme();
  const userName = displayName?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const [stats, setStats] = useState<DashboardStats>({
    dmsTriggered: 0,
    dmOpenRate: 0,
    activeAutomations: 0,
    commentReplies: 0,
    uniqueUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
      // Get metrics from N8N service
      const metrics = await n8nService.getWorkflowMetrics(user!.id);
      
      // Get active automations count from Supabase
      const { data: automations, error: automationsError } = await supabase
        .from('automations')
        .select('id, status')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      const activeAutomations = automations?.filter(a => a.status === 'active').length || 0;

      setStats({
        dmsTriggered: metrics.dmsTriggered,
        dmOpenRate: metrics.dmOpenRate,
        activeAutomations,
        commentReplies: metrics.commentReplies,
        uniqueUsers: metrics.uniqueUsers,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">
                Welcome back, {userName}!
              </h1>
              <p className="text-lg text-gray-600">
                Your automations are running smoothly. Here's what's happening today.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-3 bg-white px-6 py-3 rounded-xl shadow-sm border border-gray-200">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">All Systems Operational</span>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <InstagramConnectionStatus />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-10">
          <KPICard
            title="DMs Triggered"
            value={loading ? '-' : stats.dmsTriggered.toLocaleString()}
            icon={MessageSquare}
            iconColor="text-blue-600"
            iconBgColor="bg-gradient-to-br from-blue-50 to-blue-100"
          />
          <KPICard
            title="DM Open Rate"
            value={loading ? '-' : `${stats.dmOpenRate}%`}
            icon={Eye}
            iconColor="text-emerald-600"
            iconBgColor="bg-gradient-to-br from-emerald-50 to-emerald-100"
          />
          <KPICard
            title="Active Automations"
            value={loading ? '-' : stats.activeAutomations.toString()}
            icon={Zap}
            iconColor="text-amber-600"
            iconBgColor="bg-gradient-to-br from-amber-50 to-amber-100"
          />
          <KPICard
            title="Comment Replies"
            value={loading ? '-' : stats.commentReplies.toLocaleString()}
            icon={MessageCircle}
            iconColor="text-rose-600"
            iconBgColor="bg-gradient-to-br from-rose-50 to-rose-100"
          />
          <KPICard
            title="Unique Users Contacted"
            value={loading ? '-' : stats.uniqueUsers.toLocaleString()}
            icon={Users}
            iconColor="text-cyan-600"
            iconBgColor="bg-gradient-to-br from-cyan-50 to-cyan-100"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RecentActivity />
          <TopAutomations />
        </div>

        <div className="mb-8">
          <InstagramFeed />
        </div>
      </div>
    </div>
  );
}
