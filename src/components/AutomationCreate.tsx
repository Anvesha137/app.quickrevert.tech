import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AutomationFormData, TriggerType, TriggerConfig, Action, ReplyToCommentAction, SendDmAction } from '../types/automation';
import { N8nWorkflowService } from '../lib/n8nService';
import TriggerSelection from './automation-steps/TriggerSelection';
import TriggerConfigStep from './automation-steps/TriggerConfig';
import ActionConfig from './automation-steps/ActionConfig';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4, delay: delay, ease: "easeOut" }}
    className={cn(
      "relative rounded-3xl border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl transition-all hover:border-white/80 group overflow-hidden",
      !noPadding && "p-8",
      className
    )}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />
    <div className="relative z-10">{children}</div>
  </motion.div>
);

type Step = 'setup' | 'configuration';

interface AutomationCreateProps {
  readOnly?: boolean;
}

export default function AutomationCreate({ readOnly = false }: AutomationCreateProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  // For view mode, show configuration directly if loaded, or just stick to 'setup' -> 'configuration' flow but pre-filled?
  // Better to just show steps as usual but disabled.
  const [currentStep, setCurrentStep] = useState<Step>('setup');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<AutomationFormData>({
    name: '',
    triggerType: null,
    triggerConfig: null,
    actions: [],
  });

  useEffect(() => {
    checkInstagramAccount();
    if (id) {
      fetchAutomation(id);
    }
  }, [user, id]);

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
        setFormData({
          name: data.name,
          triggerType: data.trigger_type,
          triggerConfig: data.trigger_config,
          actions: data.actions || [],
        });
        // If viewing, maybe jump to configuration if valid?
        // But setup step shows name which is important.
      }
    } catch (error) {
      console.error('Error fetching automation:', error);
      toast.error('Failed to load automation details');
      navigate('/automation');
    } finally {
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

      if (!data) {
        toast.error('Please connect an Instagram account before creating automations.');
        navigate('/connect-accounts');
      }
    } catch (error) {
      console.error('Error checking Instagram account:', error);
    }
  };

  const steps = [
    { id: 'setup', name: 'Step 1: Setup', completed: formData.name.trim().length > 0 && formData.triggerType !== null },
    { id: 'configuration', name: 'Step 2: Configure', completed: formData.triggerConfig !== null && formData.actions.length > 0 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);



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

    if (formData.actions.length === 0) {
      console.error('At least one action is required');
      toast.error('Please add at least one action to your automation');
      return;
    }

    setSaving(true);

    try {
      console.log(`${id ? 'Updating' : 'Saving'} automation:`, {
        user_id: user.id,
        name: formData.name.trim(),
        trigger_type: formData.triggerType,
        trigger_config: formData.triggerConfig,
        actions: formData.actions,
        status: 'inactive',
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
            actions: formData.actions,
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
            actions: formData.actions,
            status: 'inactive',
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

        const replyAction = formData.actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
        const replyMessage = replyAction?.replyTemplates?.[0] || 'Thanks for your comment!';

        const dmAction = formData.actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
        const dmTitle = dmAction?.title || 'Hi there!';
        const dmImage = dmAction?.imageUrl || '';

        const result = await N8nWorkflowService.createWorkflow({
          template: 'instagram_automation_v1',
          instagramAccountId: instagramAccount.id,
          workflowName: workflowName,
          automationId: automationData.id,
          variables: {
            brandName: 'QuickRevert',
            replyMessage: replyMessage,
            dmTitle: dmTitle,
            dmImageUrl: dmImage,
          },
          autoActivate: false,
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

      navigate('/automation');
    } catch (error: any) {
      console.error('Error creating automation:', error);
      toast.error(`Failed to create automation: ${error.message || 'Please try again'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 relative min-h-screen overflow-x-hidden p-4 md:p-8">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
        <div className="absolute top-0 -left-4 w-[500px] h-[500px] bg-blue-100/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob opacity-70"></div>
        <div className="absolute top-1/4 -right-4 w-[500px] h-[500px] bg-indigo-100/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000 opacity-60"></div>
        <div className="absolute -bottom-20 left-1/4 w-[600px] h-[600px] bg-slate-200/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000 opacity-50"></div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/60 backdrop-blur-xl p-4 md:p-6 rounded-3xl border border-white/80 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/automation')}
              className="text-slate-500 hover:text-purple-600 transition-colors"
            >
              <span className="font-semibold text-sm">Automation</span>
            </button>
            <span className="text-slate-300">/</span>

            <div className="flex items-center group relative">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => !readOnly && setFormData({ ...formData, name: e.target.value })}
                placeholder="Untitled*"
                disabled={readOnly}
                className="bg-transparent border-none outline-none text-xl font-bold text-slate-800 placeholder-slate-400 focus:ring-0 p-0 w-[200px]"
              />
              {!readOnly && <Pencil size={16} className="text-slate-400 ml-2" />}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={executeSave}
              disabled={saving || readOnly}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-md shadow-purple-500/20 flex items-center gap-2"
            >
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
                          let defaultConfig: TriggerConfig;
                          if (triggerType === 'post_comment') {
                            defaultConfig = { postsType: 'all', commentsType: 'all' };
                          } else if (triggerType === 'story_reply') {
                            defaultConfig = { storiesType: 'all' };
                          } else {
                            defaultConfig = { messageType: 'all' };
                          }
                          setFormData({
                            ...formData,
                            triggerType,
                            triggerConfig: defaultConfig
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
                        onBack={() => navigate('/automation')}
                        isCondensed={true}
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 'configuration' && formData.triggerType && (
                  <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Phone Mockup Preview — Live */}
                    {(() => {
                      const pc = formData.triggerConfig as any;
                      const keywords: string[] = pc?.keywords && pc.keywords.length > 0 ? pc.keywords : ['hey 🔥'];
                      const dmAction = formData.actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
                      const replyAction = formData.actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
                      const dmTitle = dmAction?.title || 'Check your DMs! 📩';
                      const replyText = replyAction?.replyTemplates?.find(t => t.trim()) || 'Got it, check your inbox! 📩';
                      const isDM = formData.triggerType === 'user_directed_messages';
                      const isStory = formData.triggerType === 'story_reply';

                      return (
                        <div className="hidden lg:flex flex-col items-center flex-shrink-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-3">Preview</p>
                          {/* Phone shell */}
                          <div className="w-[230px] bg-black rounded-[2.8rem] overflow-hidden border-[5px] border-neutral-700 shadow-2xl shadow-black/50 relative">
                            {/* Notch / status bar */}
                            <div className="bg-black flex items-center justify-between px-5 pt-3 pb-1">
                              <span className="text-white text-[10px] font-bold">9:41</span>
                              <div className="flex items-center gap-1">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M1 6.5C6.5 1 17.5 1 23 6.5" /><path d="M5 10.5C8.5 7 15.5 7 19 10.5" /><path d="M9 14.5C10.5 13 13.5 13 15 14.5" /><circle cx="12" cy="18" r="1" fill="white" /></svg>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="white"><rect x="2" y="7" width="4" height="10" rx="1" /><rect x="8" y="4" width="4" height="13" rx="1" /><rect x="14" y="2" width="4" height="15" rx="1" /><rect x="20" y="0" width="4" height="17" rx="1" /></svg>
                                <svg className="w-5 h-3" viewBox="0 0 24 12" fill="none"><rect x="1" y="1" width="18" height="10" rx="2" stroke="white" strokeWidth="1.5" fill="none" /><rect x="2" y="2" width="13" height="8" rx="1" fill="white" /><rect x="20" y="3.5" width="2.5" height="5" rx="1" fill="white" opacity="0.5" /></svg>
                              </div>
                            </div>

                            {isDM ? (
                              /* ─── DM Preview ─── */
                              <div className="bg-black" style={{ minHeight: '500px' }}>
                                <div className="flex items-center gap-2 px-3 pb-3 border-b border-neutral-800">
                                  <span className="text-white text-lg mr-1">←</span>
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">r</div>
                                  <div>
                                    <p className="text-white text-xs font-semibold leading-none">ruchita_1930</p>
                                    <p className="text-neutral-400 text-[9px]">Active now</p>
                                  </div>
                                </div>
                                <div className="px-3 pt-4 space-y-3">
                                  {/* Incoming: keyword as the trigger message */}
                                  <div className="flex items-end gap-2">
                                    <div className="w-6 h-6 rounded-full bg-neutral-600 flex-shrink-0"></div>
                                    <div className="bg-neutral-800 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[75%]">
                                      <p className="text-white text-[11px]">{keywords[0]}</p>
                                    </div>
                                  </div>
                                  {/* Outgoing: DM reply */}
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="bg-blue-600 rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">
                                      <p className="text-white text-[11px]">{dmTitle}</p>
                                    </div>
                                    {dmAction?.actionButtons && dmAction.actionButtons.filter(b => b.text).map((btn, i) => (
                                      <div key={i} className="bg-blue-600/20 border border-blue-500/40 rounded-xl px-3 py-1.5 max-w-[85%] text-center">
                                        <p className="text-blue-400 text-[10px] font-semibold">{btn.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {/* Input bar */}
                                <div className="absolute bottom-0 left-0 right-0 bg-black px-3 py-3 flex items-center gap-2 border-t border-neutral-800">
                                  <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-sm">📷</div>
                                  <div className="flex-1 bg-neutral-800 rounded-full py-1.5 px-3">
                                    <span className="text-neutral-500 text-[10px]">Message...</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* ─── Post / Story Comments Preview ─── */
                              <div className="bg-black" style={{ minHeight: '500px' }}>
                                {/* Header */}
                                <div className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full p-[2px] bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600">
                                      <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                                        <div className="w-full h-full rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold">r</div>
                                      </div>
                                    </div>
                                    <span className="text-white text-[11px] font-semibold">ruchita_1930</span>
                                  </div>
                                  <span className="text-white text-base font-bold tracking-widest">···</span>
                                </div>

                                {/* Post image */}
                                <div className="relative bg-neutral-900 flex items-center justify-center overflow-hidden" style={{ height: '180px' }}>
                                  <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black"></div>
                                  <div className="relative z-10 flex flex-col items-center gap-1 text-neutral-600">
                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className="text-[10px] text-neutral-500">{isStory ? 'Your Story' : 'Your Post'}</span>
                                  </div>
                                </div>

                                {/* Reactions row */}
                                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                                  <div className="flex items-center gap-3 text-white text-sm">♡ 💬 ⬆</div>
                                  <span className="text-white text-sm">🔖</span>
                                </div>
                                <p className="text-white text-[10px] font-semibold px-3">1,243 likes</p>

                                {/* Comments section */}
                                <div className="px-3 pt-2 space-y-2 border-t border-neutral-800 mt-2">
                                  <p className="text-neutral-500 text-[9px] uppercase tracking-widest font-semibold">Comments</p>

                                  {/* Trigger keyword comment from a user */}
                                  <div className="flex items-start gap-2">
                                    <div className="w-6 h-6 rounded-full bg-neutral-600 flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] text-white">a</div>
                                    <div className="flex-1">
                                      <div className="flex items-baseline gap-1.5">
                                        <span className="text-white text-[10px] font-semibold">alex_doe</span>
                                        <span className="text-neutral-500 text-[9px]">2h</span>
                                      </div>
                                      <p className="text-white text-[10px]">{keywords[0]}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-neutral-500 text-[8px]">Reply</span>
                                        <span className="text-neutral-500 text-[8px]">Send</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Bot reply */}
                                  <div className="flex items-start gap-2 pl-4">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] text-white font-bold">r</div>
                                    <div className="flex-1">
                                      <div className="flex items-baseline gap-1.5">
                                        <span className="text-white text-[10px] font-semibold">ruchita_1930</span>
                                        <span className="text-neutral-500 text-[9px]">Just now</span>
                                      </div>
                                      <p className="text-white text-[10px]">{replyText}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Add comment bar */}
                                <div className="flex items-center gap-2 px-3 py-2 mt-2">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0"></div>
                                  <div className="flex-1 bg-neutral-800 rounded-full py-1.5 px-3">
                                    <span className="text-neutral-500 text-[9px]">Add a comment...</span>
                                  </div>
                                </div>

                                {/* Bottom nav */}
                                <div className="flex items-center justify-around px-2 py-2 border-t border-neutral-800">
                                  <span className="text-white text-base">🏠</span>
                                  <span className="text-neutral-500 text-base">🔍</span>
                                  <span className="text-neutral-500 text-base">⊕</span>
                                  <span className="text-neutral-500 text-base">▷</span>
                                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500"></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Config Panels */}
                    <div className="flex-1 space-y-0 min-w-0">
                      <TriggerConfigStep
                        triggerType={formData.triggerType}
                        config={formData.triggerConfig}
                        onConfigChange={(triggerConfig: TriggerConfig) => !readOnly && setFormData({ ...formData, triggerConfig })}
                        onBack={() => {
                          setCurrentStep('setup');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        isCondensed={true}
                        readOnly={readOnly}
                      />
                      <div className="">
                        <ActionConfig
                          triggerType={formData.triggerType}
                          actions={formData.actions}
                          onActionsChange={(actions: Action[]) => !readOnly && setFormData({ ...formData, actions })}
                          onSave={executeSave}
                          onBack={() => {
                            setCurrentStep('setup');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          saving={saving}
                          isCondensed={true}
                          readOnly={readOnly}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
