import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Plus, ChevronDown, Trash2, Eye, Loader2, Sparkles } from 'lucide-react';
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { N8nWorkflowService } from '../lib/n8nService';
import ConfirmationModal from './ui/ConfirmationModal';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: delay, ease: "easeOut" }}
    className={cn(
      "relative rounded-3xl border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl transition-all hover:border-white/80 hover:shadow-2xl hover:shadow-blue-500/5 group",
      !noPadding && "p-8",
      className
    )}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />
    <div className="relative z-10 h-full">{children}</div>
  </motion.div>
);

const GlassButton = ({ children, variant = "primary", className, icon: Icon, onClick, loading = false, type = "button", disabled = false }: any) => {
  const variants = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110 border-transparent",
    secondary: "bg-white/60 text-slate-700 hover:bg-white/90 border-slate-200/50 shadow-sm hover:shadow-md",
    danger: "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700 hover:border-red-200 shadow-sm",
    ghost: "bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      type={type}
      disabled={loading || disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold transition-all border text-sm cursor-pointer",
        variants[variant as keyof typeof variants],
        (loading || disabled) && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
};

interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  trigger_type: 'post_comment' | 'story_reply' | 'user_directed_messages';
  created_at: string;
  updated_at: string;
  n8n_workflow_id?: string;
  webhook_path?: string;
  webhook_url?: string;
}

const triggerLabels = {
  post_comment: 'Post Comment',
  story_reply: 'Story Reply',
  user_directed_messages: 'User Directed Messages'
};

