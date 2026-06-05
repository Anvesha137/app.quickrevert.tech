import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Bot, MessageSquare, Image as ImageIcon, Mail, Pencil, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  AutomationFormData, TriggerType, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
} from '../types/automation';
import { useTheme } from '../contexts/ThemeContext';
import { N8nWorkflowService } from '../lib/n8nService';
import TriggerConfigStep from './automation-steps/TriggerConfig';
import ActionConfig from './automation-steps/ActionConfig';
import { getPendingUpload, isBlobUrl, clearPendingUpload } from '../lib/pendingUploads';
import { uploadAutomationAsset } from '../lib/storage';

type WizardStep = 0 | 1 | 2;

interface AutomationCreateMillennialProps {
  readOnly?: boolean;
}

const TRIGGER_OPTIONS: {
  type: TriggerType;
  icon: any;
  title: string;
  description: string;
}[] = [
    {
      type: 'post_comment',
      icon: MessageSquare,
      title: 'Someone comments on my post',
      description: 'When a follower leaves a comment on your Instagram photo or video, this automation kicks in automatically.',
    },
    {
      type: 'story_reply',
      icon: ImageIcon,
      title: 'Someone replies to my story',
      description: 'When a follower taps Reply on your Instagram story, this automation starts working for you.',
    },
    {
      type: 'user_directed_messages',
      icon: Mail,
      title: 'Someone sends me a DM',
      description: 'When someone slides into your DMs on Instagram, this automation handles the reply for you.',
    },

  ];

