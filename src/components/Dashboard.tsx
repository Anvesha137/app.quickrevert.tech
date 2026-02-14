import { useState, useEffect } from 'react';
import { MessageSquare, Eye, Zap, MessageCircle, Users, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import KPICard from './KPICard';
import InstagramFeed from './InstagramFeed';
import InstagramConnectionStatus from './InstagramConnectionStatus';

interface DashboardStats {
  dmsTriggered: number;
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
    activeAutomations: 0,
    commentReplies: 0,
    uniqueUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAnnouncement, setShowAnnouncement] = useState(true);

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

      setStats({
        dmsTriggered: dms.length,
        activeAutomations,
        commentReplies: comments.length,
        uniqueUsers: uniqueUsersCount || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Reset stats to default values on error to prevent undefined values
      setStats({
        dmsTriggered: 0,
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
      {/* Release Announcement Banner */}
      {showAnnouncement && (
        <div className="sticky top-0 z-50 bg-[#ff6b00] text-white px-4 py-1 flex items-center justify-between shadow-sm shadow-orange-100">
          <div className="flex items-center gap-2 mx-auto">
            <span className="text-lg">🚀</span>
            <span className="font-bold">Big News! New Products Page is live.</span>
            <button className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-sm font-semibold transition-colors ml-2">
              Try it →
            </button>
          </div>
          <button
            onClick={() => setShowAnnouncement(false)}
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-8">
        {/* Pro Upgrade Banner */}
        <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-red-100">
          <div>
            <h2 className="text-xl font-bold mb-1">Unlock Pro Power!</h2>
            <p className="text-red-100">Get unlimited automations, contacts & advanced analytics.</p>
          </div>
          <button className="bg-white text-red-600 px-6 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-colors shadow-sm whitespace-nowrap">
            Upgrade to Pro
          </button>
        </div>
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="mt-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
                Hello, {userName}👋
              </h1>
              <p className="text-lg text-gray-600">
                Your automations are running smoothly. Here's what's happening today.
              </p>
            </div>
            <a
              href="https://quickrevert.tech/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-3 bg-white px-6 py-3 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">Contact Support</span>
            </a>
          </div>
        </div>

        <div className="mb-8">
          <InstagramConnectionStatus />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <KPICard
            title="DMs Triggered"
            value={loading ? '-' : (stats.dmsTriggered || 0).toLocaleString()}
            icon={MessageSquare}
            iconColor="text-blue-600"
            iconBgColor="bg-gradient-to-br from-blue-50 to-blue-100"
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



        <div className="mb-8">
          <InstagramFeed />
        </div>
      </div>
    </div>
  );
}
