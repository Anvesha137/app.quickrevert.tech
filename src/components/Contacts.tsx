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
        const psid = (act.metadata as any)?.raw_id || (act.metadata as any)?.sender_id || (act.metadata as any)?.from?.id;

        // Normalize
        const normalizedUser = username?.toLowerCase().replace('@', '').trim();
        const contactKey = psid ? String(psid) : normalizedUser;

        if (!contactKey) return;

        // Find automation name
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

      // Fetch connected Instagram account usernames to exclude from contacts
      const { data: igAccounts } = await supabase
        .from('instagram_accounts')
        .select('username')
        .eq('user_id', user.id)
        .eq('status', 'active');
      const connectedUsernames = (igAccounts || []).map(a => a.username?.toLowerCase().trim()).filter(Boolean);
      setOwnUsernames(connectedUsernames);

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
    const validContacts = (data || [])
      .filter(c => {
        // Exclude connected Instagram account(s)
        const normalized = c.username?.toLowerCase().trim();
        return !ownUsernames.includes(normalized);
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

      // Fetch existing contacts to preserve N8n database updates
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

        // Normalize username for matching
        const normalize = (u: string) => u?.toLowerCase().replace('@', '').trim();
        const normalizedTarget = normalize(username);

        // Try to backfill PSID if missing
        if (!psid && username) {
          psid = usernameToIdMap.get(normalizedTarget);
        }

        // Build a unique key per contact per instagram account
        const key = `${act.instagram_account_id}-${psid || normalizedTarget}`;
        const current = uniqueContactsMap.get(key);
        const existingDbContact = dbContactsMap.get(key);

        // Preserve valid usernames fetched by N8n or existing in DB
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
            ...existingDbContact, // Preserve DB internal fields like id, created_at if it exists
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
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#5a5f85]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-medium">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-screen overflow-x-hidden bg-[#5a5f85]">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-white/10 rounded-full mix-blend-overlay filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-indigo-200/10 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-2000"></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <UsersIcon className="w-8 h-8 text-indigo-200" />
              Contacts
            </h1>
            <p className="text-indigo-100 mt-1">Track and manage your automated audience interactions</p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => {
                syncHistoricalContacts().then(() => fetchContacts());
              }}
              disabled={isSyncing}
              className="flex items-center gap-2 px-6 py-3.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-sm font-bold text-white hover:bg-white/10 hover:shadow-lg transition-all disabled:opacity-50"
            >
              <Clock className={cn("w-4 h-4 text-indigo-200", isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync History'}
            </button>

            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by username or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-white/20 shadow-lg transition-all text-white placeholder-indigo-200"
              />
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-5 text-xs font-bold text-indigo-100 uppercase tracking-widest">User Details</th>
                  <th className="px-6 py-5 text-xs font-bold text-indigo-100 uppercase tracking-widest">Follow Status</th>
                  <th className="px-6 py-5 text-xs font-bold text-indigo-100 uppercase tracking-widest">Automations</th>
                  <th className="px-6 py-5 text-xs font-bold text-indigo-100 uppercase tracking-widest text-center">Interactions</th>
                  <th className="px-6 py-5 text-xs font-bold text-indigo-100 uppercase tracking-widest">Last Active</th>
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
                        <p className="text-white font-bold text-lg">No contacts yet</p>
                        <p className="text-indigo-100 text-sm max-w-xs mx-auto">Connect your Instagram and start your first automation to see your audience here.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
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
                                    <span className="text-sm font-bold text-white">
                                      {hasRealName ? contact.full_name : 'Instagram User'}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">@{contact.username}</span>
                                    <a
                                      href={`https://instagram.com/${contact.username}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-200 hover:text-white transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <div className="text-xs text-indigo-100 font-medium">{contact.full_name || 'Instagram User'}</div>
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
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 text-indigo-100 text-[10px] font-bold uppercase tracking-wider border border-white/10">
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
                            <div className="text-xs font-bold text-indigo-100 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 inline-block max-w-[200px] truncate" title={autos.join(', ')}>
                              {autos.join(', ')}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[10px] font-medium italic">No triggers yet</span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-xl text-white font-bold text-sm shadow-sm border border-white/10">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-200" />
                          {contact.interaction_count}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2.5 text-xs font-medium text-indigo-100">
                          <Clock className="w-4 h-4 text-white/40" />
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