export default function Automations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [filteredAutomations, setFilteredAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'' | 'newest' | 'oldest' | 'name'>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'post_comment' | 'story_reply' | 'user_directed_messages'>('all');
  const [hasInstagramAccount, setHasInstagramAccount] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [automationToDelete, setAutomationToDelete] = useState<{ id: string, name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchAutomations();
    checkInstagramAccount();
  }, [user]);

  useEffect(() => {
    filterAndSortAutomations();
  }, [automations, searchQuery, sortBy, statusFilter, triggerFilter]);

  const fetchAutomations = async () => {
    if (!user) return;

    try {
      // Fetch automations
      const { data: automationsData, error: automationsError } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (automationsError) throw automationsError;

      // Fetch n8n workflows linked to automations
      const { data: workflowsData, error: workflowsError } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id, automation_id, webhook_path')
        .eq('user_id', user.id);

      if (workflowsError) {
        console.error('Error fetching workflows:', workflowsError);
        // Continue without workflows if there's an error
      }

      // Get N8N base URL from environment (or construct webhook URL)
      const n8nBaseUrl = import.meta.env.VITE_N8N_BASE_URL || '';

      // Map workflows to automations (only those with automation_id)
      const workflowsMap = new Map(
        workflowsData?.filter(w => w.automation_id).map(w => [
          w.automation_id,
          {
            n8n_workflow_id: w.n8n_workflow_id,
            webhook_path: w.webhook_path,
            webhook_url: w.webhook_path && n8nBaseUrl ? `${n8nBaseUrl}/webhook/${w.webhook_path}` : undefined
          }
        ]) || []
      );

      const automationsWithWorkflows = (automationsData || []).map(automation => {
        const workflow = workflowsMap.get(automation.id);
        return {
          ...automation,
          n8n_workflow_id: workflow?.n8n_workflow_id,
          webhook_path: workflow?.webhook_path,
          webhook_url: workflow?.webhook_url
        };
      });

      setAutomations(automationsWithWorkflows);
    } catch (error) {
      console.error('Error fetching automations:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkInstagramAccount = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      setHasInstagramAccount(!!data);
    } catch (error) {
      console.error('Error checking Instagram account:', error);
    }
  };

  const filterAndSortAutomations = () => {
    let filtered = [...automations];

    if (searchQuery) {
      filtered = filtered.filter(auto =>
        auto.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        auto.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(auto => auto.status === statusFilter);
    }

    if (triggerFilter !== 'all') {
      filtered = filtered.filter(auto => auto.trigger_type === triggerFilter);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    setFilteredAutomations(filtered);
  };

  const handleCreateAutomation = () => {
    if (!hasInstagramAccount) {
      toast.error('Please connect an Instagram account before creating automations.');
      navigate('/connect-accounts');
      return;
    }
    navigate('/automation/create');
  };

  const toggleStatus = async (id: string, currentStatus: string, n8nWorkflowId?: string) => {
    if (togglingId === id) return;

    // Optimistic update
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setAutomations(automations.map(auto =>
      auto.id === id ? { ...auto, status: newStatus as 'active' | 'inactive' } : auto
    ));

    // We don't set togglingId here because we want the UI to be responsive immediately
    // and not show a loading spinner that blocks interaction, unless we want to debounce.
    // However, to prevent spamming, we can still track it but not disable the UI visually in a blocking way, 
    // or just rely on the fast UI response. 
    // Let's keep togglingId to prevent double-clicks on the same item while a request is in flight.
    setTogglingId(id);

    try {
      // Update automation status in Supabase
      const { error } = await supabase
        .from('automations')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Update n8n workflow status if workflow exists
      if (n8nWorkflowId && user) {
        try {
          if (newStatus === 'active') {
            await N8nWorkflowService.activateWorkflow(n8nWorkflowId, user.id);
          } else {
            await N8nWorkflowService.deactivateWorkflow(n8nWorkflowId, user.id);
          }
        } catch (n8nError) {
          console.error('Error updating n8n workflow status:', n8nError);
          // Optional: Revert if n8n fails? 
          // For now, we'll keep the Supabase status as the source of truth, 
          // but warn the user that n8n might not be in sync.
        }
      }
    } catch (error) {
      console.error('Error updating automation status:', error);
      toast.error('Failed to update automation status. Reverting changes.');

      // Revert optimistic update on error
      setAutomations(automations.map(auto =>
        auto.id === id ? { ...auto, status: currentStatus as 'active' | 'inactive' } : auto
      ));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setAutomationToDelete({ id, name });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!automationToDelete) return;

    setIsDeleting(true);
    const { id } = automationToDelete;

    try {
      // First, get the n8n workflow ID if it exists
      let n8nWorkflowId: string | undefined;
      if (user) {
        const { data: workflowData } = await supabase
          .from('n8n_workflows')
          .select('n8n_workflow_id')
          .eq('automation_id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        n8nWorkflowId = workflowData?.n8n_workflow_id;
      }

      // Delete from n8n if workflow exists
      if (n8nWorkflowId && user) {
        try {
          await N8nWorkflowService.deleteWorkflow(n8nWorkflowId, user.id);
        } catch (n8nError) {
          console.error('Error deleting n8n workflow:', n8nError);
          // Continue with database deletion even if n8n deletion fails
        }
      }

      // Delete automation from database
      const { error } = await supabase
        .from('automations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAutomations(automations.filter(auto => auto.id !== id));
      toast.success('Automation deleted successfully');
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error('Failed to delete automation. Please try again.');
    } finally {
      setIsDeleting(false);
      setAutomationToDelete(null);
    }
  };

  return (
    <div className="flex-1 relative min-h-screen overflow-x-hidden p-4 md:p-8">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-slate-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-1/4 -right-4 w-96 h-96 bg-blue-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=")`
        }}></div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold text-slate-800 tracking-tight">Automations</h1>
            <p className="text-slate-500 font-medium">Create and manage your Instagram automations</p>
          </motion.div>

          <GlassButton
            icon={Plus}
            onClick={handleCreateAutomation}
            className="px-8 py-4 h-fit md:w-auto w-full"
          >
            Create Automation
          </GlassButton>
        </div>

        <GlassCard delay={0.1} className="py-4 px-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input
                type="text"
                placeholder="Search automations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 border border-slate-200/60 bg-white/50 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm hover:bg-white/80 transition-all font-medium text-slate-700 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as '' | 'newest' | 'oldest' | 'name')}
                  className="appearance-none w-full pl-4 pr-10 py-3.5 border border-slate-200/60 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white/50 cursor-pointer font-bold text-slate-700 shadow-sm hover:bg-white/80 transition-all min-w-[160px] text-sm"
                >
                  <option value="" disabled>Sort by</option>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>

              <div className="flex gap-1.5 p-1.5 bg-slate-100/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-inner">
                {['all', 'active', 'inactive'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status as any)}
                    className={cn(
                      "px-5 py-2 rounded-xl text-sm font-bold transition-all",
                      statusFilter === status
                        ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                    )}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              <div className="relative h-full">
                <select
                  value={triggerFilter}
                  onChange={(e) => setTriggerFilter(e.target.value as typeof triggerFilter)}
                  className="appearance-none pl-4 pr-10 py-3.5 border border-slate-200/60 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white/50 cursor-pointer font-bold text-slate-700 shadow-sm hover:bg-white/80 transition-all min-w-[180px] text-sm"
                >
                  <option value="all">All Triggers</option>
                  <option value="post_comment">Post Comments</option>
                  <option value="story_reply">Story Replies</option>
                  <option value="user_directed_messages">DMs</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
            <p className="text-slate-400 font-medium animate-pulse">Loading your automations...</p>
          </div>
        ) : filteredAutomations.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {filteredAutomations.map((automation, index) => (
              <GlassCard
                key={automation.id}
                delay={0.2 + index * 0.05}
                className="group/card !p-0 overflow-hidden"
              >
                <div className="flex flex-col md:flex-row items-stretch">
                  {/* Status Indicator Bar */}
                  <div className={cn(
                    "w-1 md:w-2 shrink-0 transition-all duration-300",
                    automation.status === 'active'
                      ? "bg-gradient-to-b from-emerald-400 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                      : "bg-slate-300"
                  )} />

                  <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2.5 rounded-xl transition-colors shadow-sm",
                          automation.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                        )}>
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-800 group-hover/card:text-blue-600 transition-colors">
                            {automation.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                              automation.status === 'active'
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            )}>
                              {automation.status}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-400 font-medium">
                              Created {new Date(automation.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {automation.description && (
                        <p className="text-slate-500 leading-relaxed max-w-2xl font-medium">
                          {automation.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-xl">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Trigger</span>
                          <span className="text-sm font-bold text-blue-700">{triggerLabels[automation.trigger_type as keyof typeof triggerLabels]}</span>
                        </div>

                        {automation.webhook_url && (
                          <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 px-3 py-1.5 rounded-xl max-w-xs md:max-w-md">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Webhook</span>
                            <span className="text-xs font-mono text-indigo-600 truncate">{automation.webhook_url}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                      <GlassButton
                        variant="secondary"
                        icon={Eye}
                        onClick={() => navigate(`/automation/view/${automation.id}`)}
                        className="!p-3 rounded-xl"
                      />

                      <div className="flex items-center gap-3 px-4 py-2 bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-sm">
                        <span className={cn(
                          "text-xs font-bold transition-colors",
                          automation.status === 'active' ? "text-emerald-600" : "text-slate-400"
                        )}>
                          {automation.status === 'active' ? 'ON' : 'OFF'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={automation.status === 'active'}
                            onChange={() => toggleStatus(automation.id, automation.status, automation.n8n_workflow_id)}
                            disabled={togglingId === automation.id}
                          />
                          <div className={cn(
                            "w-11 h-6 rounded-full transition-all duration-300 peer",
                            "bg-slate-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm",
                            "peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-teal-500 peer-checked:after:translate-x-full peer-checked:after:rotate-180",
                            togglingId === automation.id && "opacity-50 cursor-wait"
                          )}></div>
                        </label>
                      </div>

                      <GlassButton
                        variant="danger"
                        icon={Trash2}
                        onClick={() => handleDelete(automation.id, automation.name)}
                        className="!p-3 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="!p-16 text-center">
            <div className="max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner rotate-12 transition-transform hover:rotate-0">
                <Sparkles size={40} className="animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-800">
                  {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                    ? 'No matches found'
                    : 'Start Automating'}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                    ? 'Try adjusting your filters or search query to find what you are looking for.'
                    : 'Connect your Instagram account and build your first intelligent automation journey today.'}
                </p>
              </div>
              <GlassButton
                icon={Plus}
                onClick={handleCreateAutomation}
                className="mx-auto px-10"
              >
                Create Automation
              </GlassButton>
            </div>
          </GlassCard>
        )}
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Automation"
        message={`Are you sure you want to delete "${automationToDelete?.name}"? This action cannot be undone and all associated workflows will be removed.`}
        confirmLabel="Delete Permanently"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
