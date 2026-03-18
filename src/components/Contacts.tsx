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
  instagram_user_id?: string;
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
  const [ownUsernames, setOwnUsernames] = useState<string[]>([]);
  const [automationNames, setAutomationNames] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  async function fetchAutomationNamesForActivities(activitiesData: any[]) {
    if (!activitiesData || activitiesData.length === 0) return;

    try {
      const { data: automations } = await supabase
        .from('automations')
        .select('id, name')
        .eq('user_id', user!.id);

      const autoMap = new Map<string, string>();
      automations?.forEach(a => autoMap.set(a.id, a.name));

      const contactAutomations: Record<string, string[]> = {};

      activitiesData.forEach(act => {
        const username = act.target_username;
        const psid = (act.metadata as any)?.raw_id || (act.metadata as any)?.sender_id || (act.metadata as any)?.from?.id;

        const normalizedUser = username?.toLowerCase().replace('@', '').trim();
        const contactKey = psid ? String(psid) : normalizedUser;

        if (!contactKey) return;

        const autoId = act.automation_id || (act.metadata as any)?.automation_id || (act.metadata as any)?.automationId || (act.metadata as any)?.AutomationId;
        const name = autoId ? autoMap.get(autoId) : null;

        if (name) {
          if (!contactAutomations[contactKey]) {
            contactAutomations[contactKey] = [];
          }
          if (!contactAutomations[contactKey].includes(name)) {
            contactAutomations[contactKey].push(name);
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

      // Parallelize accounts and contacts fetch
      const [igAccountsResult, contactsResult] = await Promise.all([
        supabase
          .from('instagram_accounts')
          .select('username')
          .eq('user_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('last_interaction_at', { ascending: false })
      ]);

      const connectedUsernames = (igAccountsResult.data || []).map(a => a.username?.toLowerCase().trim()).filter(Boolean);
      setOwnUsernames(connectedUsernames);

      if (contactsResult.error) throw contactsResult.error;
      const initialContacts = contactsResult.data || [];

      // If no contacts exist at all, do initial sync (don't block UI with constant background syncs)
      if (initialContacts.length === 0) {
        await syncHistoricalContactsInternal(connectedUsernames);
        
        // Re-fetch after initial sync
        const { data: syncedData } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('last_interaction_at', { ascending: false });

        if (syncedData && syncedData.length > 0) {
          processAndSetContacts(syncedData, connectedUsernames);
          // Only fetch activities once for automation names
          await fetchActivitiesAndBuildNames();
        } else {
          setContacts([]);
        }
      } else {
        processAndSetContacts(initialContacts, connectedUsernames);
        await fetchActivitiesAndBuildNames();
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchActivitiesAndBuildNames() {
    try {
      const { data: activities } = await supabase
        .from('automation_activities')
        .select('target_username, automation_id, metadata')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(2000);
        
      if (activities) {
        await fetchAutomationNamesForActivities(activities);
      }
    } catch (e) {
      console.error("Error fetching activities", e);
    }
  }

  const processAndSetContacts = (data: any[], igUsernames: string[]) => {
    const validContacts = (data || [])
      .filter(c => {
        const normalized = c.username?.toLowerCase().trim();
        return !igUsernames.includes(normalized);
      })
      .map(c => {
        const hasValidUsername = c.username && c.username !== 'Unknown' && c.username !== 'UnknownError' && !c.username.includes('undefined') && !c.username.includes('null');
        return {
          ...c,
          username: hasValidUsername ? c.username : `IG:${c.instagram_user_id?.substring(0, 8)}`,
          full_name: c.full_name || (hasValidUsername ? c.username : `User ${c.instagram_user_id?.substring(0, 4)}`)
        };
      });
    setContacts(validContacts);
  };

  async function manualSync() {
    try {
      setIsSyncing(true);
      
      const { data, error } = await supabase.functions.invoke('sync-contacts-data');
      
      if (error) throw error;
      
      console.log('Sync result:', data);
      
      // Re-fetch contacts after sync
      const { data: refreshedData } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user!.id)
        .order('last_interaction_at', { ascending: false });

      if (refreshedData) {
        processAndSetContacts(refreshedData, ownUsernames);
        await fetchActivitiesAndBuildNames();
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      // Fallback to local sync if edge function fails
      await syncHistoricalContactsInternal(ownUsernames);
    } finally {
      setIsSyncing(false);
    }
  }

  async function syncHistoricalContactsInternal(igUsernames: string[]) {
    try {
      const { data: activities } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (!activities || activities.length === 0) return;

      const usernameToIdMap = new Map<string, string>();
      activities.forEach(act => {
        const psid = act.metadata?.raw_id || act.metadata?.sender_id || act.metadata?.from?.id;
        const username = act.target_username;
        if (psid && username) {
          const normalized = username.toLowerCase().replace('@', '').trim();
          usernameToIdMap.set(normalized, String(psid));
        }
      });

      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user!.id);

      const dbContactsMap = new Map();
      existingContacts?.forEach(c => {
        const key = `${c.instagram_account_id}-${c.instagram_user_id}`;
        dbContactsMap.set(key, c);
      });

      const uniqueContactsMap = new Map();

      activities.forEach(act => {
        let psid = act.metadata?.raw_id || act.metadata?.sender_id || act.metadata?.from?.id;
        const username = act.target_username;

        const normalize = (u: string) => u?.toLowerCase().replace('@', '').trim();
        const normalizedTarget = normalize(username);

        if (!psid && username) {
          psid = usernameToIdMap.get(normalizedTarget);
        }

        const key = `${act.instagram_account_id}-${psid || normalizedTarget}`;
        const current = uniqueContactsMap.get(key);
        const existingDbContact = dbContactsMap.get(key);

        const isDbValidUser = existingDbContact?.username && existingDbContact.username !== 'Instagram User' && existingDbContact.username !== 'Unknown' && !existingDbContact.username.includes('IG:');
        const isCurrentValidUser = current?.username && current.username !== 'Instagram User' && current.username !== 'Unknown' && !current.username.includes('IG:');
        const isActValidUser = username && username !== 'Instagram User' && username !== 'Unknown' && !username.includes('IG:');

        let finalUsername = 'Instagram User';
        if (isCurrentValidUser) finalUsername = current.username;
        else if (isDbValidUser) finalUsername = existingDbContact.username;
        else if (isActValidUser) finalUsername = username;
        else finalUsername = existingDbContact?.username || username || 'Instagram User';

        const isDbValidFull = existingDbContact?.full_name && existingDbContact.full_name !== 'Instagram User' && existingDbContact.full_name !== 'Unknown';
        const isCurrentValidFull = current?.full_name && current.full_name !== 'Instagram User' && current.full_name !== 'Unknown';
        const isActValidFull = act.metadata?.name && act.metadata.name !== 'Instagram User' && act.metadata.name !== 'Unknown';

        let finalFullName = finalUsername;
        if (isCurrentValidFull) finalFullName = current.full_name;
        else if (isDbValidFull) finalFullName = existingDbContact.full_name;
        else if (isActValidFull) finalFullName = act.metadata.name;
        else finalFullName = existingDbContact?.full_name || act.metadata?.name || finalUsername;

        if (!current || new Date(act.created_at) > new Date(current.last_interaction_at)) {
          uniqueContactsMap.set(key, {
            ...existingDbContact,
            ...current,
            user_id: user!.id,
            instagram_account_id: act.instagram_account_id,
            instagram_user_id: String(psid || normalizedTarget),
            username: finalUsername,
            full_name: finalFullName,
            avatar_url: act.metadata?.profilePic || current?.avatar_url || existingDbContact?.avatar_url || null,
            interaction_count: (current?.interaction_count || 0) + 1,
            last_interaction_at: act.created_at,
            platform: 'instagram'
          });
        } else {
          uniqueContactsMap.set(key, {
            ...existingDbContact,
            ...current,
            username: finalUsername,
            full_name: finalFullName,
            avatar_url: current?.avatar_url || existingDbContact?.avatar_url || act.metadata?.profilePic || null,
            interaction_count: (current?.interaction_count || 0) + 1
          });
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
              onClick={manualSync}
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
                              (contact.full_name && contact.full_name !== 'Instagram User' && !contact.full_name.startsWith('User '))
                                ? contact.full_name[0].toUpperCase()
                                : (contact.username?.startsWith('IG:') ? '?' : contact.username?.[0]?.toUpperCase() || '?')
                            )}
                          </div>
                          <div>
                            {(() => {
                              const isGeneratedId = !contact.username || contact.username === 'Instagram User' || contact.username === 'Unknown' || contact.username?.startsWith('IG:');
                              const hasRealName = contact.full_name && contact.full_name !== 'Instagram User' && !contact.full_name.startsWith('User ');

                              if (isGeneratedId) {
                                return (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-gray-900">
                                      {hasRealName ? contact.full_name : 'Instagram User'}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <>
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
                                </>
                              );
                            })()}
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
                          const psid = contact.instagram_user_id ? String(contact.instagram_user_id) : null;
                          const autos = (psid && automationNames[psid]) || automationNames[normalized] || contact.interacted_automations;

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
