import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  AutomationFormData, TriggerType, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
  ConversationFlowTriggerConfig, LeadManagerTriggerConfig,
  ReplyToCommentAction, SendDmAction
} from '../types/automation';
import { N8nWorkflowService } from '../lib/n8nService';
import TriggerSelection from './automation-steps/TriggerSelection';
import AutomationConfigureGenz from './automation-steps/AutomationConfigure_genz';
import { getPendingUpload, isBlobUrl, clearPendingUpload } from '../lib/pendingUploads';
import { uploadAutomationAsset } from '../lib/storage';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => {
  const { darkMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: delay, ease: "easeOut" }}
      className={cn(
        "relative rounded-3xl transition-all duration-500 overflow-hidden",
        darkMode 
          ? "bg-transparent border-none shadow-none" 
          : "border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl hover:border-white/80 group",
        !noPadding && "p-8",
        className
      )}
    >
      {!darkMode && <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};

type Step = 'setup' | 'configuration';

interface AutomationCreateProps {
  readOnly?: boolean;
}

export default function AutomationCreate({ readOnly = false }: AutomationCreateProps) {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const { isPremium: subIsPremium, hasInstagramConnected, loading: subLoading, initialFetchDone } = useSubscription();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  // For view mode, show configuration directly if loaded, or just stick to 'setup' -> 'configuration' flow but pre-filled?
  // Better to just show steps as usual but disabled.
  const [searchParams, setSearchParams] = useSearchParams();
  const stepRaw = searchParams.get('step');
  
  // Map numeric steps from Millennial theme to Gen Z string steps
  const getMappedStep = (raw: string | null): Step => {
    if (raw === '1' || raw === '2' || raw === 'configuration') return 'configuration';
    return 'setup'; // Default or '0' or 'setup'
  };
  
  const currentStep = getMappedStep(stepRaw);

  const setCurrentStep = (newStep: Step) => {
    setSearchParams({ step: newStep });
  };
  const LOCAL_STORAGE_KEY = 'quickrevert_automation_draft';

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<AutomationFormData>(() => {
    if (!id && !readOnly) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return parsed.formData || {
            name: '',
            triggerType: null,
            triggerConfig: null,
            actions: [],
          };
        }
      } catch (e) {
        console.error('Failed to parse saved draft:', e);
      }
    }
    return {
      name: '',
      triggerType: null,
      triggerConfig: null,
      actions: [],
    };
  });

  useEffect(() => {
    if (!id && !readOnly) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
        ...parsed,
        formData,
        step: currentStep,
        updatedAt: Date.now()
      }));
    }
  }, [formData, currentStep, id, readOnly]);

  // Restore step on mount if not provided in URL
  useEffect(() => {
    if (!id && !readOnly && !searchParams.get('step')) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.step && parsed.step !== 'setup') {
            setSearchParams({ step: parsed.step });
          }
        }
      } catch (e) { console.error('Failed to restore step:', e); }
    }
  }, []);

  // Proactive cleanup: Remove stale blob URLs from state if their File is no longer in memory (e.g. after refresh)
  useEffect(() => {
    if (!id && !readOnly) {
      setFormData(prev => {
        let changed = false;
        const cleanedActions = (prev.actions || []).map(action => {
          const newAction = { ...action };
          
          if (newAction.imageUrl && isBlobUrl(newAction.imageUrl) && !getPendingUpload(newAction.imageUrl)) {
            newAction.imageUrl = '';
            changed = true;
          }

          if (newAction.carouselCards) {
            const newCards = newAction.carouselCards.map((c: any) => {
              if (c.imageUrl && isBlobUrl(c.imageUrl) && !getPendingUpload(c.imageUrl)) {
                changed = true;
                return { ...c, imageUrl: '' };
              }
              return c;
            });
            if (changed) newAction.carouselCards = newCards;
          }

          if (newAction.conversationCards) {
             const newCards = newAction.conversationCards.map((c: any) => {
              if (c.imageUrl && isBlobUrl(c.imageUrl) && !getPendingUpload(c.imageUrl)) {
                changed = true;
                return { ...c, imageUrl: '' };
              }
              return c;
            });
            if (changed) newAction.conversationCards = newCards;
          }

          return newAction;
        });

        if (!changed) return prev;
        return { ...prev, actions: cleanedActions };
      });
    }
  }, [id, readOnly]);

  useEffect(() => {
    if (!subLoading && initialFetchDone && !hasInstagramConnected) {
      toast.error('Please connect an Instagram account before creating automations.');
      navigate('/connect-accounts');
    }
  }, [hasInstagramConnected, subLoading, initialFetchDone, navigate]);

  const [wasLoaded, setWasLoaded] = useState(false);

  useEffect(() => {
    if (id && !wasLoaded) {
      fetchAutomation(id);
    }
  }, [user, id, wasLoaded]);

  const fetchAutomation = async (automationId: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('id', automationId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (data) {
        // Safety: Prevent editing if active
        if (data.status === 'active' && !readOnly) {
          toast.error('This automation is active. Please deactivate it first to make changes.', {
            description: 'Redirecting to view mode...',
            duration: 5000,
          });
          navigate(`/automation/view/${automationId}`, { replace: true });
          return;
        }

        setFormData({
          name: data.name,
          triggerType: data.trigger_type,
          triggerConfig: data.trigger_config,
          actions: data.actions || [],
        });
        setWasLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching automation:', error);
      toast.error('Failed to load automation details');
      navigate('/automation');
    } finally {
    }
  };


  const steps = [
    { id: 'setup', name: 'Step 1: Setup', completed: formData.name.trim().length > 0 && formData.triggerType !== null },
    { id: 'configuration', name: 'Step 2: Configure', completed: formData.triggerConfig !== null && formData.actions.length > 0 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);



  const validateTriggerConfig = (type: TriggerType, config: TriggerConfig): { message: string, sectionId: string } | null => {
    if (type === 'post_comment') {
      const c = config as PostCommentTriggerConfig;
      if (c.postsType === 'specific' && (!c.specificPosts || c.specificPosts.length === 0)) {
        return { message: "Please select at least one post.", sectionId: 'genz-post-selection' };
      }
      if (c.commentsType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'genz-keyword-selection' };
      }
    } else if (type === 'story_reply') {
      const c = config as StoryReplyTriggerConfig;
      if (c.storiesType === 'specific' && (!c.specificStories || c.specificStories.length === 0)) {
        return { message: "Please select at least one story.", sectionId: 'genz-post-selection' };
      }
      if (c.replyType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'genz-keyword-selection' };
      }
    } else if (type === 'user_directed_messages') {
      const c = config as UserDirectMessageTriggerConfig;
      if (c.messageType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'genz-keyword-selection' };
      }
    }
    return null;
  };

  // Re-implementing handleSave just to be safe with the replace block
  const executeSave = async () => {
    if (!user) {
      console.error('No user authenticated');
      toast.error('You must be logged in to create an automation');
      return;
    }

    if (!formData.name.trim()) {
      console.error('Automation name is required');
      toast.error('Please provide a name for your automation');
      return;
    }

    if (!formData.triggerType) {
      console.error('Trigger type is required');
      toast.error('Please select a trigger type');
      return;
    }

    if (!formData.triggerConfig) {
      console.error('Trigger configuration is required');
      toast.error('Please configure your trigger');
      return;
    }

    const configError = validateTriggerConfig(formData.triggerType, formData.triggerConfig);
    if (configError) {
      toast.error(configError.message);
      const el = document.getElementById(configError.sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    if (formData.actions.length === 0) {
      console.error('At least one action is required');
      toast.error('Please add at least one action to your automation');
      return;
    }

    setSaving(true);

    try {
      // --- Upload Phase: Process any pending local images ---
      // We clone the actions to avoid mutating the UI state directly while saving
      const finalActions = JSON.parse(JSON.stringify(formData.actions));

      const processActions = async (actions: any[]) => {
        for (const action of actions) {
          // 1. Simple Image
          if (action.imageUrl && isBlobUrl(action.imageUrl)) {
            const file = getPendingUpload(action.imageUrl);
            if (file) {
              const permanentUrl = await uploadAutomationAsset(file);
              clearPendingUpload(action.imageUrl);
              action.imageUrl = permanentUrl;
            } else {
              throw new Error('One of your images (Simple Message) is no longer available. Please select it again before saving.');
            }
          }

          // 2. Carousel Cards
          if (action.carouselCards && Array.isArray(action.carouselCards)) {
            for (const card of action.carouselCards) {
              if (card.imageUrl && isBlobUrl(card.imageUrl)) {
                const file = getPendingUpload(card.imageUrl);
                if (file) {
                  const permanentUrl = await uploadAutomationAsset(file);
                  clearPendingUpload(card.imageUrl);
                  card.imageUrl = permanentUrl;
                } else {
                  throw new Error(`The image for carousel card "${card.title || 'Untitled'}" is no longer available. Please select it again.`);
                }
              }
            }
          }

          // 3. Conversation Flow Cards
          if (action.conversationCards && Array.isArray(action.conversationCards)) {
            for (const card of action.conversationCards) {
              if (card.imageUrl && isBlobUrl(card.imageUrl)) {
                const file = getPendingUpload(card.imageUrl);
                if (file) {
                  const permanentUrl = await uploadAutomationAsset(file);
                  clearPendingUpload(card.imageUrl);
                  card.imageUrl = permanentUrl;
                } else {
                  throw new Error(`The image for menu card "${card.title || card.messageTemplate?.substring(0, 10) || 'Untitled'}" is no longer available. Please select it again.`);
                }
              }
            }
          }
        }
      };

      await processActions(finalActions);
      // --- End Upload Phase ---

      console.log(`${id ? 'Updating' : 'Saving'} automation:`, {
        user_id: user.id,
        name: formData.name.trim(),
        trigger_type: formData.triggerType,
        trigger_config: formData.triggerConfig,
        actions: finalActions,
        status: 'active',
      });

      let automationData;

      if (id) {
        // Update existing automation
        const { data, error } = await supabase
          .from('automations')
          .update({
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: finalActions,
            // Don't reset status on edit, or maybe we should?
            // Usually editing deactivates to ensure sync, but let's keep it simple for now or follow business logic.
            // Let's NOT update status automatically on edit unless passed.
            // But wait, if we change logic, we need to regenerate workflow.
            // So we should probably set to inactive to force re-activation? 
            // The user requested "make sure one can edit the wokflow too".
            // If we update, we MUST regenerate the N8N workflow.
          })
          .eq('id', id)
          .select('id')
          .single();

        if (error) throw error;
        automationData = data;
      } else {
        // Create new automation
        const { data, error } = await supabase
          .from('automations')
          .insert({
            user_id: user.id,
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: finalActions,
            status: 'active',
          }).select('id').single();

        if (error) throw error;
        automationData = data;
      }

      // Re-generate N8N workflow (for both create and update)
      try {
        // existing logic...
        const { data: instagramAccount } = await supabase
          .from('instagram_accounts')
          .select('id, instagram_user_id, username')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('connected_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!instagramAccount) {
          console.warn('No active Instagram account found for user. Workflow will not be created.');
          toast.warning('Warning: Automation saved but no Instagram account found. Please connect an Instagram account to create workflows.');
          navigate('/automation');
          return;
        }

        // Create workflow using the service
        const workflowName = `${formData.name.trim()} - ${new Date().toISOString().split('T')[0]}`;

        const replyAction = finalActions.find((a: any) => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
        const replyMessage = replyAction?.replyTemplates?.[0] || 'Thanks for your comment!';

        const dmAction = finalActions.find((a: any) => a.type === 'send_dm') as SendDmAction | undefined;
        const dmTitle = dmAction?.title || 'Hi there!';

        const result = await N8nWorkflowService.createWorkflow({
          template: 'instagram_automation_v1',
          instagramAccountId: instagramAccount.id,
          workflowName: workflowName,
          automationId: automationData.id,
          variables: {
            brandName: 'QuickRevert',
            replyMessage: replyMessage,
            dmTitle: dmTitle,
            dmImageUrl: (dmAction?.showImage && dmAction?.imageUrl) ? dmAction.imageUrl : '',
          },
          autoActivate: true,
        }, user.id);

        console.log('N8N workflow created successfully:', result);

        // The workflow mapping is already stored by the backend function
        // No need to store it again here
      } catch (n8nError: any) {
        console.error('Error in N8N workflow creation process:', n8nError);
        // Don't throw an error here as the main automation was saved
        // Just log the issue and continue
        toast.warning(`Warning: Automation saved but workflow creation failed: ${n8nError.message || 'Unknown error'}. This may affect automation functionality.`);
      }

      // Clear draft on successful save
      localStorage.removeItem(LOCAL_STORAGE_KEY);

      navigate('/automation');
    } catch (error: any) {
      console.error('Error creating automation:', error);
      toast.error(`Failed to create automation: ${error.message || 'Please try again'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex-1 relative min-h-screen overflow-x-hidden p-4 md:p-8 transition-colors duration-500", darkMode ? "bg-black" : "bg-[#f8fafc]")}>
      {/* Animated Background Blobs */}
      {!darkMode && (
        <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
          <div className="absolute top-0 -left-4 w-[500px] h-[500px] bg-blue-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob opacity-70"></div>
          <div className="absolute top-1/4 -right-4 w-[500px] h-[500px] bg-indigo-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000 opacity-60"></div>
          <div className="absolute -bottom-20 left-1/4 w-[600px] h-[600px] bg-slate-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000 opacity-50"></div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 md:p-6 rounded-3xl transition-all duration-300",
            darkMode 
              ? "bg-transparent border-none" 
              : "bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm"
          )}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/automation')}
              className={cn("transition-colors font-bold text-base", darkMode ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-purple-600")}
            >
              Automation
            </button>
            <span className={cn("transition-colors text-lg", darkMode ? "text-white/20" : "text-slate-300")}>/</span>
 
            <div className="flex items-center group relative">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => !readOnly && setFormData({ ...formData, name: e.target.value })}
                placeholder="Untitled*"
                disabled={readOnly}
                className={cn(
                  "bg-transparent border-none outline-none text-2xl md:text-3xl font-black placeholder-white/20 focus:ring-0 p-0 w-[300px] transition-all",
                  darkMode ? "text-white" : "text-slate-800 placeholder-slate-400"
                )}
              />
              {!readOnly && <Pencil size={20} className={cn("ml-3 transition-colors", darkMode ? "text-white/40" : "text-slate-400")} />}
            </div>
          </div>
 
          <div className="flex items-center gap-4">
            <button
              onClick={executeSave}
              disabled={saving || readOnly}
              className={cn(
                "px-6 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2",
                darkMode 
                  ? `bg-gradient-to-r ${subIsPremium ? 'from-indigo-600 to-violet-700 shadow-indigo-500/50' : 'from-blue-500 to-purple-600 shadow-purple-500/50'} text-white hover:brightness-110 border-transparent`
                  : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-md shadow-purple-500/20"
              )}
            >
              <Check size={18} className="stroke-[3]" />
              {saving ? 'Saving...' : 'Save Automation'}
            </button>
          </div>
        </motion.div>

        {/* Stepper */}
        {currentStep !== 'setup' && (
          <div className="relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pt-4">
              <div className="flex items-center gap-4 relative px-2">
                {steps.map((step, index) => {
                  const isActive = currentStep === step.id;
                  const isCompleted = step.completed && currentStepIndex > index;
                  const isFuture = index > currentStepIndex;

                  if (isFuture) return null;

                  return (
                    <div key={step.id} className="flex items-center gap-3 relative z-10">
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                          "w-10 h-10 rounded-2xl flex items-center justify-center font-bold transition-all shadow-lg border-2 shrink-0",
                          isCompleted || isActive
                            ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white border-blue-400 shadow-purple-500/20"
                            : "bg-white text-slate-400 border-slate-100 shadow-slate-200/50"
                        )}
                      >
                        {isCompleted ? <Check size={20} className="stroke-[3]" /> : index + 1}
                      </motion.div>
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap",
                          isActive ? "text-purple-600" : "text-slate-800"
                        )}
                      >
                        {step.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="!p-0 overflow-hidden shadow-2xl shadow-blue-500/5">
              <div className="p-6 md:p-10 space-y-12">
                {currentStep === 'setup' && (
                  <div className="space-y-12">
                    {/* Name input is now inline in the stepper above */}
                    <div className="pt-2">
                      <TriggerSelection
                        selectedTrigger={formData.triggerType}
                        onTriggerSelect={(triggerType: TriggerType) => {
                          if (readOnly) return;
                          
                          // If same trigger is selected, just move next without resetting
                          if (formData.triggerType === triggerType) {
                            setCurrentStep('configuration');
                            return;
                          }

                          let defaultConfig: TriggerConfig | null = null;
                          if (triggerType === 'post_comment') {
                            defaultConfig = { postsType: 'specific', commentsType: 'all', keywords: [] } as PostCommentTriggerConfig;
                          } else if (triggerType === 'story_reply') {
                            defaultConfig = { storiesType: 'specific', replyType: 'all', keywords: [] } as StoryReplyTriggerConfig;
                          } else if (triggerType === 'user_directed_messages') {
                            defaultConfig = { messageType: 'all', keywords: [], cooldownEnabled: true, cooldownDuration: 3600000 } as UserDirectMessageTriggerConfig;
                          } else if (triggerType === 'conversation_flow') {
                            defaultConfig = { welcomeTitle: 'Welcome to Bright Future Academy!', welcomeSubtitle: "We're so glad you reached out. What brings you here today?", l1Labels: ['Admissions Info', 'Courses & Programs', 'Fees & Scholarships'] } as ConversationFlowTriggerConfig;
                          } else if (triggerType === 'lead_manager') {
                            defaultConfig = { googleSheetUrl: '' } as LeadManagerTriggerConfig;
                          }

                          let defaultActions: any[] = [];
                          if (triggerType === 'post_comment') {
                            defaultActions = [{
                              type: 'reply_to_comment',
                              replyTemplates: [
                                'Ayyy check your DMs 👀✨',
                                'Just dropped you a message 💌🔥',
                                'Doneee, sent you the details 🫶📩',
                                'You got a lil surprise in your inbox 😌💫'
                              ],
                              actionButtons: []
                            }];
                          } else if (triggerType === 'conversation_flow' || triggerType === 'lead_manager') {
                            // These workflows are entirely template-driven, but we add a dummy
                            // action here to pass the "actions.length > 0" validation in the stepper.
                            defaultActions = [{ type: 'send_dm', title: 'Managed by workflow template' }];
                          }

                          setFormData({
                            ...formData,
                            triggerType,
                            triggerConfig: defaultConfig,
                            actions: defaultActions
                          });
                        }}
                        onNext={(triggerContextType?: TriggerType) => {
                          const currentTrigger = triggerContextType || formData.triggerType;
                          if (currentTrigger) {
                            setCurrentStep('configuration');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          } else {
                            toast.error('Please select a trigger.');
                          }
                        }}
                        onBack={() => navigate(-1)}
                        isCondensed={true}
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 'configuration' && formData.triggerType && (
                  <AutomationConfigureGenz
                    formData={formData}
                    setFormData={(data) => !readOnly && setFormData(data)}
                    onSave={executeSave}
                    saving={saving}
                    readOnly={readOnly}
                    onBack={() => {
                      navigate(-1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}

              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
