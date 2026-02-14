import { useState, useEffect } from 'react';
import { MessageSquare, Zap, MessageCircle, Users, X, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import KPICard from './KPICard';
import InstagramFeed from './InstagramFeed';
import InstagramConnectionStatus from './InstagramConnectionStatus';

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
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [activatingAnalytics, setActivatingAnalytics] = useState(false);

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
        .select('id, followers_count, initial_followers_count, followers_last_updated')
        .eq('user_id', user!.id)
        .limit(1);

      const instaAccount = instagram?.[0];
      setInstagramConnected(!!instaAccount);

      const { data: automations, error: automationsError } = await supabase
        .from('automations')
        .select('id, status')
        .eq('user_id', user!.id);

      if (automationsError) throw automationsError;

      // 1. Active Automations
      const activeAutomations = automations?.filter(a => a.status === 'active').length || 0;

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
        followersCount: instaAccount?.followers_count,
        initialFollowersCount: instaAccount?.initial_followers_count,
        followersLastUpdated: instaAccount?.followers_last_updated
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Reset stats to default values on error to prevent undefined values
      setStats({
        dmsTriggered: 0,
        activeAutomations: 0,
        commentReplies: 0,
        uniqueUsers: 0,
        followersCount: null,
        initialFollowersCount: null,
        followersLastUpdated: null
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAnalytics = async () => {
    if (!instagramConnected) return;
    try {
      setActivatingAnalytics(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get Instagram Object again or use state if available (better fetch fresh)
      const { data: instagram } = await supabase.from('instagram_accounts').select('id').eq('user_id', user!.id).single();
      if (!instagram) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user!.id,
          instagramAccountId: instagram.id,
          triggerType: 'enable_analytics',
          autoActivate: true
        }),
      });

      if (!response.ok) throw new Error('Failed to activate analytics');

      // Refresh stats
      await fetchDashboardStats();
    } catch (error) {
      console.error('Error unlocking analytics:', error);
    } finally {
      setActivatingAnalytics(false);
    }
  };

  const getProgress = (step: number) => {
    switch (step) {
      case 1: // Connect Instagram
        return instagramConnected ? 100 : 0;
      case 2: // Unlock Analytics (Has any activity/users)
        return stats.followersLastUpdated ? 100 : 0;
      case 3: // Create Automation
        return stats.activeAutomations > 0 ? 100 : 0;
      case 4: // Test Automation (Has triggered DMs/Comments)
        return (stats.dmsTriggered > 0 || stats.commentReplies > 0) ? 100 : 0;
      default:
        return 0;
    }
  };

  const steps = [
    { id: 1, title: 'Connect Instagram', desc: 'Link your Business/Creator account.' },
    { id: 2, title: 'Unlock Advance Analytics', desc: 'Enable performance insights (Updates every 12h).' },
    { id: 3, title: 'Create Automation', desc: 'Set a trigger and activate it.' },
    { id: 4, title: 'Test Automation', desc: 'Run a quick test to confirm it works.' },
  ];

  const showAnalytics = !!stats.followersLastUpdated;

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      {/* Release Announcement Banner */}
      {showAnnouncement && (
        <div className="sticky top-0 z-50 bg-[#ffd147] text-gray-900 px-4 py-1 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 mx-auto">
            <span className="text-lg">🚀</span>
            <span className="font-bold">Big News! New Products Page is live.</span>
            <button className="bg-black/5 hover:bg-black/10 px-3 py-1 rounded-full text-sm font-semibold transition-colors ml-2">
              Try it →
            </button>
          </div>
          <button
            onClick={() => setShowAnnouncement(false)}
            className="text-gray-600 hover:text-gray-900 p-1 hover:bg-black/5 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-8">
        {/* Pro Upgrade Banner */}
        <div className="bg-gradient-to-r from-red-600 to-red-400 text-white rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-red-100">
          <div>
            <h2 className="text-xl font-bold mb-1">Unlock Pro Power!</h2>
            <p className="text-red-50">Get unlimited automations, contacts & advanced analytics.</p>
          </div>
          <button className="bg-white text-red-600 px-6 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-colors shadow-sm whitespace-nowrap">
            Upgrade to Pro
          </button>
        </div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Hello, {user?.user_metadata?.first_name || 'Creator'}! 👋</h1>
            <p className="text-gray-600 flex items-center gap-2">
              Here determines your growth today.
              <a
                href="https://quickrevert.tech/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium hover:underline lg:hidden"
              >
                Contact Support
              </a>
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

        <div className="mb-8">
          <InstagramConnectionStatus />
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 ${showAnalytics ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-5 mb-10`}>
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
          {showAnalytics && (
            <>
              <KPICard
                title="Current Followers"
                value={loading ? '-' : (stats.followersCount || 0).toLocaleString()}
                icon={Users}
                iconColor="text-purple-600"
                iconBgColor="bg-gradient-to-br from-purple-50 to-purple-100"
              />
              <KPICard
                title="Followers Gained"
                value={loading ? '-' : ((stats.followersCount || 0) - (stats.initialFollowersCount || 0)).toLocaleString()}
                icon={TrendingUp}
                iconColor="text-emerald-600"
                iconBgColor="bg-gradient-to-br from-emerald-50 to-emerald-100"
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Onboarding Steps (Left) */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Onboarding Steps</h2>
            <div className="space-y-8">
              {steps.map((step) => {
                const progress = getProgress(step.id);
                return (
                  <div key={step.id}>
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {step.id}. {step.title}
                        </h3>
                        <p className="text-gray-500 text-sm mt-1">{step.desc}</p>
                      </div>
                      {step.id === 2 && progress < 100 ? (
                        <button
                          onClick={handleUnlockAnalytics}
                          disabled={!instagramConnected || activatingAnalytics}
                          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors
                            ${!instagramConnected
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                            }`}
                        >
                          {activatingAnalytics ? 'Activating...' : 'Enable'}
                        </button>
                      ) : (
                        <span className="font-bold text-gray-900">{progress}%</span>
                      )}
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Placeholder/Other Content (Right) */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
            <div className="bg-gray-50 p-4 rounded-full mb-4">
              <span className="text-4xl">✨</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-gray-500 text-center max-w-sm">
              We are building more features to help you grow. Stay tuned for advanced analytics and more.
            </p>
          </div>
        </div>



        <div className="mb-8">
          <InstagramFeed />
        </div>
      </div>
    </div>
  );
}
