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
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUIStyle } from '../contexts/UIStyleContext';
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
  hasAnalyticsWorkflow: boolean;
}

// All DM-type activity_type values for server-side filtering
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];
const COMMENT_ACTIVITY_TYPES = ['comment', 'reply', 'incoming_comment', 'comment_reply'];

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
    followersLastUpdated: null,
    hasAnalyticsWorkflow: false
  });
  const [loading, setLoading] = useState(true);
  const [enablingAnalytics, setEnablingAnalytics] = useState(false);
  const [isRefreshingAnalytics, _setRefreshingAnalytics] = useState(false);
  const [instagramAccount, setInstagramAccount] = useState<any>(null);
  const { isPremium } = useSubscription();
  const { uiStyle } = useUIStyle();

  useEffect(() => {
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
      // Run all 5 queries in parallel — zero sequential waterfalls
      const [
        instagramResult,
        automationsResult,
        dmCountResult,
        commentCountResult,
        contactsCountResult,
        analyticsWorkflowResult,
      ] = await Promise.all([
        // 0. Instagram account
        supabase
          .from('instagram_accounts')
          .select('id, username, profile_picture_url, followers_count, initial_followers_count, followers_last_updated')
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .limit(1),

        // 1. Automations (only id + status needed)
        supabase
          .from('automations')
          .select('id, status')
          .eq('user_id', user!.id),

        // 2. DM count server-side (no row data transferred)
        supabase
          .from('automation_activities')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('activity_type', DM_ACTIVITY_TYPES),

        // 3. Comment count server-side
        supabase
          .from('automation_activities')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('activity_type', COMMENT_ACTIVITY_TYPES),

        // 4. Unique users count server-side
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),

        // 5. Analytics workflow check
        supabase
          .from('n8n_workflows')
          .select('n8n_workflow_id')
          .eq('user_id', user!.id)
          .like('n8n_workflow_name', '[Analytics]%')
          .limit(1)
          .maybeSingle(),
      ]);

      if (automationsResult.error) throw automationsResult.error;

      const instaAccount = instagramResult.data?.[0] ?? null;
      setInstagramAccount(instaAccount);

      const activeAutomationsCount = automationsResult.data?.filter(a => a.status === 'active').length || 0;

      setStats({
        dmsTriggered: dmCountResult.count || 0,
        activeAutomations: activeAutomationsCount,
        commentReplies: commentCountResult.count || 0,
        uniqueUsers: contactsCountResult.count || 0,
        followersCount: instaAccount?.followers_count ?? null,
        initialFollowersCount: instaAccount?.initial_followers_count ?? null,
        followersLastUpdated: instaAccount?.followers_last_updated ?? null,
        hasAnalyticsWorkflow: !!analyticsWorkflowResult.data,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableAnalytics = async () => {
    if (!instagramAccount) {
      toast.error('Please connect your Instagram account first');
      return;
    }

    setEnablingAnalytics(true);
    try {
      await N8nWorkflowService.createAnalyticsWorkflow(user!.id, instagramAccount.id);
      toast.success('Advanced Analytics enabled successfully!');
      toast.success('Analytics getting their glow-up ✨ check in an hour!');
      await fetchDashboardStats();
    } catch (error: any) {
      console.error('Error enabling analytics:', error);
      toast.error(error.message || 'Failed to enable Advanced Analytics');
    } finally {
      setEnablingAnalytics(false);
    }
  };

  const handleRefreshAnalytics = async () => {
    toast.success('Analytics getting their glow-up ✨ check in an hour!');
  };

  const getStepProgress = (id: number) => {
    switch (id) {
      case 1: return instagramAccount ? true : false;
      case 2: return stats.activeAutomations > 0;
      case 3: return (stats.dmsTriggered > 0 || stats.commentReplies > 0);
      case 4: return stats.hasAnalyticsWorkflow;
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

  if (uiStyle === 'millennial') {
    return (
      <div className="flex-1 min-h-full bg-white font-outfit text-gray-800">
        <div className="flex h-full w-full max-w-[1600px] mx-auto flex-col lg:flex-row justify-between gap-8 lg:gap-14 p-6 lg:p-10">

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col gap-10">
            {/* Today's Activity List */}
            <div>
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <h3 className="font-bold text-gray-800 text-lg">Hello, {displayName?.split(' ')[0] || 'there'} 👋</h3>
                <span className="text-gray-300 font-bold tracking-widest text-xl leading-none">...</span>
              </div>

              {/* Connection Status Banner - Black & White / Thinner for Millennial */}
              <div className="mb-4 group">
                {instagramAccount ? (
                  <div className="relative overflow-hidden rounded-2xl bg-black py-3 px-4 md:py-4 md:px-6 shadow-sm transition-all duration-300 hover:shadow-md">
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                        {instagramAccount.profile_picture_url ? (
                          <img
                            src={instagramAccount.profile_picture_url}
                            alt={instagramAccount.username}
                            className="w-full h-full rounded-xl object-cover grayscale"
                          />
                        ) : (
                          <Instagram className="w-4 h-4 md:w-5 md:h-5 text-white" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm md:text-base font-black text-white leading-tight mb-0.5">@{instagramAccount.username}</h3>
                        <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">Connected</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200 py-3 px-4 md:py-4 md:px-6 flex items-center gap-3 group hover:border-black transition-colors cursor-pointer">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-gray-100 transition-colors">
                      <Instagram className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-black transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-gray-700 group-hover:text-black transition-colors">Connect Instagram</h3>
                      <p className="text-[10px] md:text-xs text-gray-400 font-medium">Link your account</p>
                    </div>
                    <Link to="/connect-accounts" className="absolute inset-0" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#3b82f6] flex items-center justify-center shadow-sm flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Total DMs</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : stats.dmsTriggered.toLocaleString()}</span>
                </div>

                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Active Auto.</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : stats.activeAutomations.toString()}</span>
                </div>

                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#f97316] flex items-center justify-center shadow-sm flex-shrink-0">
                      <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Comments</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : stats.commentReplies.toLocaleString()}</span>
                </div>

                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#ef4444] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Total Reach</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : stats.uniqueUsers.toLocaleString()}</span>
                </div>

                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Instagram className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Followers</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : (stats.followersCount || 0).toLocaleString()}</span>
                </div>

                <div className="bg-white p-2.5 md:p-4 rounded-[1.25rem] border border-gray-100 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm flex-shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className="font-bold text-gray-400 text-[11px] md:text-[13px] leading-tight">Growth</p>
                  </div>
                  <span className="block text-xl md:text-2xl font-black text-[#2A2B3A]">{loading ? '-' : Math.max(0, (stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* DMs Sent Section */}
            <div className="mt-4 pt-8 border-t border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-black text-[#2A2B3A] mb-1">DMs Sent</h2>
                  <p className="text-sm text-gray-400 font-medium">Last 7 day activity</p>
                </div>
                {/* Dummy avatars for visual match */}
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-pink-200 border-2 border-white flex items-center justify-center overflow-hidden"><img src="https://i.pravatar.cc/100?img=1" alt="avatar" /></div>
                  <div className="w-8 h-8 rounded-full bg-blue-200 border-2 border-white flex items-center justify-center overflow-hidden"><img src="https://i.pravatar.cc/100?img=2" alt="avatar" /></div>
                  <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center overflow-hidden"><img src="https://i.pravatar.cc/100?img=3" alt="avatar" /></div>
                </div>
              </div>

              {/* Chart Placeholder / Simplification */}
              <div className="h-48 w-full -ml-4">
                <DMsChart />
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-10">
            {/* Setup Progress */}
            <div className="bg-white border border-gray-100 rounded-[1.25rem] p-6 shadow-sm">
              <h3 className="text-[#2A2B3A] font-bold mb-4">Your Setup Progress</h3>
              <div className="h-2 w-full bg-gray-100 rounded-full mb-2 overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full w-1/4" />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-gray-400 px-1">
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <TopPerforming />

            {/* Banners */}
            <div className="space-y-3">
              {!isPremium && (
                <button className="w-full bg-black text-white hover:bg-gray-800 transition-colors py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm">
                  <span className="text-lg">👑</span> Upgrade To Pro
                </button>
              )}
              <a href="https://quickrevert.tech/contact" target="_blank" rel="noopener noreferrer" className="w-full bg-[#1e6129] hover:bg-[#15471d] text-white transition-colors py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm">
                <span className="text-lg">👏</span> Support
              </a>
            </div>

          </div>
        </div>
      </div>
    );
  }

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
                        value={loading ? '-' : Math.max(0, (stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                        icon={TrendingUp}
                        iconColor="text-emerald-600"
                        iconBgColor="bg-emerald-50"
                      />
                      <button
                        onClick={handleRefreshAnalytics}
                        disabled={isRefreshingAnalytics || loading}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/50 backdrop-blur-sm border border-white/40 shadow-sm opacity-0 group-hover/refresh:opacity-100 transition-opacity hover:bg-white hover:scale-110 disabled:opacity-50"
                        title="Refresh Analytics"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isRefreshingAnalytics ? 'animate-spin' : ''}`} />
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
