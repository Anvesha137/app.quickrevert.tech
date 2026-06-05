import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  MessageCircle,
  Users,
  TrendingUp,
  Hand,
  Headset,
  Instagram,
  RefreshCw,
  Check,
  AlertCircle
} from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
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
import UsageStats from './UsageStats';
import { Skeleton } from './ui/skeleton';
import DayNightToggle from './ui/DayNightToggle';
import OnboardingTour from './OnboardingTour';

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

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// All DM-type activity_type values for server-side filtering
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];
const COMMENT_ACTIVITY_TYPES = ['comment', 'reply', 'incoming_comment', 'comment_reply'];

export default function Dashboard() {
  const { user } = useAuth();
  const { displayName, darkMode } = useTheme();
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
  const [isMounted, setIsMounted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isPremium: subIsPremium, isGifted: subIsGifted, isAtLimit: subIsAtLimit } = useSubscription();
  const { uiStyle } = useUIStyle();

  useEffect(() => {
    setIsMounted(true);
    if (user) {
      fetchDashboardStats();
      
      // Check onboarding status
      const localOnboarding = localStorage.getItem(`qr_onboarding_${user.id}`);
      const hasCompleted = user.user_metadata?.has_completed_onboarding || localOnboarding === 'completed';
      if (!hasCompleted) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
      // Run all 5 queries in parallel — zero sequential waterfalls
      const [
        instagramResult,
        automationsResult,
        limitsResult,
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

        // 2. DM + Comment counts — from pre-computed counters (no table scan)
        supabase
          .from('user_limits')
          .select('total_dms, total_comments')
          .eq('user_id', user!.id)
          .maybeSingle(),

        // 3. Unique users count server-side
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
        dmsTriggered: limitsResult.data?.total_dms || 0,
        activeAutomations: activeAutomationsCount,
        commentReplies: limitsResult.data?.total_comments || 0,
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
      <div className={`flex-1 min-h-full font-outfit pb-32 lg:pb-0 transition-colors duration-500 ${darkMode ? 'bg-transparent text-white' : 'bg-white text-gray-800'}`}>
        {showOnboarding && user && (
          <OnboardingTour 
            userId={user.id} 
            onComplete={() => setShowOnboarding(false)} 
          />
        )}
        <div className="flex h-full w-full max-w-[1600px] mx-auto flex-col lg:flex-row justify-between gap-6 lg:gap-8 p-4 lg:p-6">

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col gap-8">
            {/* Today's Activity List */}
            <div>
              <div className="md:hidden mb-6 p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-md border border-white/20">
                <div className="flex items-center gap-1 justify-center mb-1">
                  <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain" />
                  <h1 className={`font-bold text-2xl tracking-tighter -mt-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>QuickRevert</h1>
                </div>
                <p className={`text-[10px] font-bold tracking-tight text-center leading-none ${darkMode ? 'text-white' : 'text-gray-600'}`}>
                  Intelligent Responses | Zero Wait Time | 24x7
                </p>
              </div>
              <div className={`flex justify-between items-center mb-4 border-b pb-2 transition-colors duration-500 ${darkMode ? 'border-white/10' : 'border-gray-100'}`}>
                <h3 className={`font-bold text-xl transition-colors duration-500 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Hello, {isMounted ? (displayName?.split(' ')[0] || 'there') : '...'} 👋
                </h3>
                <div className="flex items-center gap-4">
                  <DayNightToggle />
                  <a
                    href="https://quickrevert.tech/contact"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors border ${darkMode ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10' : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Headset className="w-4 h-4" />
                    <span className="text-[12px] font-bold">Support</span>
                  </a>
                </div>
              </div>

              {/* Connection Status Banner - Millennial */}
              <div className="mb-4 group" id="tour-connect">
                {instagramAccount ? (
                  <div className={`relative overflow-hidden rounded-2xl py-3 px-4 md:py-4 md:px-6 shadow-xl transition-all duration-300 hover:shadow-2xl border-none bg-gradient-to-r from-orange-500 to-purple-700 text-white`}>

                    <div className="flex items-center gap-2 relative z-10">
                      <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl border flex items-center justify-center shrink-0 bg-white/20 border-white/30 backdrop-blur-md`}>
                        {instagramAccount.profile_picture_url ? (
                          <img
                            src={instagramAccount.profile_picture_url}
                            alt={instagramAccount.username}
                            className="w-full h-full rounded-xl object-cover"
                          />
                        ) : (
                          <Instagram className={`w-4 h-4 md:w-5 md:h-5 text-white`} />
                        )}
                      </div>
                      <div>
                        <h3 className={`text-xs md:text-sm font-black leading-tight mb-0.5 text-white`}>@{instagramAccount.username}</h3>
                        <p className={`text-[8px] md:text-[9px] font-extrabold uppercase tracking-widest text-orange-100`}>Connected</p>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div 
                    className="relative overflow-hidden rounded-2xl py-4 px-5 md:py-5 md:px-6 flex items-center gap-4 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl shadow-xl bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white group"
                    onClick={() => window.location.href = '/connect-accounts'}
                  >
                    {/* Animated shimmer overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                    <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg">
                      <Instagram className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>
                    <div className="flex-1 relative z-10">
                      <h3 className="text-sm md:text-base font-black leading-tight mb-0.5 text-white">Connect Instagram to Get Started</h3>
                      <p className="text-[10px] md:text-xs font-semibold text-white/80">Required to use QuickRevert — tap to connect now ✨</p>
                    </div>
                    <div className="hidden md:flex items-center gap-1 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 text-white text-xs font-black uppercase tracking-wider shrink-0 group-hover:bg-white/30 transition-colors">
                      Connect →
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3" id="tour-metrics">
                <div className={`p-2 md:p-3 rounded-[1.25rem] border shadow-sm flex flex-col gap-1 transition-all duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#3b82f6] flex items-center justify-center shadow-sm flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total DMs</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : stats.dmsTriggered.toLocaleString()}
                  </span>
                </div>

                <div className={`p-2.5 md:p-4 rounded-[1.25rem] border shadow-sm flex flex-col gap-1.5 transition-colors duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Active Auto.</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-10" /> : stats.activeAutomations.toString()}
                  </span>
                </div>

                <div className={`p-2.5 md:p-4 rounded-[1.25rem] border shadow-sm flex flex-col gap-1.5 transition-colors duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#f97316] flex items-center justify-center shadow-sm flex-shrink-0">
                      <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Comments</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : stats.commentReplies.toLocaleString()}
                  </span>
                </div>

                <div className={`p-2.5 md:p-4 rounded-[1.25rem] border shadow-sm flex flex-col gap-1.5 transition-colors duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#ef4444] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Reach</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : stats.uniqueUsers.toLocaleString()}
                  </span>
                </div>

                <div className={`p-2.5 md:p-4 rounded-[1.25rem] border shadow-sm flex flex-col gap-1.5 transition-colors duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm flex-shrink-0">
                      <Instagram className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Followers</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : (stats.followersCount || 0).toLocaleString()}
                  </span>
                </div>

                <div className={`p-2.5 md:p-4 rounded-[1.25rem] border shadow-sm flex flex-col gap-1.5 transition-colors duration-500 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm flex-shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <p className={`font-bold text-[11px] md:text-[13px] leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Growth</p>
                  </div>
                  <span className={`block text-xl md:text-2xl font-black transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : Math.max(0, (stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Usage Stats - Mobile Only (Millennial) */}
            <div className="block lg:hidden mt-6 mb-2">
              <UsageStats />
            </div>

            {/* DMs Sent Section */}
            <div className={`mt-4 pt-6 border-t transition-colors duration-500 ${darkMode ? 'border-white/10' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className={`text-3xl font-black mb-1 transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>DMs Sent</h2>
                  <p className="text-sm text-gray-400 font-medium">Last 7 day activity</p>
                </div>
                {/* Icons removed per user request */}
              </div>

              {/* Chart Placeholder / Simplification */}
              <div className="h-56 w-full -ml-4">
                <DMsChart />
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6" id="tour-setup">
            {/* Setup Progress */}
            <div className={`rounded-[1.25rem] p-4 shadow-sm border group/setup transition-all duration-300 hover:shadow-md ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100'}`}>
              <h3 className={`font-bold mb-2 text-sm transition-colors duration-500 ${darkMode ? 'text-white' : 'text-[#2A2B3A]'}`}>Your Setup Progress</h3>
              <div className={`relative h-1.5 w-full rounded-full mb-1.5 group/progress transition-colors duration-500 ${darkMode ? 'bg-white/10' : 'bg-gray-100'}`}>
                <div 
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-gray-400 px-1 pt-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span className="text-emerald-500">100%</span>
              </div>

              {/* Revealable Task List on Hover */}
              <div className="max-h-0 opacity-0 overflow-hidden transition-all duration-500 ease-in-out group-hover/setup:max-h-[160px] group-hover/setup:opacity-100 group-hover/setup:mt-4">
                <div className={`space-y-3 pt-2 border-t transition-colors duration-500 ${darkMode ? 'border-white/5' : 'border-gray-50'}`}>
                  {setupTasks.map((task, index) => (
                    <div key={index} className="flex items-center justify-between group/item">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${task.completed ? (darkMode ? 'bg-emerald-500 text-black' : 'bg-emerald-100 text-emerald-600') : (darkMode ? 'bg-orange-500 text-black' : 'bg-orange-100 text-orange-600')}`}>
                          {task.completed ? <Check size={12} strokeWidth={4} /> : <AlertCircle size={12} strokeWidth={4} />}
                        </div>
                        <span className={`text-[11px] font-bold transition-colors ${task.completed ? (darkMode ? 'text-gray-600' : 'text-gray-400') : (darkMode ? 'text-gray-400' : 'text-gray-700')}`}>
                          {task.label}
                        </span>
                      </div>
                      
                      {!task.completed && task.action && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); task.action && task.action(); }}
                          disabled={task.loading || task.disabled}
                          className={cn(
                            "opacity-0 group-hover/item:opacity-100 transition-opacity px-3 py-1 text-[9px] font-black uppercase rounded-lg disabled:opacity-30 disabled:cursor-not-allowed",
                            darkMode
                              ? `bg-gradient-to-r ${subIsPremium ? 'from-indigo-600 to-violet-700' : 'from-blue-500 to-purple-600'} text-white hover:brightness-110`
                              : "bg-black text-white hover:bg-gray-800"
                          )}
                        >
                          {task.loading ? '...' : (task.actionLabel || 'Enable')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <TopPerforming />

            {/* Banners */}
            <div className="space-y-3">
              {(!subIsPremium || (subIsGifted && subIsAtLimit)) && (
                <ProBanner isCompact={true} />
              )}
              <a 
                href="https://quickrevert.tech/contact" 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`w-full transition-colors py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm ${darkMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-[#1e6129] hover:bg-[#15471d] text-white'}`}
              >
                <span className="text-lg">👏</span> Support
              </a>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 relative min-h-screen overflow-x-hidden font-outfit transition-colors duration-500 ${darkMode ? 'bg-black' : 'bg-[#fafbff]'}`}>
      {showOnboarding && user && (
        <OnboardingTour 
          userId={user.id} 
          onComplete={() => setShowOnboarding(false)} 
        />
      )}
      
      {/* Animated Background Blobs - Refined */}
      {!darkMode && (
        <div className="fixed inset-0 -z-10 bg-slate-50/50">
          <div className="absolute top-0 -left-10 w-[500px] h-[500px] bg-blue-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-0 -right-10 w-[500px] h-[500px] bg-purple-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-20 left-1/4 w-[600px] h-[600px] bg-indigo-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-4">
            <div className={`md:hidden mb-6 p-4 transition-colors ${darkMode ? 'bg-transparent border-none' : 'bg-slate-50 border border-gray-100 rounded-3xl'}`}>
              <div className="flex items-center gap-1 justify-center mb-1">
                <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain" />
                <h1 className={`font-bold text-2xl tracking-tighter -mt-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>QuickRevert</h1>
              </div>
              <p className={`text-[10px] font-bold tracking-tight text-center leading-none ${darkMode ? 'text-white' : 'text-gray-600'}`}>
                Intelligent Responses | Zero Wait Time | 24x7
              </p>
            </div>
            <div className="space-y-2">
              <h2 className={`text-5xl md:text-5xl font-black tracking-tight leading-tight flex items-center gap-4 transition-colors ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Hello, {isMounted ? (displayName?.split(' ')[0] || 'Creator') : '...'}
                <Hand className="w-10 h-10 text-amber-400 fill-amber-400/20 animate-jump" />
              </h2>
              <p className={`text-sm font-medium transition-colors ${darkMode ? 'text-white/60' : 'text-gray-600'}`}>Everything is looking fire right now ⚡</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <DayNightToggle />
            <a
              href="https://quickrevert.tech/contact"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl transition-all border shadow-lg ${darkMode ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10' : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50'}`}
            >
              <Headset className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-bold">Support</span>
            </a>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both">
          {/* Pro Banner */}
          {(!subIsPremium || (subIsGifted && subIsAtLimit)) && (
            <div className="transform transition-transform hover:scale-[1.005]">
              <ProBanner isCompact={false} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Column: Metrics & Analytics */}
            <div className="lg:col-span-2 space-y-8">
              <div className="group" id="tour-connect-classic">
                {instagramAccount ? (
                  <div className={`relative overflow-hidden rounded-2xl p-6 transition-all duration-300 shadow-xl bg-gradient-to-r from-orange-500 to-purple-700 text-white shadow-purple-500/30`}>

                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border flex items-center justify-center shrink-0 bg-white/10 border-white/20 backdrop-blur-md">
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
                        <h3 className="text-lg font-black leading-tight mb-0.5 text-white">@{instagramAccount.username}</h3>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-orange-100">Instagram Connected</p>

                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl p-6 flex items-center gap-5 group transition-all duration-300 cursor-pointer hover:scale-[1.01] hover:shadow-2xl shadow-xl bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white">
                    {/* Animated shimmer overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg">
                      <Instagram className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 relative z-10">
                      <h3 className="text-xl font-black leading-tight mb-1 text-white">Connect Instagram to Get Started</h3>
                      <p className="text-sm font-semibold text-white/80">Required to use QuickRevert — tap to connect now ✨</p>
                    </div>
                    <div className="hidden md:flex items-center gap-1 px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 text-white text-sm font-black uppercase tracking-wider shrink-0 group-hover:bg-white/30 transition-colors">
                      Connect →
                    </div>
                    <Link to="/connect-accounts" className="absolute inset-0 z-20" />
                  </div>
                )}
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5" id="tour-metrics-classic">
                <KPICard
                  title="Total DMs"
                  value={loading ? <Skeleton className="h-8 w-20" /> : stats.dmsTriggered.toLocaleString()}
                  icon={MessageSquare}
                  iconColor="text-blue-600"
                  iconBgColor="bg-blue-50"
                />
                <KPICard
                  title="Active Automations"
                  value={loading ? <Skeleton className="h-8 w-12" /> : stats.activeAutomations.toString()}
                  icon={Bot}
                  iconColor="text-purple-600"
                  iconBgColor="bg-purple-50"
                />
                <KPICard
                  title="Comments"
                  value={loading ? <Skeleton className="h-8 w-20" /> : stats.commentReplies.toLocaleString()}
                  icon={MessageCircle}
                  iconColor="text-pink-600"
                  iconBgColor="bg-pink-50"
                />
                {getStepProgress(4) && (
                  <>
                    <KPICard
                      title="Total Reach"
                      value={loading ? <Skeleton className="h-8 w-20" /> : stats.uniqueUsers.toLocaleString()}
                      icon={Users}
                      iconColor="text-indigo-600"
                      iconBgColor="bg-indigo-50"
                    />
                    <KPICard
                      title="Followers"
                      value={loading ? <Skeleton className="h-8 w-20" /> : (stats.followersCount || 0).toLocaleString()}
                      icon={Instagram}
                      iconColor="text-rose-600"
                      iconBgColor="bg-rose-50"
                    />
                    <div className="relative group/refresh">
                      <KPICard
                        title="Growth"
                        value={loading ? <Skeleton className="h-8 w-16" /> : Math.max(0, (stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
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

              {/* Usage Stats - Mobile Only */}
              <div className="block md:hidden pt-4">
                <UsageStats />
              </div>

              {/* Chart Section */}
              <DMsChart />

              {/* Feed Section */}
              <div className="space-y-6 pt-4">
                <InstagramFeed />
              </div>
            </div>

            {/* Right Column: Insights & Progress */}
            <div className="space-y-8" id="tour-setup-classic">
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
