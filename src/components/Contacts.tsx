import { useEffect, useState } from 'react';
import { Search, User, CheckCircle2, XCircle, MessageSquare, Clock, Users as UsersIcon, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  // New state for automation map
  const [automationNames, setAutomationNames] = useState<Record<string, string[]>>({});

  async function fetchAutomationNames(contactIds: string[]) {
    if (contactIds.length === 0) return;

    try {
      // 1. Get all automations to create ID -> Name map
      const { data: automations } = await supabase
        .from('automations')
        .select('id, name')
        .eq('user_id', user!.id);

      const autoMap = new Map<string, string>();
      automations?.forEach(a => autoMap.set(a.id, a.name));

      // 2. Get activities for these contacts
      const { data: activities } = await supabase
        .from('automation_activities')
        .select('target_username, automation_id, metadata')
        .eq('user_id', user!.id);

      if (!activities) return;

      const contactAutomations: Record<string, string[]> = {};

      activities.forEach(act => {
        const username = act.target_username;
        if (!username) return;

        // Normalize
        const normalizedUser = username.toLowerCase().replace('@', '').trim();

        // Find automation name
        const autoId = act.automation_id || act.metadata?.automation_id || act.metadata?.automationId || act.metadata?.AutomationId;
        const name = autoId ? autoMap.get(autoId) : null;

        if (name) {
          if (!contactAutomations[normalizedUser]) {
            contactAutomations[normalizedUser] = [];
          }
          if (!contactAutomations[normalizedUser].includes(name)) {
            contactAutomations[normalizedUser].push(name);
          }
        }
      });

      setAutomationNames(contactAutomations);

    } catch (e) {
      console.error("Error fetching automation details", e);
    }
  }

  async function fetchContacts() {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        await syncHistoricalContacts();
        // Re-fetch...
        const { data: syncedData } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('last_interaction_at', { ascending: false });

        if (syncedData) {
          processAndSetContacts(syncedData);
          fetchAutomationNames(syncedData.map(c => c.id));
        } else {
          setContacts([]);
        }
      } else {
        processAndSetContacts(data);
        fetchAutomationNames(data.map(c => c.id));

        // Background sync to update interaction counts + backfill
        syncHistoricalContacts().then(async () => {
          // Optional: Refetch after sync to show updated counts immediately
          const { data: refreshed } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .order('last_interaction_at', { ascending: false });
          if (refreshed) {
            processAndSetContacts(refreshed);
            fetchAutomationNames(refreshed.map(c => c.id));
          }
        });
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }
  const processAndSetContacts = (data: any[]) => {
    const validContacts = (data || []).map(c => {
      const hasValidUsername = c.username && c.username !== 'Unknown' && c.username !== 'UnknownError' && !c.username.includes('undefined') && !c.username.includes('null');
      return {
        ...c,
        username: hasValidUsername ? c.username : `IG:${c.instagram_user_id?.substring(0, 8)}`,
        full_name: c.full_name || (hasValidUsername ? c.username : `User ${c.instagram_user_id?.substring(0, 4)}`)
      };
    });
    setContacts(validContacts);
  };

  async function syncHistoricalContacts() {
    try {
      setIsSyncing(true);
      // Fetch automations to map IDs to names
      const { data: automations } = await supabase
        .from('automations')
        .select('id, name')
        .eq('user_id', user!.id);

      const automationMap = new Map();
      automations?.forEach(a => automationMap.set(a.id, a.name));

      // Fetch unique identities from activities
      const { data: activities } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user!.id);

      if (!activities || activities.length === 0) return;

      // Pass 1: Build Username -> PSID map
      const usernameToIdMap = new Map<string, string>();
      activities.forEach(act => {
        const psid = act.metadata?.raw_id || act.metadata?.sender_id || act.metadata?.from?.id;
        const username = act.target_username;
        if (psid && username) {
          const normalized = username.toLowerCase().replace('@', '').trim();
          usernameToIdMap.set(normalized, String(psid));
        }
      });

      const uniqueContactsMap = new Map();
      activities.forEach(act => {
        let psid = act.metadata?.raw_id || act.metadata?.sender_id || act.metadata?.from?.id;
        const username = act.target_username;

        // Normalize username for matching
        const normalize = (u: string) => u?.toLowerCase().replace('@', '').trim();
        const normalizedTarget = normalize(username);

        // Try to backfill PSID if missing
        if (!psid && username) {
          psid = usernameToIdMap.get(normalizedTarget);
        }

        // Debug log for specific user
        if (normalizedTarget.includes('admitgenie') || normalizedTarget.includes('tella') || normalizedTarget.includes('indiangirl')) {
          const currentCount = uniqueContactsMap.get(`${act.instagram_account_id}-${psid}`)?.interaction_count;
          console.log(`Processing act for ${normalizedTarget}:`, {
            id: act.id,
            psid,
            foundPsid: !!psid,
            currentCount
          });
        }



        const automationIdFromMetadata = act.metadata?.automation_id || act.metadata?.automationId;
        const aId = act.automation_id || automationIdFromMetadata;
        const automationName = aId ? automationMap.get(aId) : null;

        let interacted_automations = [...(current?.interacted_automations || [])];
        if (automationName && !interacted_automations.includes(automationName)) {
          interacted_automations.push(automationName);
        }

        // Debug log for specific user
        if (normalizedTarget.includes('admitgenie')) {
          console.log('Processing activity for admitgenie:', { aId, automationName, interacted_automations });
        }

        if (!current || new Date(act.created_at) > new Date(current.last_interaction_at)) {
          uniqueContactsMap.set(key, {
            user_id: user!.id,
            instagram_account_id: act.instagram_account_id,
            instagram_user_id: String(psid),
            username: username,
            full_name: act.metadata?.name || username,
            avatar_url: act.metadata?.profilePic || null,
            interaction_count: (current?.interaction_count || 0) + 1,
            last_interaction_at: act.created_at,
            platform: 'instagram'
            // interacted_automations removed from DB insert to avoid schema error
          });
        } else {
          uniqueContactsMap.set(key, {
            ...current,
            interaction_count: (current?.interaction_count || 0) + 1
          });
        }
      }
      });


    const contactsToInsert = Array.from(uniqueContactsMap.values());
    if (contactsToInsert.length > 0) {
      await supabase.from('contacts').upsert(contactsToInsert, {
        onConflict: 'user_id, instagram_account_id, instagram_user_id'
      });
    }
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    setIsSyncing(false);
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

        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={() => {
              syncHistoricalContacts().then(() => fetchContacts());
            }}
            disabled={isSyncing}
            className="flex items-center gap-2 px-6 py-3.5 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl text-sm font-bold text-gray-700 hover:bg-white hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Clock className={cn("w-4 h-4 text-blue-500", isSyncing && "animate-spin")} />
            {isSyncing ? 'Syncing...' : 'Sync History'}
          </button>

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
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg transform group-hover:scale-110 transition-transform overflow-hidden">
                          {contact.avatar_url ? (
                            <img src={contact.avatar_url} alt={contact.username} className="w-full h-full object-cover" />
                          ) : (
                            contact.username?.startsWith('IG:') ? '?' : contact.username?.[0]?.toUpperCase() || '?'
                          )}
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
                      {(function () {
                        const normalized = contact.username?.toLowerCase().replace('@', '').trim();
                        const autos = automationNames[normalized] || contact.interacted_automations;

                        return autos?.length > 0 ? (
                          <div className="text-xs font-bold text-blue-600 bg-blue-50/50 px-3 py-1.5 rounded-xl border border-blue-100 inline-block max-w-[200px] truncate" title={autos.join(', ')}>
                            {autos.join(', ')}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px] font-medium italic">No triggers yet</span>
                        );
                      })()}
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
