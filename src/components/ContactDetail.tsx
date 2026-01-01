import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ContactSummary from './contact-tabs/ContactSummary';
import ContactActivities from './contact-tabs/ContactActivities';

interface ContactDetailProps {
  username: string;
}

interface ContactStats {
  totalInteractions: number;
  firstContact: string;
  lastContact: string;
  commentCount: number;
  dmCount: number;
  storyReplyCount: number;
}

export default function ContactDetail({ username }: ContactDetailProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'activities'>('summary');
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContactStats();
    setActiveTab('summary');
  }, [username]);

  async function fetchContactStats() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('target_username', username)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const commentCount = data?.filter((a) => a.activity_type === 'comment' || a.activity_type === 'reply').length || 0;
      const dmCount = data?.filter((a) => a.activity_type === 'dm' || a.activity_type === 'dm_sent').length || 0;
      const storyReplyCount = data?.filter((a) => a.activity_type === 'story_reply').length || 0;

      const dates = data?.map((a) => new Date(a.created_at).getTime()) || [];
      const firstContact = data && data.length > 0 ? new Date(Math.min(...dates)).toISOString() : new Date().toISOString();
      const lastContact = data && data.length > 0 ? new Date(Math.max(...dates)).toISOString() : new Date().toISOString();

      setStats({
        totalInteractions: data?.length || 0,
        firstContact,
        lastContact,
        commentCount,
        dmCount,
        storyReplyCount,
      });
    } catch (error) {
      console.error('Error fetching contact stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading contact details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="border-b border-gray-200 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-3xl flex-shrink-0 shadow-lg">
            {username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{username}</h1>
            <p className="text-gray-600 text-lg">@{username}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'summary'
                ? 'bg-white text-blue-600 shadow-md scale-105'
                : 'text-gray-600 hover:bg-white/60'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'activities'
                ? 'bg-white text-blue-600 shadow-md scale-105'
                : 'text-gray-600 hover:bg-white/60'
            }`}
          >
            Activities
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        {activeTab === 'summary' && stats && <ContactSummary username={username} stats={stats} />}
        {activeTab === 'activities' && <ContactActivities username={username} />}
      </div>
    </div>
  );
}
