import { useState, useEffect } from 'react';
import { MessageSquare, Zap, MessageCircle, Users, X, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import KPICard from './KPICard';
import InstagramFeed from './InstagramFeed';
import InstagramConnectionStatus from './InstagramConnectionStatus';
import UsageGraph from './UsageGraph'; // Added import for UsageGraph

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

      const dms = activities?.filter(a => ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'].includes(a.activity_type)) || [];
      const comments = activities?.filter(a => ['reply', 'comment', 'reply_to_comment', 'incoming_comment', 'post_comment'].includes(a.activity_type)) || [];

      // Calculate Monthly Counts
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthName = now.toLocaleString('default', { month: 'short' });

      const dmsThisMonth = dms.filter(a => new Date(a.executed_at) >= startOfMonth).length;
      const commentsThisMonth = comments.filter(a => new Date(a.executed_at) >= startOfMonth).length;

      // 3. Unique Users (Source of Truth: Contacts Table) - KEEPING for internal use if needed, but UI wants Usage Stats
      const { count: uniqueUsersCount, error: contactsError } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      if (contactsError) console.error("Error fetching contacts count:", contactsError);

      setStats({
        dmsTriggered: dmsThisMonth, // Showing Monthly Usage
        activeAutomations,
        commentReplies: commentsThisMonth, // Showing Monthly Usage for Comments
        uniqueUsers: commentsThisMonth, // Mapping "Unique Users Contacted" card to match Sidebar "Contacts" Usage
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
    // ... (existing code)
  };

  // ... (existing helper functions)

  const currentMonthShort = new Date().toLocaleString('default', { month: 'short' });

  // ... (existing render code)

  <div className={`grid grid-cols-1 md:grid-cols-2 ${showAnalytics ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-5 mb-10`}>
    <KPICard
      title="DMs Triggered"
      value={loading ? '-' : `${stats.dmsTriggered}/1000 in ${currentMonthShort}`}
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
    {/* 
            Replaced "Comment Replies" with something else? 
            Actually user only asked for "DMs Triggered" and "Unique Users Contacted" cards to change.
            I will keep Comment Replies as simple count or remove it?
            The user said "value ... shud be 0/1000 DM ... also 0/1000 contacts ... here as well".
            "Contacts" usually maps to the card "Unique Users Contacted".
          */}
    <KPICard
      title="Comments Processed"
      value={loading ? '-' : `${stats.commentReplies}/1000 in ${currentMonthShort}`}
      icon={MessageCircle}
      iconColor="text-rose-600"
      iconBgColor="bg-gradient-to-br from-rose-50 to-rose-100"
    />
    <KPICard
      title="Contacts (Usage)"
      value={loading ? '-' : `${stats.uniqueUsers}/1000 in ${currentMonthShort}`}
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

  {/* Usage Graph Section */ }
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <UsageGraph />
          </div>
          <div className="lg:col-span-1 hidden lg:block">
            {/* Can be used for extra widgets or left empty for now */}
          </div>
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
      </div >
    </div >
  );
}
