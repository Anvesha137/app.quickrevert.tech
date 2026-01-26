import { useEffect, useState } from 'react';
import { Search, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ContactDetail from './ContactDetail';
import { N8nWorkflowService } from '../lib/n8nService';
import { useAuth } from '../contexts/AuthContext';

interface Contact {
  username: string;
  totalInteractions: number;
  lastContactDate: string;
  firstContactDate: string;
  avatar?: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
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
      // Fetch contacts from automation_activities table
      const { data, error } = await supabase
        .from('automation_activities')
        .select('target_username, created_at, activity_type, automation_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const contactsMap = new Map<string, Contact & { hasAutomatedInteraction: boolean }>();

      // Process automation_activities
      data?.forEach((activity) => {
        const username = activity.target_username;
        // Include new incoming types
        const isAutomated = !!activity.automation_id ||
          ['dm_sent', 'reply', 'reply_to_comment', 'incoming_message', 'incoming_comment', 'incoming_event'].includes(activity.activity_type);

        if (!contactsMap.has(username)) {
          contactsMap.set(username, {
            username,
            totalInteractions: 1,
            lastContactDate: activity.created_at,
            firstContactDate: activity.created_at,
            hasAutomatedInteraction: isAutomated,
          });
        } else {
          const contact = contactsMap.get(username)!;
          contact.totalInteractions++;
          if (new Date(activity.created_at) > new Date(contact.lastContactDate)) {
            contact.lastContactDate = activity.created_at;
          }
          if (new Date(activity.created_at) < new Date(contact.firstContactDate)) {
            contact.firstContactDate = activity.created_at;
          }
          if (isAutomated) {
            contact.hasAutomatedInteraction = true;
          }
        }
      });

      // Fetch n8n executions to extract recipient usernames
      // Limit to most recent 50 to avoid performance issues
      try {
        const executionsResult = await N8nWorkflowService.getExecutions(undefined, 50, user.id);

        if (executionsResult.executions && executionsResult.executions.length > 0) {
          // Process executions in parallel with limit to avoid too many simultaneous requests
          const processExecution = async (exec: any) => {
            // Quick optimization: if we already have many contacts, maybe skip deep inspection of every N8n exec
            // But for now, let's keep it but just be safer about adding "Unknown"

            try {
              // Try to extract from basic exec data first to avoid extra API calls
              let recipientUsername = null;

              // Try to find username in the execution data
              const execData = exec.data || exec;
              // Check for known patterns in our n8n workflows
              const httpRequestNode = execData?.resultData?.runData?.['HTTP Request'];
              if (httpRequestNode) {
                if (httpRequestNode[0]?.data?.main?.[0]?.[0]?.json?.username) {
                  recipientUsername = httpRequestNode[0].data.main[0][0].json.username;
                } else if (httpRequestNode[0]?.data?.json?.username) {
                  recipientUsername = httpRequestNode[0].data.json.username;
                }
              }

              if (!recipientUsername) {
                // Fallback: Check if any of our known component/node keys exist
                recipientUsername =
                  execData?.sender_name || // some workflows use this
                  execData?.from?.username ||
                  execData?.data?.body?.sender?.username || // generic webhook payload structure
                  execData?.body?.entry?.[0]?.messaging?.[0]?.sender?.id || // raw instagram webhook
                  null;
              }

              // If still null, and we really need to find it, we could fetch detailed execution
              // But let's only do that if the execution is recent and we don't have it

              if (recipientUsername && recipientUsername !== 'Unknown' && recipientUsername !== 'undefined') {
                return {
                  username: recipientUsername,
                  createdAt: exec.startedAt || exec.createdAt || new Date().toISOString()
                };
              }
            } catch (execErr) {
              console.error(`Error processing execution ${exec.id}:`, execErr);
            }
            return null;
          };

          // Process executions in batches of 5 to avoid overwhelming the API
          const batchSize = 5;
          for (let i = 0; i < executionsResult.executions.length; i += batchSize) {
            const batch = executionsResult.executions.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(processExecution));

            results.forEach((result) => {
              if (result && result.username) {
                const { username, createdAt } = result;

                // Only add if it's a valid username
                if (username === 'Unknown' || username.includes('undefined')) return;

                if (!contactsMap.has(username)) {
                  contactsMap.set(username, {
                    username,
                    totalInteractions: 1,
                    lastContactDate: createdAt,
                    firstContactDate: createdAt,
                    hasAutomatedInteraction: true,
                  });
                } else {
                  // If we already have it (likely from DB), just ensure automation flag is true
                  // We nominally trust DB dates more, but N8n might be "interaction" counts
                  const contact = contactsMap.get(username)!;
                  // Don't double count if timestamps are very close (handled loosely)
                  contact.hasAutomatedInteraction = true;
                }
              }
            });
          }
        }
      } catch (n8nError) {
        console.error('Error fetching n8n executions for contacts:', n8nError);
        // Continue with contacts from automation_activities even if n8n fails
      }

      const contactsList = Array.from(contactsMap.values())
        .filter(c => c.hasAutomatedInteraction)
        .sort(
          (a, b) => new Date(b.lastContactDate).getTime() - new Date(a.lastContactDate).getTime()
        );

      setContacts(contactsList);
      if (contactsList.length > 0 && !selectedContact) {
        setSelectedContact(contactsList[0].username);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = contacts.filter((contact) =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function formatTimeAgo(date: string) {
    const now = new Date();
    const contactDate = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - contactDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  }

  if (loading) {
    return (
      <div className="fixed top-0 bottom-0 left-64 right-0 flex bg-gray-50">
        <div className="w-96 border-r border-gray-200 bg-white p-4">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 bottom-0 left-64 right-0 flex bg-gradient-to-br from-gray-50 to-blue-50/20">
      <div className="w-96 border-r border-gray-200 bg-white/80 backdrop-blur-sm flex flex-col h-full shadow-lg">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-br from-white to-blue-50/30">
          <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Contacts</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm hover:border-gray-300 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <User className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 font-medium text-lg mb-2">No contacts found</p>
              <p className="text-sm text-gray-500">
                Contacts will appear here as your automations interact with users
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.username}
                  onClick={() => setSelectedContact(contact.username)}
                  className={`w-full p-4 flex items-center gap-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all text-left group ${selectedContact === contact.username
                    ? 'bg-gradient-to-r from-blue-50 via-cyan-50 to-transparent border-l-4 border-blue-600 shadow-sm'
                    : 'border-l-4 border-transparent'
                    }`}
                >
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow">
                      {contact.username[0].toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {contact.username}
                      </p>
                      <span className="text-xs text-gray-500 ml-2 font-semibold px-2 py-0.5 bg-gray-100 rounded-full">
                        {formatTimeAgo(contact.lastContactDate)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2 truncate font-medium">@{contact.username}</p>
                    <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-md w-fit">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <p className="text-xs text-green-700 font-semibold">
                        {contact.totalInteractions} interaction{contact.totalInteractions !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 h-full overflow-hidden">
        {selectedContact ? (
          <ContactDetail username={selectedContact} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-white via-blue-50/30 to-cyan-50/20">
            <div className="text-center">
              <div className="w-28 h-28 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                <User className="w-14 h-14 text-blue-600" />
              </div>
              <p className="text-gray-900 font-bold text-2xl mb-2">Select a contact</p>
              <p className="text-base text-gray-600">Choose a contact from the list to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
