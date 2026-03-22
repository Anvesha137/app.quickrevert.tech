import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Zap, MessageSquare, Image as ImageIcon, Mail, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  AutomationFormData, TriggerType, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
} from '../types/automation';
import { N8nWorkflowService } from '../lib/n8nService';
import TriggerConfigStep from './automation-steps/TriggerConfig';
import ActionConfig from './automation-steps/ActionConfig';

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
  const { hasInstagramConnected, loading: subLoading, initialFetchDone } = useSubscription();
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
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<AutomationFormData>({
    name: '',
    triggerType: null,
    triggerConfig: null,
    actions: [],
  });



  useEffect(() => {
    if (!subLoading && initialFetchDone && !hasInstagramConnected) {
      toast.error('Please connect an Instagram account first.');
      navigate('/connect-accounts');
    }
  }, [hasInstagramConnected, subLoading, initialFetchDone, navigate]);

  useEffect(() => {
    if (id) fetchAutomation(id);
  }, [user, id]);

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
        setFormData({
          name: data.name,
          triggerType: data.trigger_type,
          triggerConfig: data.trigger_config,
          actions: data.actions || [],
        });
        if (readOnly || data.trigger_type) setStep(2);
      }
    } catch {
      toast.error('Could not load this automation.');
      navigate('/automation');
    }
  }

  async function handleSave() {
    if (!user) return;
    if (!formData.name.trim()) { toast.error('Please give your automation a name.'); return; }
    if (!formData.triggerType) { toast.error('Please choose what triggers this automation.'); return; }
    if (!formData.triggerConfig) { toast.error('Please finish setting up the trigger.'); return; }
    if (formData.actions.length === 0) { toast.error('Please add at least one action.'); return; }

    setSaving(true);
    try {
      let automationData: { id: string };
      if (id) {
        const { data, error } = await supabase
          .from('automations')
          .update({
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: formData.actions,
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
            actions: formData.actions,
            status: 'inactive',
          })
          .select('id')
          .single();
        if (error) throw error;
        automationData = data;
      }

      try {
        const { data: igAccount } = await supabase
          .from('instagram_accounts')
          .select('id, instagram_user_id, username')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('connected_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (igAccount) {
          const replyAction = formData.actions.find(a => a.type === 'reply_to_comment') as any;
          const dmAction = formData.actions.find(a => a.type === 'send_dm') as any;

          await N8nWorkflowService.createWorkflow({
            template: 'instagram_automation_v1',
            instagramAccountId: igAccount.id,
            workflowName: `${formData.name.trim()} - ${new Date().toISOString().split('T')[0]}`,
            automationId: automationData.id,
            variables: {
              brandName: 'QuickRevert',
              replyMessage: replyAction?.replyTemplates?.[0] || 'Thanks for your comment!',
              dmTitle: dmAction?.title || 'Hi there!',
              dmImageUrl: (dmAction?.showImage && dmAction?.imageUrl) ? dmAction.imageUrl : '',
            },
            autoActivate: false,
          }, user.id);
        }
      } catch (n8nErr: any) {
        toast.warning(`Automation saved, but the workflow setup had an issue: ${n8nErr.message || 'Unknown error'}`);
      }

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
    // Initialize default trigger config if not set
    if (!formData.triggerConfig) {
       let defaultConfig: TriggerConfig;
       if (formData.triggerType === 'post_comment') defaultConfig = { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
       else if (formData.triggerType === 'story_reply') defaultConfig = { storiesType: 'all', replyType: 'all' } as StoryReplyTriggerConfig;
       else defaultConfig = { messageType: 'all' } as UserDirectMessageTriggerConfig;
       setFormData({ ...formData, triggerConfig: defaultConfig });
    }
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans pb-20 md:pb-0 w-full relative">
      <div className="w-full min-h-screen relative flex flex-col pt-safe overflow-x-hidden">
        
        {/* Fixed Header */}
        <div className="flex items-center gap-2 p-4 md:px-8 md:py-6 bg-white/90 backdrop-blur-xl sticky top-0 z-20 border-b border-gray-100 w-full">
          <button onClick={() => { if (step > 0) navigate(-1); else navigate('/automation'); }} className="p-2 md:p-3 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-2xl transition-all">
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </button>
          
          <div className="flex flex-1 justify-center items-center gap-2 md:gap-6">
            {[0, 1, 2].map((i) => {
              const labels = ['⚡️ What triggers it?', '🎯 Set the details', '💬 What to reply?'];
              
              if (i === step) {
                return (
                  <motion.div layoutId="pill" key={i} className="flex items-center px-4 md:px-6 py-2 md:py-2.5 bg-purple-50 border border-purple-100 rounded-full shadow-sm cursor-default">
                    <span className="text-purple-700 font-bold text-sm md:text-base">{labels[i]}</span>
                  </motion.div>
                );
              } else if (i < step) {
                // Completed step - completely clickable to go back
                return (
                  <button key={i} onClick={() => setStep(i as WizardStep)} className="w-8 h-8 md:h-10 md:px-4 md:w-auto rounded-full bg-emerald-50 text-emerald-600 border-2 border-emerald-100 flex items-center justify-center transition-all hover:bg-emerald-100 hover:scale-105 active:scale-95 group shadow-sm">
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
                        ${isClickable ? 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50 cursor-pointer shadow-sm group' : 'border-gray-100 bg-gray-50/50 cursor-not-allowed opacity-50'}`}
                  >
                    <div className="w-2 h-2 md:hidden bg-gray-300 rounded-full"></div>
                    <span className={`hidden md:inline font-bold text-sm ${isClickable ? 'text-gray-500 group-hover:text-purple-600' : 'text-gray-400'}`}>{labels[i]}</span>
                  </button>
                );
              }
            })}
          </div>
          <div className="w-9 md:w-12" /> {/* Spacer */}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full mx-auto max-w-7xl overflow-y-auto px-5 md:px-8 py-4 md:py-8 pb-12">
          <AnimatePresence mode="wait">
            
            {/* STEP 0: Selection */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 md:space-y-10 max-w-5xl mx-auto">
                
                {/* Name Card */}
                <div>
                  <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-5">
                    <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-[#1e293b] flex items-center justify-center text-white shadow-lg">
                      <Pencil className="w-5 h-5 md:w-6 md:h-6 text-orange-400 fill-orange-400" />
                    </div>
                    <div className="pt-0.5 md:pt-1">
                      <h2 className="text-lg md:text-2xl font-bold text-gray-900 tracking-tight leading-tight">Give your automation a name</h2>
                      <p className="text-xs md:text-sm text-gray-400 font-medium mt-0.5 md:mt-1">You need a name before you can continue.</p>
                    </div>
                  </div>
                  <div className="ml-14 md:ml-17">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={readOnly}
                      className="w-full border-2 border-emerald-200 focus:border-emerald-500 bg-emerald-50/10 focus:bg-white rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 outline-none text-gray-900 font-bold md:text-lg placeholder-gray-300 transition-all shadow-sm hover:border-emerald-300"
                      placeholder="e.g. Story link auto-reply"
                    />
                  </div>
                </div>

                {/* Trigger Card */}
                <div className={`transition-opacity duration-300 ${formData.name.trim().length === 0 ? 'opacity-40 grayscale-[0.2]' : 'opacity-100'}`}>
                  <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-5">
                    <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
                      <Zap className="w-5 h-5 md:w-6 md:h-6 fill-purple-200 text-purple-200" />
                    </div>
                    <div className="pt-0.5 md:pt-1">
                      <h2 className="text-lg md:text-2xl font-bold text-gray-900 tracking-tight leading-tight flex items-center gap-3">
                        What will start it?
                        {formData.name.trim().length === 0 && (
                          <span className="text-[9px] md:text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 md:px-2 md:py-1 rounded-md border border-amber-200 shadow-sm whitespace-nowrap hidden sm:inline-block">Name required ↑</span>
                        )}
                      </h2>
                      <p className="text-xs md:text-sm text-gray-400 font-medium mt-0.5 md:mt-1">Pick one below — you can always change it later.</p>
                      {formData.name.trim().length === 0 && (
                        <p className="text-[10px] md:text-xs font-bold text-amber-600 mt-1.5 sm:hidden">↑ Automation name is required first</p>
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
                            
                            // Auto-set the trigger immediately
                            setFormData(prev => {
                               const newFormData = { ...prev, triggerType: opt.type };
                               if (!newFormData.triggerConfig || prev.triggerType !== opt.type) {
                                  let defaultConfig: TriggerConfig;
                                  if (opt.type === 'post_comment') defaultConfig = { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
                                  else if (opt.type === 'story_reply') defaultConfig = { storiesType: 'all', replyType: 'all' } as StoryReplyTriggerConfig;
                                  else defaultConfig = { messageType: 'all' } as UserDirectMessageTriggerConfig;
                                  newFormData.triggerConfig = defaultConfig;
                               }
                               return newFormData;
                            });
                            
                            // Auto-advance
                            setTimeout(() => setStep(1), 150);
                          }}
                          className={`w-full text-left p-3.5 md:p-4 rounded-[1.25rem] md:rounded-[1.25rem] border-2 transition-all flex items-center gap-4 md:gap-5 group
                            ${isDisabled ? 'cursor-not-allowed border-gray-100 bg-gray-50' : selected ? 'border-purple-500 bg-purple-50/30 shadow-sm ring-2 ring-purple-50 scale-[1.01]' : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/10 hover:shadow-sm hover:-translate-y-0.5'}`}
                        >
                          <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[14px] md:rounded-xl flex items-center justify-center text-white transition-all duration-300
                            ${isDisabled ? 'bg-gray-200' : selected ? 'bg-purple-600 scale-105' : 'bg-purple-100 group-hover:bg-purple-200 group-hover:scale-110'}`}>
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${isDisabled ? 'text-gray-400' : selected ? 'text-white' : 'text-purple-600'}`} />
                          </div>
                          <div className="flex-1 mt-0.5">
                            <h3 className={`font-bold text-[14px] md:text-base mb-0.5 transition-colors ${isDisabled ? 'text-gray-400' : selected ? 'text-purple-900 font-extrabold' : 'text-gray-900 group-hover:text-purple-900'}`}>{opt.title}</h3>
                            <p className={`text-[12px] md:text-[13px] leading-snug font-medium line-clamp-2 md:line-clamp-none transition-colors ${isDisabled ? 'text-gray-300' : 'text-gray-400 group-hover:text-gray-500'}`}>{opt.description}</p>
                          </div>
                          <div className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300
                            ${isDisabled ? 'border-gray-200' : selected ? 'border-purple-600 bg-purple-50 scale-110 shadow-inner' : 'border-gray-200 bg-gray-50 group-hover:border-purple-300'}`}>
                            {selected && <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-purple-600 rounded-full shadow-sm" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                />
                <div className="mt-8 flex justify-center pb-8 md:pb-0">
                  <button
                     onClick={() => setStep(2)}
                     className="w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-lg hover:-translate-y-1 bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200"
                  >
                    Continue to Final Step <ArrowLeft className="rotate-180 w-5 h-5" />
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
                  saving={saving}
                  onSave={handleSave}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Global Action Button (Launch) - Handled inside ActionConfig for Step 2 now, so removing step 0/1 wrapper */}
      </div>
    </div>
  );
}
