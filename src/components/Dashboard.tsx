import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Zap,
  MessageCircle,
  Users,
  TrendingUp,
  Hand,
  User,
  Headset,
  Instagram,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import KPICard from './KPICard';
import InstagramFeed from './InstagramFeed';
import ProBanner from './ProBanner';
import DMsChart from './DMsChart';
import SetupProgress from './SetupProgress';
import TopPerforming from './TopPerforming';

interface DashboardStats {
  dmsTriggered: number;
  activeAutomations: number;
  commentReplies: number;
  uniqueUsers: number;
  followersCount?: number | null;
  initialFollowersCount?: number | null;
  followersLastUpdated?: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { displayName } = useTheme();
  const [stats, setStats] = useState<DashboardStats>({
    dmsTriggered: 0,
    activeAutomations: 0,
    commentReplies: 0,
    uniqueUsers: 0,
    followersCount: null,
    initialFollowersCount: null,
    followersLastUpdated: null
  });
  const [loading, setLoading] = useState(true);
  const [instagramAccount, setInstagramAccount] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
      // 0. Check Instagram Connection
      const { data: instagram } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user!.id)
        .limit(1);

      const instaAccount = instagram?.[0];
      setInstagramAccount(instaAccount);

      const { data: automations, error: automationsError } = await supabase
        .from('automations')
        .select('id, status')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      // 1. Active Automations
      const activeAutomationsCount = automations?.filter(a => a.status === 'active').length || 0;

      // 2. Fetch Activities for DMs and Comments
      const { data: activities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('activity_type, target_username')
        .eq('user_id', user!.id);

      if (activitiesError) throw activitiesError;

      const dmsCount = activities?.filter(a => ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'].includes(a.activity_type)).length || 0;
      const commentsCount = activities?.filter(a => ['reply', 'comment', 'reply_to_comment', 'incoming_comment', 'post_comment'].includes(a.activity_type)).length || 0;

      // 3. Unique Users (Source of Truth: Contacts Table)
      const { count: uniqueUsersCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      const uniqueFromActivities = new Set(
        activities
          ?.map(a => a.target_username)
          .filter(u => u && u !== 'Unknown' && !u.includes('undefined'))
      ).size;

      setStats({
        dmsTriggered: dmsCount,
        activeAutomations: activeAutomationsCount,
        commentReplies: commentsCount,
        uniqueUsers: Math.max(uniqueUsersCount || 0, uniqueFromActivities),
        followersCount: instaAccount?.followers_count,
        initialFollowersCount: instaAccount?.initial_followers_count,
        followersLastUpdated: instaAccount?.followers_last_updated
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStepProgress = (id: number) => {
    switch (id) {
      case 1: return instagramAccount ? true : false;
      case 2: return stats.activeAutomations > 0;
      case 3: return (stats.dmsTriggered > 0 || stats.commentReplies > 0);
      case 4: return !!stats.followersLastUpdated;
      default: return false;
    }
  };

  const setupTasks = [
    { label: 'Connect Instagram', completed: getStepProgress(1) },
    { label: 'Create Automation', completed: getStepProgress(2) },
    { label: 'Test Automation', completed: getStepProgress(3) },
    { label: 'Unlock Advance Analytics', completed: getStepProgress(4) },
  ];

  const overallProgress = Math.round((setupTasks.filter(t => t.completed).length / setupTasks.length) * 100);

  return (
    <div className="flex-1 relative min-h-screen overflow-x-hidden">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-slate-300/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-slate-500/10 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-slate-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=")`
        }}></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-gray-800 tracking-tight">
              Hello, {displayName?.split(' ')[0] || 'Creator'}! <Hand className="inline w-8 h-8 text-yellow-500 animate-bounce" />
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              className="w-11 h-11 rounded-xl backdrop-blur-xl bg-white/60 border border-white/40 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center overflow-hidden"
            >
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <User className="w-5 h-5 text-gray-500" />
              </div>
            </Link>
            <a
              href="https://quickrevert.tech/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-2"
            >
              <Headset className="w-5 h-5" />
              Contact Support
            </a>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="space-y-6">
          {/* Pro Banner Full Width - Always at the very top */}
          <ProBanner isCompact={false} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Banners & Analytics */}
            <div className="lg:col-span-2 space-y-6">
              {/* Connection Status Banner (Thin) */}
              <div>
                {instagramAccount ? (
                  <div className="rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 p-4 shadow-xl shadow-purple-500/20 group transition-all hover:scale-[1.01]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 transition-transform group-hover:rotate-6">
                        <Instagram className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white font-bold text-base truncate">@{instagramAccount.username}</h3>
                        <p className="text-white/80 text-xs font-medium">Instagram Connected</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-blue-600/10 backdrop-blur-xl border border-blue-500/20 p-4 shadow-xl shadow-blue-500/5 group transition-all hover:scale-[1.01]">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 backdrop-blur-sm flex items-center justify-center border border-blue-400/30 shrink-0">
                          <AlertCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-blue-900 font-bold text-base truncate">Instagram Not Connected</h3>
                          <p className="text-blue-600/70 text-xs font-medium">Connect your account now</p>
                        </div>
                      </div>
                      <a
                        href="/connect-accounts"
                        className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:shadow-blue-500/20 transition-all hover:scale-105 whitespace-nowrap text-sm"
                      >
                        Connect Now
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Unified 6 KPI Cards Grid - Shifted UP */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                <KPICard
                  title="DMs Triggered"
                  value={loading ? '-' : stats.dmsTriggered.toLocaleString()}
                  icon={MessageSquare}
                  iconColor="text-blue-600"
                  iconBgColor="bg-blue-500/20"
                />
                <KPICard
                  title="Active Automations"
                  value={loading ? '-' : stats.activeAutomations.toString()}
                  icon={Zap}
                  iconColor="text-purple-600"
                  iconBgColor="bg-purple-500/20"
                />
                <KPICard
                  title="Comment Replies"
                  value={loading ? '-' : stats.commentReplies.toLocaleString()}
                  icon={MessageCircle}
                  iconColor="text-green-600"
                  iconBgColor="bg-green-500/20"
                />
                <KPICard
                  title="Unique Users"
                  value={loading ? '-' : stats.uniqueUsers.toLocaleString()}
                  icon={Users}
                  iconColor="text-emerald-600"
                  iconBgColor="bg-emerald-500/20"
                />
                <KPICard
                  title="Current Followers"
                  value={loading ? '-' : (stats.followersCount || 0).toLocaleString()}
                  icon={Users}
                  iconColor="text-orange-600"
                  iconBgColor="bg-orange-500/20"
                />
                <KPICard
                  title="Followers Gained"
                  value={loading ? '-' : ((stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                  icon={TrendingUp}
                  iconColor="text-cyan-600"
                  iconBgColor="bg-cyan-500/20"
                />
              </div>

              {/* Main Chart */}
              <DMsChart />
            </div>

            {/* Right Column: Sidebar */}
            <div className="space-y-6">
              <SetupProgress progress={overallProgress} tasks={setupTasks} />
              <TopPerforming />
            </div>
          </div>
        </div>

        {/* Bottom Feed Section */}
        <div className="mt-8">
          <InstagramFeed />
        </div>
      </div>
    </div>
  );
}
