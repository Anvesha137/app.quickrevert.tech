import { useState, useEffect } from 'react';
import { MessageSquare, Eye, Zap, MessageCircle, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
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
      setLoading(true); // Reset loading state when user changes
      fetchDashboardStats();
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
      const { data: automations, error: automationsError } = await supabase
        .from('automations')
        .select('id, status')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      // 1. Active Automations
      const activeAutomations = automations?.filter(a => a.status === 'active').length || 0;

      // 2. Fetch Activities for DMs and Comments
      // 2. Fetch Activities for DMs and Comments
      // Fetching all fields to be consistent with RecentActivity and avoid any RLS column restrictions
      const { data: activities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user!.id);

      if (activitiesError) throw activitiesError;

      const dms = activities?.filter(a => ['dm', 'dm_sent', 'send_dm'].includes(a.activity_type)) || [];
      const comments = activities?.filter(a => ['reply', 'comment', 'reply_to_comment'].includes(a.activity_type)) || [];

      // 3. Unique Users (Source of Truth: Contacts Table)
      const { count: uniqueUsersCount, error: contactsError } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      if (contactsError) console.error("Error fetching contacts count:", contactsError);

      // 4. DM Open Rate (Placeholder/Heuristic)
      // Since we don't reliably track 'read' events in a way that maps to 'dm_sent', 
      // and the user accepts 0%, we will use the metadata.seen if available, else 0.
      const seenDms = dms.filter(dm => dm.metadata?.seen === true).length;
      const dmOpenRate = dms.length > 0 ? Math.round((seenDms / dms.length) * 100) : 0;

      setStats({
        dmsTriggered: dms.length,
        dmOpenRate,
        activeAutomations,
        commentReplies: comments.length,
        uniqueUsers: uniqueUsersCount || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Reset stats to default values on error to prevent undefined values
      setStats({
        dmsTriggered: 0,
        dmOpenRate: 0,
        activeAutomations: 0,
        commentReplies: 0,
        uniqueUsers: 0,
      });
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
            value={loading ? '-' : (stats.dmsTriggered || 0).toLocaleString()}
            icon={MessageSquare}
            iconColor="text-blue-600"
            iconBgColor="bg-gradient-to-br from-blue-50 to-blue-100"
          />
          <KPICard
            title="DM Open Rate"
            value={loading ? '-' : `${stats.dmOpenRate || 0}%`}
            icon={Eye}
            iconColor="text-emerald-600"
            iconBgColor="bg-gradient-to-br from-emerald-50 to-emerald-100"
          />
          <KPICard
            title="Active Automations"
            value={loading ? '-' : (stats.activeAutomations || 0).toString()}
            icon={Zap}
            iconColor="text-amber-600"
            iconBgColor="bg-gradient-to-br from-amber-50 to-amber-100"
          />
          <KPICard
            title="Comment Replies"
            value={loading ? '-' : (stats.commentReplies || 0).toLocaleString()}
            icon={MessageCircle}
            iconColor="text-rose-600"
            iconBgColor="bg-gradient-to-br from-rose-50 to-rose-100"
          />
          <KPICard
            title="Unique Users Contacted"
            value={loading ? '-' : (stats.uniqueUsers || 0).toLocaleString()}
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
