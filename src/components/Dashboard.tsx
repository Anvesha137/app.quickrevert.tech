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
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { N8nWorkflowService } from '../lib/n8nService';
import { toast } from 'sonner';
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
  const [enablingAnalytics, setEnablingAnalytics] = useState(false);
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [instagramAccount, setInstagramAccount] = useState<any>(null);
  const { isPremium } = useSubscription();
  const { openModal } = useUpgradeModal();

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

      // 2. Fetch All Activities (Source of Truth)
      const { data: allActivities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('activity_type, metadata')
        .eq('user_id', user!.id);

      if (activitiesError) throw activitiesError;

      // 3. Robust Categorization
      const dmsCount = allActivities?.filter(a => {
        const type = (a.activity_type || '').toLowerCase();
        return (
          type.includes('dm') ||
          type.includes('message') ||
          type.includes('event') ||
          type.includes('interaction') ||
          (a.metadata as any)?.direction === 'inbound' ||
          (a.metadata as any)?.direction === 'outbound'
        );
      }).length || 0;

      const commentsCount = allActivities?.filter(a => {
        const type = (a.activity_type || '').toLowerCase();
        return type.includes('comment') || type.includes('reply');
      }).length || 0;

      // 4. Unique Users (Source of Truth: Contacts Table)
      const { count: uniqueUsersCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      setStats({
        dmsTriggered: dmsCount,
        activeAutomations: activeAutomationsCount,
        commentReplies: commentsCount,
        uniqueUsers: uniqueUsersCount || 0,
        followersCount: instaAccount?.followers_count ?? null,
        initialFollowersCount: instaAccount?.initial_followers_count ?? null,
        followersLastUpdated: instaAccount?.followers_last_updated ?? null
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableAnalytics = async () => {
    if (!isPremium) {
      openModal();
      return;
    }

    if (!instagramAccount) {
      toast.error('Please connect your Instagram account first');
      return;
    }

    setEnablingAnalytics(true);
    try {
      await N8nWorkflowService.createAnalyticsWorkflow(user!.id, instagramAccount.id);
      toast.success('Advanced Analytics enabled successfully!');
      // Refresh stats to show the new data/progress
      await fetchDashboardStats();
    } catch (error: any) {
      console.error('Error enabling analytics:', error);
      toast.error(error.message || 'Failed to enable Advanced Analytics');
    } finally {
      setEnablingAnalytics(false);
    }
  };

  const handleRefreshAnalytics = async () => {
    setRefreshingAnalytics(true);
    try {
      await N8nWorkflowService.refreshAnalytics();
      toast.success('Analytics refreshed successfully!');
      await fetchDashboardStats();
    } catch (error: any) {
      console.error('Error refreshing analytics:', error);
      toast.error(error.message || 'Failed to refresh analytics');
    } finally {
      setRefreshingAnalytics(false);
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
    {
      label: 'Unlock Advance Analytics',
      completed: getStepProgress(4),
      action: handleEnableAnalytics,
      actionLabel: 'Enable',
      loading: enablingAnalytics,
      disabled: !getStepProgress(1) || !getStepProgress(2) || !getStepProgress(3)
    },
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
            <h2 className="text-4xl md:text-4xl font-black text-gray-900 tracking-tight leading-tight flex items-center gap-4">
              Hello, {displayName?.split(' ')[0] || 'Creator'}
              <Hand className="w-10 h-10 text-amber-400 fill-amber-400/20 animate-jump" />
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
                  <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${isPremium ? 'from-indigo-600 to-violet-700 shadow-indigo-500/30' : 'from-blue-500 to-purple-600 shadow-purple-500/30'} p-6 shadow-lg transition-all duration-300 hover:shadow-xl`}>
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                        {instagramAccount.profile_picture_url ? (
                          <img
                            src={instagramAccount.profile_picture_url}
                            alt={instagramAccount.username}
                            className="w-full h-full rounded-xl object-cover"
                          />
                        ) : (
                          <Instagram className="w-6 h-6 text-white" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white leading-tight mb-0.5">@{instagramAccount.username}</h3>
                        <p className="text-[11px] font-bold text-blue-100 uppercase tracking-wider">Instagram Connected</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl bg-white border-2 border-dashed border-slate-200 p-6 flex items-center gap-4 group hover:border-blue-300 transition-colors cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">
                      <Instagram className="w-6 h-6 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-700 group-hover:text-blue-600 transition-colors">Connect Instagram</h3>
                      <p className="text-sm text-slate-400 font-medium">Link your account to start</p>
                    </div>
                    <Link to="/connect-accounts" className="absolute inset-0" />
                  </div>
                )}
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                <KPICard
                  title="Total DMs"
                  value={loading ? '-' : stats.dmsTriggered.toLocaleString()}
                  icon={MessageSquare}
                  iconColor="text-blue-600"
                  iconBgColor="bg-blue-50"
                />
                <KPICard
                  title="Active Automations"
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
                {getStepProgress(4) && (
                  <>
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
                    <div className="relative group/refresh">
                      <KPICard
                        title="Growth"
                        value={loading ? '-' : ((stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                        icon={TrendingUp}
                        iconColor="text-emerald-600"
                        iconBgColor="bg-emerald-50"
                      />
                      <button
                        onClick={handleRefreshAnalytics}
                        disabled={refreshingAnalytics || loading}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/50 backdrop-blur-sm border border-white/40 shadow-sm opacity-0 group-hover/refresh:opacity-100 transition-opacity hover:bg-white hover:scale-110 disabled:opacity-50"
                        title="Refresh Analytics"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${refreshingAnalytics ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Chart Section */}
              <DMsChart />

              {/* Feed Section */}
              <div className="space-y-6 pt-4">
                <InstagramFeed />
              </div>
            </div>

            {/* Right Column: Insights & Progress */}
            <div className="space-y-8">
              <div className="sticky top-10 space-y-8">
                <SetupProgress progress={overallProgress} tasks={setupTasks} />
                <TopPerforming />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
