import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Plus, ChevronDown, Trash2, Eye, MessageSquare, Image as ImageIcon, Mail, Bot, Pencil, Power, PowerOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { N8nWorkflowService } from '../lib/n8nService';
import ConfirmationModal from './ui/ConfirmationModal';
import { Skeleton } from './ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogOverlay, DialogPortal } from './ui/dialog';
import { Progress } from './ui/progress';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => {
  const { darkMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay, ease: "easeOut" }}
      className={cn(
        "relative rounded-3xl transition-all duration-500",
        darkMode
          ? "bg-transparent border-none shadow-none"
          : "border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl hover:border-white/80 hover:shadow-2xl hover:shadow-blue-500/5 group",
        !noPadding && "p-8",
        className
      )}
    >
      {!darkMode && <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />}
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
};

const GlassButton = React.forwardRef(({ children, variant = "primary", className, icon: Icon, onClick, loading = false, type = "button", disabled = false, ...props }: any, ref: any) => {
  const { darkMode } = useTheme();
  const { uiStyle } = useUIStyle();
  const { isPremium } = useSubscription();

  const activeGradient = isPremium
    ? "from-indigo-600 to-violet-700 shadow-indigo-500/50"
    : "from-blue-500 to-purple-600 shadow-purple-500/50";


  const variants = {
    primary: darkMode
      ? (uiStyle === 'genz' ? `bg-gradient-to-r ${activeGradient} text-white shadow-lg border-transparent hover:brightness-110` : "bg-white text-black shadow-lg shadow-white/10 hover:bg-gray-100 hover:shadow-white/20 border-transparent")
      : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110 border-transparent",
    secondary: darkMode
      ? "bg-white/5 text-white/60 hover:bg-white/10 border-white/5"
      : "bg-white/60 text-slate-700 hover:bg-white/90 border-slate-200/50 shadow-sm hover:shadow-md",
    danger: darkMode
      ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
      : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700 hover:border-red-200 shadow-sm",
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
      ref={ref}
      {...props}
    >
      {loading ? <Skeleton className="h-4 w-4 rounded-full bg-white/20 animate-shimmer" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
});

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
  trigger_config?: any;
}

const triggerLabels = {
  post_comment: 'Post Comment',
  story_reply: 'Story Reply',
  user_directed_messages: 'User Directed Messages'
};

export default function Automations() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const { isPremium, isGifted, automationLimit } = useSubscription();
  const { openModal } = useUpgradeModal();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [filteredAutomations, setFilteredAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'' | 'newest' | 'oldest' | 'name'>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'post_comment' | 'story_reply' | 'user_directed_messages'>('all');
  const [hasInstagramAccount, setHasInstagramAccount] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [automationToDelete, setAutomationToDelete] = useState<{ id: string, name: string } | null>(null);
  const [bulkToggling, setBulkToggling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkActionType, setBulkActionType] = useState<'activating' | 'deactivating'>('activating');
  const [isDeleting, setIsDeleting] = useState(false);
  const [toggleProgress, setToggleProgress] = useState(0);

  // 🔥 PERCEIVED PERFORMANCE: Toggle Progress Bar Logic
  useEffect(() => {
    let interval: any;
    if (togglingId) {
      setToggleProgress(0);
      let current = 0;
      interval = setInterval(() => {
        if (current < 70) {
          current += Math.random() * 20;
          if (current > 70) current = 70;
        } else if (current < 98) {
          current += 0.5;
        }
        setToggleProgress(current);
      }, 100);
    } else {
      setToggleProgress(0);
      if (interval) clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [togglingId]);

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
        .select('id, name, description, trigger_type, status, created_at, trigger_config, user_id')
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

    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    // --- SECURE PLAN LIMIT ENFORCEMENT (all plan types) ---
    if (newStatus === 'active') {
      const activeCount = automations.filter(a => a.status === 'active').length;
      // automationLimit comes from SubscriptionContext:
      //   basic = 3, gifted = from gifted_premium table, paid premium = 'Unlimited'
      const effectiveLimit = typeof automationLimit === 'number' ? automationLimit : null;

      if (effectiveLimit !== null && activeCount >= effectiveLimit) {
        if (isGifted) {
          toast.error("you have reached the limit - please upgrade to continue using", {
            action: {
              label: "Upgrade",
              onClick: () => openModal(undefined, "you have reached the limit - please upgrade to continue using")
            }
          });
          openModal(undefined, "you have reached the limit - please upgrade to continue using");
        } else if (!isPremium) {
          toast.error(`Basic plan allows only ${effectiveLimit} active automations. Please upgrade your plan.`, {
            action: {
              label: "Upgrade",
              onClick: () => openModal()
            }
          });
          openModal();
        } else {
          toast.error(`You have reached your plan limit of ${effectiveLimit} active automations.`);
          openModal();
        }
        return;
      }
    }

    // Optimistic update
    setAutomations(automations.map(auto =>
      auto.id === id ? { ...auto, status: newStatus as 'active' | 'inactive' } : auto
    ));

    setTogglingId(id);

    try {
      // 1. Trigger n8n sync if workflow exists (atomic update via Edge Function)
      if (n8nWorkflowId && user) {
        let result;
        if (newStatus === 'active') {
          result = await N8nWorkflowService.activateWorkflow(n8nWorkflowId, user.id);
        } else {
          result = await N8nWorkflowService.deactivateWorkflow(n8nWorkflowId, user.id);
        }
        
        if (!result.success) {
          throw new Error(result.message || `Failed to ${newStatus} in n8n`);
        }
      } else {
        // 2. Regular Supabase status update if no n8n workflow exists
        const { error } = await supabase
          .from('automations')
          .update({ status: newStatus })
          .eq('id', id);

        if (error) throw error;
      }

      // 3. Instant Subscribe: Prevent cold starts when activating (Background)
      if (newStatus === 'active') {
        (async () => {
          try {
            const { data: accounts } = await supabase
              .from('instagram_accounts')
              .select('id')
              .eq('status', 'active')
              .eq('user_id', user.id);

            if (accounts && accounts.length > 0) {
              await Promise.all(accounts.map(acc => 
                supabase.functions.invoke('manage-instagram-webhook', {
                  body: { accountId: acc.id, action: 'subscribe' }
                })
              ));
            }
          } catch (e) {
            console.warn('Background webhook subscribe failed:', e);
          }
        })();
      }

      toast.success(`Automation ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      
    } catch (error: any) {
      console.error('Error updating automation status:', error);
      toast.error(`Failed to update status: ${error.message || 'Unknown error'}. Reverting changes.`);

      // Revert optimistic update on error
      setAutomations(automations.map(auto =>
        auto.id === id ? { ...auto, status: currentStatus as 'active' | 'inactive' } : auto
      ));
    } finally {
      setTogglingId(null);
      // Final sync to ensure everything is correct
      await fetchAutomations();
    }
  };

  const bulkToggleAll = async (targetStatus: 'active' | 'inactive') => {
    if (bulkToggling) return;

    const toToggle = automations.filter(a => a.status !== targetStatus);
    if (toToggle.length === 0) {
      toast.info(`All automations are already ${targetStatus}.`);
      return;
    }

    // Plan limit check for activation
    if (targetStatus === 'active') {
      const effectiveLimit = typeof automationLimit === 'number' ? automationLimit : null;
      if (effectiveLimit !== null && (automations.filter(a => a.status === 'active').length + toToggle.length) > effectiveLimit) {
        toast.error(`Your plan allows only ${effectiveLimit} active automations.`);
        openModal();
        return;
      }
    }

    setBulkToggling(true);
    setBulkActionType(targetStatus === 'active' ? 'activating' : 'deactivating');
    setBulkTotal(toToggle.length);
    setBulkProgress(0);

    let successCount = 0;
    for (const auto of toToggle) {
      try {
        if (auto.n8n_workflow_id && user) {
          // Atomic Edge Function Call
          let result;
          if (targetStatus === 'active') {
            result = await N8nWorkflowService.activateWorkflow(auto.n8n_workflow_id, user.id);
          } else {
            result = await N8nWorkflowService.deactivateWorkflow(auto.n8n_workflow_id, user.id);
          }
          
          if (!result.success) {
            console.error(`Bulk toggle failed for ${auto.name}:`, result.message);
            continue; // Skip if n8n failed for this one
          }
        } else {
          // Fallback to simple DB update if no n8n workflow is linked
          const { error } = await supabase
            .from('automations')
            .update({ status: targetStatus })
            .eq('id', auto.id);
          if (error) throw error;
        }

        successCount++;
        setBulkProgress(prev => prev + 1);
      } catch (e) {
        console.error(`Failed to toggle ${auto.name}:`, e);
      }
    }

    // Trigger instant subscribe if activating
    if (targetStatus === 'active' && user) {
      try {
        const { data: accounts } = await supabase
          .from('instagram_accounts')
          .select('id')
          .eq('status', 'active')
          .eq('user_id', user.id);
        
        if (accounts && accounts.length > 0) {
          // Refresh connections for all accounts to be safe
          await Promise.all(accounts.map(acc => 
            supabase.functions.invoke('manage-instagram-webhook', {
              body: { accountId: acc.id, action: 'subscribe', force: true }
            })
          ));
        }
      } catch (_e) { /* best effort */ }
    }

    toast.success(`${successCount} automation${successCount !== 1 ? 's' : ''} ${targetStatus === 'active' ? 'activated' : 'deactivated'}.`);
    await fetchAutomations();
    setBulkToggling(false);
  };

  const handleDelete = (id: string, name: string, status: string) => {
    if (status === 'active') {
      toast.error('Please deactivate the workflow first before deleting it.');
      return;
    }
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
    <TooltipProvider delayDuration={0}>
      <div className={cn("flex-1 relative min-h-screen overflow-x-hidden p-4 md:p-8 transition-colors duration-500", darkMode ? "bg-black" : "bg-[#f8fafc]")}>
        {/* Animated Background Blobs */}
        {!darkMode && (
          <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
            <div className="absolute top-0 -left-4 w-96 h-96 bg-slate-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
            <div className="absolute top-1/4 -right-4 w-96 h-96 bg-blue-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=")`
            }}></div>
          </div>
        )}

        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className={cn("text-4xl font-bold tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-800")}>Automations</h1>
              <p className={cn("font-medium transition-colors", darkMode ? "text-white/40" : "text-slate-500")}>Create and manage your Instagram automations</p>
            </motion.div>

            <div className="flex items-center gap-3">
              {automations.length > 0 && (
                <>
                  <GlassButton
                    variant="secondary"
                    icon={Power}
                    onClick={() => bulkToggleAll('active')}
                    loading={bulkToggling}
                    disabled={bulkToggling || automations.every(a => a.status === 'active')}
                    className="hidden md:flex"
                  >
                    Activate All
                  </GlassButton>
                  <GlassButton
                    variant="secondary"
                    icon={PowerOff}
                    onClick={() => bulkToggleAll('inactive')}
                    loading={bulkToggling}
                    disabled={bulkToggling || automations.every(a => a.status === 'inactive')}
                    className="hidden md:flex"
                  >
                    Deactivate All
                  </GlassButton>
                </>
              )}
              <GlassButton
                icon={Plus}
                onClick={handleCreateAutomation}
                className="px-8 py-4 h-fit md:w-auto w-full hidden md:flex"
              >
                Create Automation
              </GlassButton>
            </div>
          </div>

          <GlassCard delay={0.1} className="py-4 px-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 relative group">
                <Search className={cn("absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors", darkMode ? "text-white/20" : "text-slate-400 group-focus-within:text-blue-500")} size={20} />
                <input
                  type="text"
                  placeholder="Search automations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "w-full pl-12 pr-4 py-3.5 rounded-2xl transition-all font-medium",
                    darkMode
                      ? "bg-white/5 border border-white/5 text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.08] focus:outline-none"
                      : "border border-slate-200/60 bg-white/50 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm hover:bg-white/80 text-slate-700 placeholder-slate-400"
                  )}
                />
              </div>

              <GlassButton
                icon={Plus}
                onClick={handleCreateAutomation}
                className="md:hidden w-full flex py-4 h-fit"
              >
                Create Automation
              </GlassButton>

              {automations.length > 0 && (
                <div className="md:hidden flex gap-3 w-full">
                  <GlassButton
                    variant="secondary"
                    icon={Power}
                    onClick={() => bulkToggleAll('active')}
                    loading={bulkToggling}
                    disabled={bulkToggling || automations.every(a => a.status === 'active')}
                    className="flex-1 py-3"
                  >
                    Activate All
                  </GlassButton>
                  <GlassButton
                    variant="secondary"
                    icon={PowerOff}
                    onClick={() => bulkToggleAll('inactive')}
                    loading={bulkToggling}
                    disabled={bulkToggling || automations.every(a => a.status === 'inactive')}
                    className="flex-1 py-3"
                  >
                    Deactivate All
                  </GlassButton>
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center w-full lg:w-auto flex-1">
                <div className="flex flex-row gap-4 w-full lg:w-auto order-1 lg:order-2">
                  <div className="flex-1 relative group">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as '' | 'newest' | 'oldest' | 'name')}
                      className={cn(
                        "appearance-none w-full pl-4 pr-10 py-3.5 rounded-2xl cursor-pointer font-bold shadow-sm transition-all text-sm",
                        darkMode
                          ? "bg-white/5 border border-white/5 text-white focus:border-white/20 focus:bg-white/[0.08]"
                          : "border border-slate-200/60 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white/50 text-slate-700 hover:bg-white/80"
                      )}
                    >
                      <option value="" disabled className={darkMode ? "bg-black" : ""}>Sort by</option>
                      <option value="newest" className={darkMode ? "bg-black" : ""}>Newest First</option>
                      <option value="oldest" className={darkMode ? "bg-black" : ""}>Oldest First</option>
                      <option value="name" className={darkMode ? "bg-black" : ""}>Name</option>
                    </select>
                    <ChevronDown className={cn("absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none", darkMode ? "text-white/20" : "text-slate-400")} size={18} />
                  </div>

                  <div className="flex-1 relative h-full group">
                    <select
                      value={triggerFilter}
                      onChange={(e) => setTriggerFilter(e.target.value as typeof triggerFilter)}
                      className={cn(
                        "appearance-none w-full pl-4 pr-10 py-3.5 rounded-2xl cursor-pointer font-bold shadow-sm transition-all text-sm",
                        darkMode
                          ? "bg-white/5 border border-white/5 text-white focus:border-white/20 focus:bg-white/[0.08]"
                          : "border border-slate-200/60 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white/50 text-slate-700 hover:bg-white/80"
                      )}
                    >
                      <option value="all" className={darkMode ? "bg-black" : ""}>All Triggers</option>
                      <option value="post_comment" className={darkMode ? "bg-black" : ""}>Post Comments</option>
                      <option value="story_reply" className={darkMode ? "bg-black" : ""}>Story Replies</option>
                      <option value="user_directed_messages" className={darkMode ? "bg-black" : ""}>DMs</option>
                    </select>
                    <ChevronDown className={cn("absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none", darkMode ? "text-white/20" : "text-slate-400")} size={18} />
                  </div>
                </div>

                <div className={cn(
                  "flex w-full lg:w-auto gap-1.5 p-1.5 backdrop-blur-sm rounded-2xl shadow-inner order-2 lg:order-1 transition-colors",
                  darkMode ? "bg-white/5 border border-white/5" : "bg-slate-100/50 border border-slate-200/50"
                )}>
                  {['all', 'active', 'inactive'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status as any)}
                      className={cn(
                        "flex-1 lg:px-5 py-2 rounded-xl text-sm font-bold transition-all",
                        statusFilter === status
                          ? (darkMode ? "bg-white text-black shadow-lg" : "bg-white text-blue-600 shadow-md ring-1 ring-slate-200")
                          : (darkMode ? "text-white/40 hover:text-white" : "text-slate-500 hover:text-slate-800 hover:bg-white/50")
                      )}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {loading ? (
            <div className="grid grid-cols-1 gap-6">
              {[...Array(3)].map((_, i) => (
                <GlassCard key={i} className="!p-0 overflow-hidden animate-shimmer">
                  <div className="flex h-32 md:h-40">
                    <div className="w-1 md:w-2 bg-slate-200 shrink-0" />
                    <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
                          <div className="space-y-2">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-full max-w-xl" />
                        <div className="flex gap-3">
                          <Skeleton className="h-8 w-24 rounded-xl" />
                          <Skeleton className="h-8 w-40 rounded-xl" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <Skeleton className="h-10 w-24 rounded-xl" />
                        <Skeleton className="h-10 w-10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : filteredAutomations.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {filteredAutomations.map((automation, index) => (
                <GlassCard
                  key={automation.id}
                  delay={0.2 + index * 0.05}
                  className={cn(
                    "group/card !p-0 overflow-hidden transition-all duration-500",
                    automation.status === 'active'
                      ? (darkMode
                        ? "bg-gradient-to-r from-indigo-500/10 via-blue-500/5 to-black border border-indigo-500/40 shadow-[0_0_50px_rgba(79,70,229,0.2)] ring-1 ring-indigo-500/30"
                        : "bg-gradient-to-r from-blue-100/90 via-indigo-50/60 to-white border-blue-200 shadow-2xl shadow-indigo-500/10 ring-1 ring-blue-500/20")
                      : ""
                  )}
                >
                  <div className="flex flex-col md:flex-row items-stretch">
                    {/* Status Indicator Bar */}
                    <div className={cn(
                      "w-1 md:w-2 shrink-0 transition-all duration-300",
                      automation.status === 'active'
                        ? "bg-gradient-to-b from-blue-500 to-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                        : "bg-slate-300"
                    )} />

                    <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-14 h-14 rounded-xl transition-colors shadow-sm overflow-hidden flex items-center justify-center shrink-0",
                            automation.status === 'active'
                              ? (darkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600")
                              : (darkMode ? "bg-white/5 text-white/20" : "bg-slate-100 text-slate-500")
                          )}>
                            {(() => {
                              switch (automation.trigger_type) {
                                case 'post_comment': return <MessageSquare className="h-6 w-6" />;
                                case 'story_reply': return <ImageIcon className="h-6 w-6" />;
                                case 'user_directed_messages': return <Mail className="h-6 w-6" />;
                                default: return <Bot className="h-6 w-6" />;
                              }
                            })()}
                          </div>
                          <div>
                            <h3 className={cn("text-xl font-bold transition-colors", darkMode ? "text-white group-hover/card:text-blue-400" : "text-slate-800 group-hover/card:text-blue-600")}>
                              {automation.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                automation.status === 'active'
                                  ? (darkMode ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700")
                                  : (darkMode ? "bg-white/5 text-white/40" : "bg-slate-100 text-slate-500")
                              )}>
                                {automation.status}
                              </span>
                              <span className={cn("transition-colors", darkMode ? "text-white/10" : "text-slate-300")}>•</span>
                              <span className={cn("text-xs font-medium transition-colors", darkMode ? "text-white/20" : "text-slate-400")}>
                                Created {new Date(automation.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {automation.description && (
                          <p className={cn("leading-relaxed max-w-2xl font-medium transition-colors", darkMode ? "text-white/40" : "text-slate-500")}>
                            {automation.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors", darkMode ? "bg-white/5 border-white/5" : "bg-blue-50/50 border-blue-100")}>
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider transition-colors", darkMode ? "text-blue-400" : "text-blue-400")}>Trigger</span>
                            <span className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-blue-700")}>{triggerLabels[automation.trigger_type as keyof typeof triggerLabels]}</span>
                          </div>


                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <GlassButton
                              variant="secondary"
                              icon={Eye}
                              onClick={() => navigate(`/automation/view/${automation.id}`)}
                              className="!p-3 rounded-xl"
                            />
                          </TooltipTrigger>
                          <TooltipContent>View</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <GlassButton
                              variant="secondary"
                              icon={Pencil}
                              disabled={automation.status === 'active'}
                              onClick={() => automation.status !== 'active' && navigate(`/automation/edit/${automation.id}`)}
                              className={cn(
                                "!p-3 rounded-xl",
                                automation.status === 'active' && "opacity-40 grayscale-[0.5] cursor-not-allowed"
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{automation.status === 'active' ? "Deactivate to edit" : "Edit"}</TooltipContent>
                        </Tooltip>
                        {/* Status Toggle Button */}
                        <div className="relative overflow-hidden rounded-2xl">
                          <button
                            onClick={() => !togglingId && toggleStatus(automation.id, automation.status, automation.n8n_workflow_id)}
                            disabled={togglingId === automation.id}
                            className={cn(
                              "group/toggle flex items-center gap-3 px-5 py-2.5 rounded-2xl border transition-all duration-500 relative min-w-[120px] justify-center overflow-hidden",
                              automation.status === 'active'
                                ? (darkMode ? "bg-blue-600/20 border-blue-500/30 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.1)]" : "bg-gradient-to-r from-blue-600 to-indigo-700 border-indigo-400 text-white shadow-lg shadow-blue-500/20")
                                : (darkMode ? "bg-white/5 border-white/10 text-white/40 hover:bg-white/10" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:shadow-sm")
                            )}
                          >
                            {/* Progress Overlay */}
                            {togglingId === automation.id && (
                              <motion.div
                                initial={{ width: '0%' }}
                                animate={{ width: `${toggleProgress}%` }}
                                className={cn(
                                  "absolute inset-y-0 left-0 z-0",
                                  automation.status === 'active' ? (darkMode ? "bg-blue-500/30" : "bg-white/20") : (darkMode ? "bg-white/10" : "bg-slate-100")
                                )}
                                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                              />
                            )}

                            <div className="relative z-10 flex items-center gap-2">
                              {togglingId === automation.id ? (
                                <>
                                  <div className={cn("h-3 w-3 animate-spin rounded-full border-2 border-t-transparent", automation.status === 'active' || darkMode ? "border-white" : "border-slate-400")} />
                                  <span className="text-[10px] font-black uppercase tracking-widest">
                                    {automation.status === 'active' ? 'ACTIVATING...' : 'DEACTIVATING...'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <div className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-500",
                                    automation.status === 'active'
                                      ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse"
                                      : (darkMode ? "bg-white/20" : "bg-slate-300")
                                  )} />
                                  <span className="text-xs font-black uppercase tracking-[0.15em]">
                                    {automation.status === 'active' ? 'Active' : 'Deactivated'}
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <GlassButton
                              variant="danger"
                              icon={Trash2}
                              onClick={() => handleDelete(automation.id, automation.name, automation.status)}
                              className="!p-3 rounded-xl"
                            />
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard className={cn("!p-16 text-center transition-all", darkMode ? "bg-white/5 border border-white/10 shadow-2xl shadow-black/50" : "!p-16 text-center")}>
              <div className="max-w-md mx-auto space-y-6">
                <div className={cn("w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-inner rotate-12 transition-transform hover:rotate-0", darkMode ? "bg-white/10 text-blue-400" : "bg-blue-50 text-blue-500")}>
                  <Bot size={40} className="animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className={cn("text-2xl font-bold transition-colors", darkMode ? "text-white" : "text-slate-800")}>
                    {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                      ? 'No matches found'
                      : 'Start Automating'}
                  </h3>
                  <p className={cn("font-medium leading-relaxed transition-colors", darkMode ? "text-white/60" : "text-slate-500")}>
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

        <Dialog open={bulkToggling}>
          <DialogContent className={cn(
            "sm:max-w-[380px] border-none overflow-hidden p-0 bg-transparent shadow-none"
          )} hideClose>
            <div className={cn(
              "relative rounded-[2.5rem] border border-white/20 p-6 shadow-2xl backdrop-blur-3xl overflow-hidden",
              darkMode ? "bg-slate-900/80 text-white" : "bg-white/80 text-slate-900"
            )}>
              {/* Dynamic Background Glow */}
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className={cn(
                  "absolute -top-12 -right-12 w-48 h-48 rounded-full blur-[80px] pointer-events-none",
                  bulkActionType === 'activating' ? "bg-blue-500/40" : "bg-rose-500/40"
                )}
              />
              <motion.div
                animate={{
                  scale: [1.2, 1, 1.2],
                  opacity: [0.2, 0.4, 0.2]
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className={cn(
                  "absolute -bottom-12 -left-12 w-64 h-64 rounded-full blur-[100px] pointer-events-none",
                  bulkActionType === 'activating' ? "bg-violet-500/30" : "bg-amber-500/30"
                )}
              />

              <DialogHeader className="relative z-10">
                <div className="flex items-center gap-4 mb-2">
                  <motion.div
                    animate={{
                      scale: [1, 1.05, 1],
                      rotate: [0, 5, -5, 0],
                      boxShadow: [
                        "0 0 0px rgba(59, 130, 246, 0.1)",
                        "0 0 20px rgba(59, 130, 246, 0.3)",
                        "0 0 0px rgba(59, 130, 246, 0.1)"
                      ]
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center border border-white/20 shadow-lg shrink-0",
                      darkMode ? "bg-slate-800" : "bg-white"
                    )}
                  >
                    <Bot className={cn("h-6 w-6", bulkActionType === 'activating' ? "text-blue-500" : "text-rose-500")} />
                  </motion.div>
                  <DialogTitle className="text-xl font-black tracking-tight text-left">
                    {bulkActionType === 'activating' ? 'Activating' : 'Deactivating'}
                    <span className={cn(
                      "inline-block ml-2 text-transparent bg-clip-text bg-gradient-to-r",
                      bulkActionType === 'activating' ? "from-blue-400 to-violet-500" : "from-rose-400 to-amber-500"
                    )}>
                      Automations
                    </span>
                  </DialogTitle>
                </div>
                <DialogDescription className={cn(
                  "text-left font-medium leading-normal text-xs",
                  darkMode ? "text-slate-400" : "text-slate-500"
                )}>
                  Syncing with servers. Please do not close this window.
                </DialogDescription>
              </DialogHeader>

              <div className="relative z-10 space-y-6 mt-8">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Progress Flow</span>
                    <span className="text-[10px] font-black tabular-nums">
                      {Math.floor((bulkProgress / bulkTotal) * 100)}%
                    </span>
                  </div>
                  <div className={cn(
                    "relative h-2 w-full rounded-full overflow-hidden border p-0.5",
                    darkMode ? "bg-black/40 border-white/5" : "bg-slate-100 border-slate-200"
                  )}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(bulkProgress / bulkTotal) * 100}%` }}
                      className={cn(
                        "h-full rounded-full relative overflow-hidden",
                        bulkActionType === 'activating'
                          ? "bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600"
                          : "bg-gradient-to-r from-rose-600 via-orange-500 to-amber-600"
                      )}
                    >
                      {/* Shimmer Effect */}
                      <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full"
                      />
                    </motion.div>
                  </div>
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-widest opacity-30 mt-1">
                    <span>Initialized</span>
                    <span>{bulkProgress} / {bulkTotal} Completed</span>
                  </div>
                </div>

                <motion.div
                  key={bulkProgress}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 rounded-2xl flex items-center justify-between border transition-all duration-500",
                    darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className={cn(
                        "h-2 w-2 rounded-full absolute animate-ping",
                        bulkActionType === 'activating' ? "bg-blue-500" : "bg-amber-500"
                      )} />
                      <div className={cn(
                        "h-2 w-2 rounded-full relative",
                        bulkActionType === 'activating' ? "bg-blue-500" : "bg-amber-500"
                      )} />
                    </div>
                    <span className="text-sm font-bold tracking-tight">
                      {bulkProgress === bulkTotal
                        ? 'Finalizing synchronization...'
                        : `Processing node ${bulkProgress + 1} of ${bulkTotal}...`}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        className="h-1 w-1 rounded-full bg-current opacity-20"
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
