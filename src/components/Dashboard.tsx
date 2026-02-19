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
    <div className="flex-1 relative min-h-screen overflow-x-hidden bg-[#fafbff] font-outfit">
      {/* Animated Background Blobs - Refined */}
      <div className="fixed inset-0 -z-10 bg-slate-50/50">
        <div className="absolute top-0 -left-10 w-[500px] h-[500px] bg-blue-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-10 w-[500px] h-[500px] bg-purple-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/4 w-[600px] h-[600px] bg-indigo-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg shadow-blue-200">
                Dashboard
              </span>
              <div className="w-1 h-1 rounded-full bg-gray-300" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Overview</p>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight">
              Hello, {displayName?.split(' ')[0] || 'Creator'} <span className="inline-block animate-bounce-slow">👋</span>
            </h2>
            <p className="text-lg text-gray-500 font-medium">
              Here's what's happening with your Instagram today.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/settings"
              className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center group"
            >
              <User className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </Link>
            <a
              href="https://quickrevert.tech/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-2xl bg-gray-900 text-white font-bold shadow-2xl shadow-gray-200 hover:bg-gray-800 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 group"
            >
              <Headset className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              Support
            </a>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both">
          {/* Pro Banner */}
          <div className="transform transition-transform hover:scale-[1.005]">
            <ProBanner isCompact={false} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Column: Metrics & Analytics */}
            <div className="lg:col-span-2 space-y-8">
              {/* Connection Status Banner */}
              <div className="group">
                {instagramAccount ? (
                  <div className="relative overflow-hidden rounded-[2rem] bg-white border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-all duration-500">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-500/10 transition-colors" />
                    <div className="flex items-center justify-between gap-4 relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-[1px]">
                          <div className="w-full h-full rounded-2xl bg-white flex items-center justify-center transition-transform group-hover:scale-95">
                            <Instagram className="w-7 h-7 text-blue-600" />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">Authenticated</p>
                          <h3 className="text-xl font-black text-gray-900 leading-none">@{instagramAccount.username}</h3>
                        </div>
                      </div>
                      <Link to="/connect-accounts" className="p-3 rounded-xl bg-gray-50 text-gray-400 hover:text-blue-600 transition-colors">
                        <TrendingUp className="w-5 h-5" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[2rem] bg-blue-600 p-8 shadow-2xl shadow-blue-200 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 text-center md:text-left">
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-white">Unlock Your Potential</h3>
                        <p className="text-blue-100 font-medium">Connect your Instagram to start automating messages.</p>
                      </div>
                      <a
                        href="/connect-accounts"
                        className="px-8 py-4 bg-white text-blue-600 font-black rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
                      >
                        Connect Now
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <KPICard
                  title="Total DMs"
                  value={loading ? '-' : stats.dmsTriggered.toLocaleString()}
                  icon={MessageSquare}
                  iconColor="text-blue-600"
                  iconBgColor="bg-blue-50"
                />
                <KPICard
                  title="Automations"
                  value={loading ? '-' : stats.activeAutomations.toString()}
                  icon={Zap}
                  iconColor="text-purple-600"
                  iconBgColor="bg-purple-50"
                />
                <KPICard
                  title="Comments"
                  value={loading ? '-' : stats.commentReplies.toLocaleString()}
                  icon={MessageCircle}
                  iconColor="text-pink-600"
                  iconBgColor="bg-pink-50"
                />
                <KPICard
                  title="Total Reach"
                  value={loading ? '-' : stats.uniqueUsers.toLocaleString()}
                  icon={Users}
                  iconColor="text-indigo-600"
                  iconBgColor="bg-indigo-50"
                />
                <KPICard
                  title="Followers"
                  value={loading ? '-' : (stats.followersCount || 0).toLocaleString()}
                  icon={Instagram}
                  iconColor="text-rose-600"
                  iconBgColor="bg-rose-50"
                />
                <KPICard
                  title="Growth"
                  value={loading ? '-' : ((stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                  icon={TrendingUp}
                  iconColor="text-emerald-600"
                  iconBgColor="bg-emerald-50"
                />
              </div>

              {/* Chart Section */}
              <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm hover:shadow-md transition-shadow duration-500">
                <DMsChart />
              </div>

              {/* Feed Section */}
              <div className="space-y-6 pt-4">
                <InstagramFeed />
              </div>
            </div>

            {/* Right Column: Insights & Progress */}
            <div className="space-y-8">
              <div className="sticky top-10 space-y-8">
                <div className="bg-white p-2 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <SetupProgress progress={overallProgress} tasks={setupTasks} />
                </div>
                <div className="bg-white p-2 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <TopPerforming />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
