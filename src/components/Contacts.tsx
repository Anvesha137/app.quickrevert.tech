import { useEffect, useState } from 'react';
import { Search, User, CheckCircle2, XCircle, MessageSquare, Clock, Users as UsersIcon, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Contact {
  id: string;
  username: string;
  full_name: string | null;
  follows_us: boolean;
  interacted_automations: string[];
  interaction_count: number;
  last_interaction_at: string;
  avatar_url?: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  async function fetchContacts() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;

      // Show all contacts, fallback to ID if username is missing
      const validContacts = (data || []).map(c => ({
        ...c,
        username: c.username && c.username !== 'Unknown' && c.username !== 'UnknownError' && !c.username.includes('undefined')
          ? c.username
          : `ID:${c.instagram_user_id?.substring(0, 8)}...`
      }));

      setContacts(validContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = contacts.filter((contact) =>
    (contact.username?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (contact.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  function formatRelativeTime(date: string) {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return past.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-screen overflow-x-hidden">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400/10 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400/10 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=")`
        }}></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight flex items-center gap-3">
              <UsersIcon className="w-8 h-8 text-blue-600" />
              Contacts
            </h1>
            <p className="text-gray-600 mt-1">Track and manage your automated audience interactions</p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by username or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 backdrop-blur-xl bg-white/60 border border-white/40 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-lg transition-all"
            />
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/60 border border-white/40 rounded-3xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/40 border-b border-white/20">
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">User Details</th>
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Follow Status</th>
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Automations</th>
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest text-center">Interactions</th>
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 uppercase tracking-widest">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-inner">
                          <User className="w-8 h-8" />
                        </div>
                        <p className="text-gray-800 font-bold text-lg">No contacts yet</p>
                        <p className="text-gray-500 text-sm max-w-xs mx-auto">Connect your Instagram and start your first automation to see your audience here.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-white/40 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg transform group-hover:scale-110 transition-transform">
                            {contact.username?.startsWith('ID:') ? '?' : contact.username?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">@{contact.username}</span>
                              <a
                                href={`https://instagram.com/${contact.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-blue-500 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-xs text-gray-500 font-medium">{contact.full_name || 'Instagram User'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {contact.follows_us ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Follows you
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                            <XCircle className="w-3.5 h-3.5" />
                            Not following
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-2 max-w-xs">
                          {contact.interacted_automations?.length > 0 ? (
                            contact.interacted_automations.map((auto, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 text-[9px] font-bold rounded-lg uppercase tracking-widest border border-blue-100 shadow-sm">
                                {auto}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400 text-[10px] font-medium italic">No triggers yet</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/60 rounded-xl text-gray-800 font-bold text-sm shadow-sm border border-white/50">
                          <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                          {contact.interaction_count}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2.5 text-xs font-medium text-gray-600">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {formatRelativeTime(contact.last_interaction_at)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
