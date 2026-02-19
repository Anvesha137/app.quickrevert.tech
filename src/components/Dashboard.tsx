import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Zap,
  MessageCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import InstagramFeed from './InstagramFeed';
import StatsCard from './StatsCard';
import { BarChartCard } from './BarChartCard';
import { ConnectCard } from './ConnectCard';
import SetupProgress from './SetupProgress';

interface DashboardStats {
  dmsTriggered: number;
  activeAutomations: number;
  commentReplies: number;
  uniqueUsers: number;
  followersCount?: number | null;
  initialFollowersCount?: number | null;
  followersLastUpdated?: string | null;
}

const mockFollowersData = [
  { name: "Apr", value: 250 },
  { name: "May", value: 320 },
  { name: "Jun", value: 180 },
  { name: "Jul", value: 400 },
  { name: "Aug", value: 280 },
  { name: "Sep", value: 500 },
  { name: "Oct", value: 350 },
  { name: "Nov", value: 420 },
  { name: "Dec", value: 290 },
  { name: "Jan", value: 460 },
  { name: "Feb", value: 380 },
];

const mockAutomationData = [
  { name: "Apr", value: 120 },
  { name: "May", value: 200 },
  { name: "Jun", value: 150 },
  { name: "Jul", value: 310 },
  { name: "Aug", value: 220 },
  { name: "Sep", value: 480 },
  { name: "Oct", value: 260 },
  { name: "Nov", value: 370 },
  { name: "Dec", value: 190 },
  { name: "Jan", value: 430 },
  { name: "Feb", value: 340 },
];

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
  const [instagramAccount, setInstagramAccount] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  const fetchDashboardStats = async () => {
    try {
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

      const activeAutomationsCount = automations?.filter(a => a.status === 'active').length || 0;

      const { data: activities, error: activitiesError } = await supabase
        .from('automation_activities')
        .select('activity_type, target_username')
        .eq('user_id', user!.id);

      if (activitiesError) throw activitiesError;

      const dmsCount = activities?.filter(a => ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'].includes(a.activity_type)).length || 0;
      const commentsCount = activities?.filter(a => ['reply', 'comment', 'reply_to_comment', 'incoming_comment', 'post_comment'].includes(a.activity_type)).length || 0;

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
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Top row: Connect & Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ConnectCard
          username={instagramAccount?.username}
          isConnected={!!instagramAccount}
        />
        <SetupProgress
          progress={overallProgress}
          tasks={setupTasks}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatsCard
          label="Total DMs"
          value={loading ? '-' : stats.dmsTriggered.toLocaleString()}
          change="+12%"
          positive={true}
          iconBg="bg-gradient-to-br from-cyan-400 to-teal-500 shadow-cyan-100"
          icon={<MessageSquare size={18} className="text-white" />}
        />
        <StatsCard
          label="Automations"
          value={loading ? '-' : stats.activeAutomations.toString()}
          change="+5%"
          positive={true}
          iconBg="bg-gradient-to-br from-pink-400 to-rose-500 shadow-rose-100"
          icon={<Zap size={18} className="text-white" />}
        />
        <StatsCard
          label="Comments"
          value={loading ? '-' : stats.commentReplies.toLocaleString()}
          change="+2%"
          positive={true}
          iconBg="bg-gradient-to-br from-orange-400 to-amber-500 shadow-amber-100"
          icon={<MessageCircle size={18} className="text-white" />}
        />
        <StatsCard
          label="Total Reach"
          value={loading ? '-' : stats.uniqueUsers.toLocaleString()}
          change="+8%"
          positive={true}
          iconBg="bg-gradient-to-br from-violet-500 to-purple-600 shadow-purple-100"
          icon={<Users size={18} className="text-white" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <BarChartCard
          title="Followers Gained"
          subtitle="Monthly Instagram follower growth"
          data={mockFollowersData}
          color="rgba(255,255,255,0.7)"
          footer={`${loading ? '0' : (stats.followersCount || 0).toLocaleString()} total followers`}
        />
        <BarChartCard
          title="Top Performing Automation"
          subtitle="Triggered DMs per automation"
          data={mockAutomationData}
          color="rgba(255,255,255,0.7)"
          footer={`${loading ? '0' : stats.activeAutomations} active automations`}
        />
      </div>

      {/* Feed Section - Preserved */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
        <h3 className="text-lg font-black text-gray-800 mb-6 uppercase tracking-wider">Instagram Feed</h3>
        <InstagramFeed />
      </div>
    </div>
  );
}