export default function AutomationCreateMillennial({ readOnly = false }: AutomationCreateMillennialProps) {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const { hasInstagramConnected, loading: subLoading, initialFetchDone, automationLimit, automationLimitExceeded } = useSubscription();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [searchParams, setSearchParams] = useSearchParams();
  const stepParam = searchParams.get('step');

  // Map string steps from Gen Z theme to Millennial numeric steps
  const getInitialStep = (): WizardStep => {
    if (stepParam === 'setup') return 0;
    if (stepParam === 'configuration') return 1;

    const parsed = parseInt(stepParam || '0');
    return (isNaN(parsed) ? 0 : parsed) as WizardStep;
  };

  const step = getInitialStep();

  const setStep = (newStep: WizardStep) => {
    setSearchParams({ step: newStep.toString() });
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
        step: step,
        updatedAt: Date.now()
      }));
    }
  }, [formData, step, id, readOnly]);

  // Restore step on mount if not provided in URL
  useEffect(() => {
    if (!id && !readOnly && !searchParams.get('step')) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.step !== undefined && parsed.step !== 0) {
            setStep(parsed.step as WizardStep);
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
        const cleanedActions = prev.actions.map(action => {
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
      toast.error('Please connect an Instagram account first.');
      navigate('/connect-accounts');
    }
  }, [hasInstagramConnected, subLoading, initialFetchDone, navigate]);

  const [wasLoaded, setWasLoaded] = useState(false);

  useEffect(() => {
    if (id && !wasLoaded) {
      fetchAutomation(id);
    }
  }, [user, id, wasLoaded]);

  const topRef = useRef<HTMLDivElement>(null);

  async function fetchAutomation(automationId: string) {
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
    } catch {
      toast.error('Could not load this automation.');
      navigate('/automation');
    }
  }

  const validateTriggerConfig = (type: TriggerType, config: TriggerConfig): { message: string, sectionId: string } | null => {
    if (type === 'post_comment') {
      const c = config as PostCommentTriggerConfig;
      if (c.postsType === 'specific' && (!c.specificPosts || c.specificPosts.length === 0)) {
        return { message: "Please select at least one post.", sectionId: 'post-selection-section' };
      }
      if (c.commentsType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'keyword-selection-section' };
      }
    } else if (type === 'story_reply') {
      const c = config as StoryReplyTriggerConfig;
      if (c.storiesType === 'specific' && (!c.specificStories || c.specificStories.length === 0)) {
        return { message: "Please select at least one story.", sectionId: 'post-selection-section' };
      }
      if (c.replyType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'keyword-selection-section' };
      }
    } else if (type === 'user_directed_messages') {
      const c = config as UserDirectMessageTriggerConfig;
      if (c.messageType === 'keywords' && (!c.keywords || c.keywords.length === 0)) {
        return { message: "Please add at least one keyword.", sectionId: 'keyword-selection-section' };
      }
    }
    return null;
  };

  async function handleSave() {
    if (!id && !readOnly && automationLimitExceeded) {
      toast.error(`Automation Limit Reached: Your current plan supports up to ${automationLimit} automations. Please delete an old one or upgrade to create more.`);
      return;
    }

    if (!formData.name.trim()) { toast.error('Please give your automation a name.'); return; }
    if (!formData.triggerType) { toast.error('Please choose what triggers this automation.'); return; }
    if (!formData.triggerConfig) { toast.error('Please finish setting up the trigger.'); return; }

    const configError = validateTriggerConfig(formData.triggerType, formData.triggerConfig);
    if (configError) {
      toast.error(configError.message);
      setStep(1);
      setTimeout(() => {
        const el = document.getElementById(configError.sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }

    if (formData.actions.length === 0) { toast.error('Please add at least one action.'); return; }

    setSaving(true);
    try {
      // --- Upload Phase: Process any pending local images ---
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

      let automationData: { id: string };
      if (id) {
        const { data, error } = await supabase
          .from('automations')
          .update({
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: finalActions,
          })
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        automationData = data;
      } else {
        const { data, error } = await supabase
          .from('automations')
          .insert({
            user_id: user.id,
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: finalActions,
            status: 'active',
          })
          .select('id')
          .single();
        if (error) throw error;
        automationData = data;
      }

      // Skip n8n entirely for code-logic users — their automations are handled
      // server-side by the execute-automation edge function.
      const isCodeLogic = await N8nWorkflowService.isCodeLogicUser(user!.id);
      if (isCodeLogic) {
        console.log('[CODE LOGIC] Skipping n8n workflow creation — user is on code logic engine.');
        // Trigger Discord alert for new automations created via code_logic
        if (!id) {
          try {
            await supabase.functions.invoke('on-new-automation', {
              body: {
                type: 'INSERT',
                record: {
                  id: automationData.id,
                  user_id: user!.id,
                  name: formData.name.trim(),
                  trigger_type: formData.triggerType
                }
              }
            });
          } catch (e) { console.error('Discord alert failed:', e); }
        }
      } else {
        try {
          const { data: igAccount } = await supabase
            .from('instagram_accounts')
            .select('id, instagram_user_id, username')
            .eq('user_id', user!.id)
            .eq('status', 'active')
            .order('connected_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (igAccount) {
            const replyAction = finalActions.find((a: any) => a.type === 'reply_to_comment') as any;
            const dmAction = finalActions.find((a: any) => a.type === 'send_dm') as any;

            await N8nWorkflowService.createWorkflow({
              template: 'instagram_automation_v1',
              instagramAccountId: igAccount.id,
              workflowName: `${formData.name.trim()} - ${new Date().toISOString().split('T')[0]}`,
              automationId: automationData.id,
              actions: finalActions,
              triggerType: formData.triggerType,
              variables: {
                brandName: 'QuickRevert',
                replyMessage: replyAction?.replyTemplates?.[0] || 'Thanks for your comment!',
                dmTitle: dmAction?.title || 'Hi there!',
                dmImageUrl: (dmAction?.showImage && dmAction?.imageUrl) ? dmAction.imageUrl : '',
              },
              autoActivate: true,
            }, user!.id);
          }
        } catch (n8nErr: any) {
          toast.warning(`Automation saved, but the workflow setup had an issue: ${n8nErr.message || 'Unknown error'}`);
        }
      }

      // Clear draft on successful save
      if (!id) localStorage.removeItem(LOCAL_STORAGE_KEY);

      toast.success('🎉 Automation saved successfully!');
      navigate('/automation');
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message || 'Please try again'}`);
    } finally {
      setSaving(false);
    }
  }

  const step0Valid = formData.name.trim().length > 0 && formData.triggerType !== null;

  const handleNextStep0 = () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name first");
      return;
    }
    if (!formData.triggerType) {
      toast.error("Please select a trigger type");
      return;
    }
    // If the trigger type hasn't changed, just move to the next step
    // This prevents resetting the configuration when just browsing steps
    setStep(1);
    
    // Initialize default trigger config only if it's missing
    if (!formData.triggerConfig) {
      let defaultConfig: TriggerConfig;
      let defaultActions = formData.actions;
      if (formData.triggerType === 'post_comment') {
        defaultConfig = { postsType: 'specific', commentsType: 'all' } as PostCommentTriggerConfig;
      }
      else if (formData.triggerType === 'story_reply') {
        defaultConfig = { storiesType: 'specific', replyType: 'all' } as StoryReplyTriggerConfig;
      }
      else {
        defaultConfig = { messageType: 'all' } as UserDirectMessageTriggerConfig;
      }
      setFormData({ ...formData, triggerConfig: defaultConfig, actions: defaultActions });
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-black' : 'bg-white'} flex flex-col font-sans pb-20 md:pb-0 w-full relative transition-colors duration-500`}>
      <div className="w-full min-h-screen relative flex flex-col pt-safe overflow-x-hidden">

        {/* Fixed Header */}
        <div className={`flex items-center gap-2 p-4 md:px-8 md:py-6 ${darkMode ? 'bg-black' : 'bg-white/90 border-gray-100 border-b'} backdrop-blur-xl sticky top-0 z-20 w-full transition-colors duration-500`}>
          <button onClick={() => { if (step > 0) navigate(-1); else navigate('/automation'); }} className={`p-2 md:p-3 ${darkMode ? 'bg-transparent border border-white/10 text-white/60 hover:border-white/20 hover:text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900'} rounded-full transition-all`}>
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </button>

          <div className="flex flex-1 justify-center items-center gap-2 md:gap-6">
            {[0, 1, 2].map((i) => {
              const labels = ['⚡️ What triggers it?', '🎯 Set the details', '💬 What to reply?'];

              if (i === step) {
                return (
                  <motion.div layoutId="pill" key={i} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 ${darkMode ? 'bg-transparent border-purple-500' : 'bg-purple-50 border-purple-100 shadow-sm'} border rounded-full cursor-default`}>
                    <span className={`${darkMode ? 'text-white' : 'text-purple-700'} font-bold text-sm md:text-base`}>{labels[i]}</span>
                  </motion.div>
                );
              } else if (i < step) {
                // Completed step - completely clickable to go back
                return (
                  <button key={i} onClick={() => setStep(i as WizardStep)} className={`w-8 h-8 md:h-10 md:px-4 md:w-auto rounded-full ${darkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-2 border-emerald-100'} flex items-center justify-center transition-all hover:scale-105 active:scale-95 group shadow-sm`}>
                    <Check size={16} strokeWidth={3} className="md:mr-2" />
                    <span className="hidden md:inline font-bold text-sm">{labels[i]}</span>
                  </button>
                );
              } else {
                // Future step - clickable if previous steps are valid
                const isClickable = (i === 1 && step0Valid) || (i === 2 && step0Valid && formData.triggerConfig !== null);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (i === 1 && step0Valid && step === 0) handleNextStep0();
                      else if (isClickable) setStep(i as WizardStep);
                    }}
                    disabled={!isClickable}
                    className={`h-8 w-8 md:h-10 md:px-4 md:w-auto rounded-full border-2 flex items-center justify-center transition-all 
                        ${isClickable ? (darkMode ? 'border-white/10 bg-transparent hover:border-white/20' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50 cursor-pointer shadow-sm group') : (darkMode ? 'border-white/5 bg-transparent opacity-30 cursor-not-allowed' : 'border-gray-100 bg-gray-50/50 cursor-not-allowed opacity-50')}`}
                  >
                    <div className={`w-2 h-2 md:hidden ${darkMode ? 'bg-white/20' : 'bg-gray-300'} rounded-full`}></div>
                    <span className={`hidden md:inline font-bold text-sm ${isClickable ? (darkMode ? 'text-white/40 group-hover:text-white' : 'text-gray-500 group-hover:text-purple-600') : (darkMode ? 'text-white/20' : 'text-gray-400')}`}>{labels[i]}</span>
                  </button>
                );
              }
            })}
          </div>
          <div className="w-9 md:w-12" /> {/* Spacer */}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full mx-auto max-w-7xl overflow-y-auto px-5 md:px-8 py-4 md:py-8 pb-12">
          <div ref={topRef} className="h-0 w-0 opacity-0 pointer-events-none" />
          <AnimatePresence mode="wait">

            {/* STEP 0: Selection */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 md:space-y-10 max-w-5xl mx-auto">

                {/* Name Card */}
                <div>
                  <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-5">
                    <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl flex items-center justify-center text-white ${darkMode ? 'bg-white/10' : 'bg-[#1e293b] shadow-lg shadow-gray-200'}`}>
                      <Pencil className="w-5 h-5 md:w-6 md:h-6 text-orange-400 fill-orange-400" />
                    </div>
                    <div className="pt-0.5 md:pt-1">
                      <h2 className={`text-lg md:text-2xl font-bold tracking-tight leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Give your automation a name</h2>
                      <p className={`text-xs md:text-sm font-medium mt-0.5 md:mt-1 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>You need a name before you can continue.</p>
                    </div>
                  </div>
                  <div className="ml-14 md:ml-17">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={readOnly}
                      className={`w-full border-2 rounded-2xl px-4 md:px-5 py-3 md:py-3.5 outline-none font-bold md:text-lg transition-all 
                        ${darkMode ? 'bg-transparent border-white/10 focus:border-purple-500/50 text-white placeholder-white/20' : 'border-emerald-200 focus:border-emerald-500 bg-emerald-50/10 focus:bg-white text-gray-900 placeholder-gray-300 shadow-sm'}`}
                      placeholder="e.g. Story link auto-reply"
                    />
                  </div>
                </div>

                {/* Trigger Card */}
                <div className={`transition-opacity duration-300 ${formData.name.trim().length === 0 ? 'opacity-40 grayscale-[0.2]' : 'opacity-100'}`}>
                  <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-5">
                    <div className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-purple-600 text-white' : 'bg-purple-600 text-white shadow-lg shadow-purple-100'}`}>
                      <Bot className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                    <div className="pt-0.5 md:pt-1">
                      <h2 className={`text-lg md:text-2xl font-bold tracking-tight leading-tight flex items-center gap-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        What will start it?
                        {formData.name.trim().length === 0 && (
                          <span className={`${darkMode ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-100 text-amber-700 border-amber-200'} text-[9px] md:text-[11px] font-bold px-2 py-0.5 md:px-2 md:py-1 rounded-md border shadow-sm whitespace-nowrap hidden sm:inline-block`}>Name required ↑</span>
                        )}
                      </h2>
                      <p className={`text-xs md:text-sm font-medium mt-0.5 md:mt-1 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Pick one below — you can always change it later.</p>
                      {formData.name.trim().length === 0 && (
                        <p className={`text-[10px] md:text-xs font-bold mt-1.5 sm:hidden ${darkMode ? 'text-amber-500' : 'text-amber-600'}`}>↑ Automation name is required first</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 md:space-y-3">
                    {TRIGGER_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = formData.triggerType === opt.type;
                      const isDisabled = readOnly || formData.name.trim().length === 0;
                      return (
                        <button
                          key={opt.type}
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;

                            // 🔥 UX: If the same trigger is selected, just advance without resetting the config
                            if (formData.triggerType === opt.type) {
                              setStep(1);
                              return;
                            }

                            setFormData(prev => {
                              const newFormData = { ...prev, triggerType: opt.type };

                              let defaultConfig: TriggerConfig | null = null;
                              if (opt.type === 'post_comment') {
                                defaultConfig = { postsType: 'specific', commentsType: 'all', keywords: [] } as PostCommentTriggerConfig;
                              } else if (opt.type === 'story_reply') {
                                defaultConfig = { storiesType: 'specific', replyType: 'all', keywords: [] } as StoryReplyTriggerConfig;
                              } else if (opt.type === 'user_directed_messages') {
                                defaultConfig = { messageType: 'all', keywords: [], cooldownEnabled: true, cooldownDuration: 3600000 } as UserDirectMessageTriggerConfig;
                              }

                              newFormData.triggerConfig = defaultConfig;
                              return newFormData;
                            });

                            // Auto-advance
                            setTimeout(() => setStep(1), 150);
                          }}
                          className={`w-full text-left p-3.5 md:p-4 rounded-2xl border-2 transition-all flex items-center gap-4 md:gap-5 group
                            ${isDisabled ? (darkMode ? 'border-white/5 opacity-40 cursor-not-allowed' : 'cursor-not-allowed border-gray-100 bg-gray-50') : selected ? (darkMode ? 'border-purple-500 bg-transparent shadow-none scale-[1.01]' : 'border-purple-500 bg-purple-50/30 shadow-sm ring-2 ring-purple-50 scale-[1.01]') : (darkMode ? 'border-white/10 bg-transparent hover:border-white/20' : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/10 hover:shadow-sm hover:-translate-y-0.5')}`}
                        >
                          <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[14px] md:rounded-xl flex items-center justify-center text-white transition-all duration-300
                            ${isDisabled ? 'bg-gray-200' : selected ? 'bg-purple-600 scale-105' : (darkMode ? 'bg-white/10 group-hover:bg-white/20' : 'bg-purple-100 group-hover:bg-purple-200 group-hover:scale-110')}`}>
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${isDisabled ? 'text-gray-400' : (selected || !darkMode) ? (selected ? 'text-white' : 'text-purple-600') : 'text-white/60 group-hover:text-white'}`} />
                          </div>
                          <div className="flex-1 mt-0.5">
                            <h3 className={`font-bold text-[14px] md:text-base mb-0.5 transition-colors ${isDisabled ? 'text-gray-400' : selected ? (darkMode ? 'text-white font-black' : 'text-purple-900 font-extrabold') : (darkMode ? 'text-white/80 group-hover:text-white' : 'text-gray-900 group-hover:text-purple-900')}`}>{opt.title}</h3>
                            <p className={`text-[12px] md:text-[13px] leading-snug font-medium line-clamp-2 md:line-clamp-none transition-colors ${isDisabled ? 'text-gray-300' : (darkMode ? 'text-white/40 group-hover:text-white/60' : 'text-gray-400 group-hover:text-gray-500')}`}>{opt.description}</p>
                          </div>
                          <div className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300
                            ${isDisabled ? 'border-gray-200' : selected ? (darkMode ? 'border-purple-400 bg-white/10 shadow-inner' : 'border-purple-600 bg-purple-50 scale-110 shadow-inner') : (darkMode ? 'border-white/20 bg-white/5 group-hover:border-white/40' : 'border-gray-200 bg-gray-50 group-hover:border-purple-300')}`}>
                            {selected && <div className={`w-2.5 h-2.5 md:w-3 md:h-3 ${darkMode ? 'bg-purple-400' : 'bg-purple-600'} rounded-full shadow-sm`} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* View Mode Navigation for Step 0 */}
                {readOnly && step0Valid && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={() => setStep(1)}
                      className="w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-lg hover:-translate-y-1 bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                    >
                      View Template Details
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP 1: Details */}
            {step === 1 && formData.triggerType && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-5xl mx-auto flex flex-col h-full">
                <TriggerConfigStep
                  triggerType={formData.triggerType}
                  config={formData.triggerConfig}
                  onConfigChange={(config) => setFormData({ ...formData, triggerConfig: config })}
                  readOnly={readOnly}
                  automationId={id}
                />
                <div className="mt-8 flex justify-center pb-8 md:pb-0">
                  <button
                    onClick={() => {
                      const error = validateTriggerConfig(formData.triggerType!, formData.triggerConfig!);
                      if (error) {
                        toast.error(error.message);
                        const el = document.getElementById(error.sectionId);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        else topRef.current?.scrollIntoView({ behavior: 'smooth' });
                        return;
                      }
                      setStep(2);
                    }}
                    className="w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-lg hover:-translate-y-1 bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200"
                  >
                    {readOnly ? 'View Reply Setup' : 'Continue to Next Step'}
                    <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Action */}
            {step === 2 && formData.triggerConfig && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-5xl mx-auto">
                 <ActionConfig
                   triggerType={formData.triggerType!}
                   actions={formData.actions}
                   onActionsChange={(actions) => setFormData({ ...formData, actions })}
                   readOnly={readOnly}
                   saving={saving || (!id && automationLimitExceeded)}
                   onSave={handleSave}
                 />
                 {!id && !readOnly && automationLimitExceeded && (
                    <div className="mt-6 p-6 bg-amber-50 border-2 border-amber-200 rounded-3xl flex items-center gap-4 shadow-lg">
                        <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-md shrink-0">
                            <Zap className="text-white" size={24} />
                        </div>
                        <div className="flex-1">
                            <p className="text-base font-black text-amber-900 mb-0.5 uppercase tracking-tight leading-none">Limit Reached</p>
                            <p className="text-sm font-bold text-amber-700">You've hit your limit of {automationLimit} automations. Upgrade or delete an inactive one to launch this.</p>
                        </div>
                        <button 
                            onClick={() => navigate('/pricing')}
                            className="px-6 py-3 bg-amber-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 transition-all active:scale-95 shadow-md"
                        >
                            Upgrade →
                        </button>
                    </div>
                 )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Global Action Button (Launch) - Handled inside ActionConfig for Step 2 now, so removing step 0/1 wrapper */}
      </div>
    </div>
  );
}
