import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Pencil, Zap } from 'lucide-react';
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
      <div className="flex-1 relative min-h-screen overflow-x-hidden p-4 md:p-8 bg-[#f8fafc]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white border-b border-slate-100 p-4 rounded-3xl shadow-sm mb-6 max-w-[1400px] mx-auto"
        >
          <div className="flex items-center gap-3 px-2">
            <button
              onClick={() => navigate('/automation')}
              className="text-slate-500 hover:text-purple-600 transition-colors"
            >
              <span className="font-semibold text-sm">Automations</span>
            </button>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-sm text-slate-800 tracking-tight">Create Automation</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center group relative border border-slate-200 rounded-xl px-4 py-2 hover:border-slate-300 transition-all">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => !readOnly && setFormData({ ...formData, name: e.target.value })}
                placeholder="Untitled Automation"
                disabled={readOnly}
                className="bg-transparent border-none outline-none text-base font-bold text-slate-800 placeholder-slate-400 focus:ring-0 p-0 w-[200px]"
              />
              {!readOnly && <Pencil size={14} className="text-slate-400 ml-2" />}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Saved
            </div>
            <button
              onClick={() => navigate('/automation')}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
            >
              Discard
            </button>
            <button
              onClick={executeSave}
              disabled={saving || readOnly}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-purple-500/20 flex items-center gap-2"
            >
              {saving ? 'Saving...' : 'Save Automation'}
            </button>
          </div>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6 max-w-[1400px] mx-auto min-h-[700px]">

          {/* Left Stepper Column */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <div className="sticky top-8 space-y-6">
              {steps.map((step, index) => {
                const isActive = currentStep === step.id;
                const isCompleted = step.completed && currentStepIndex > index;
                const isFuture = index > currentStepIndex;

                return (
                  <div key={step.id} className="relative flex items-start gap-4 group">
                    {/* Vertical Line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-4 top-10 bottom-[-24px] w-px bg-slate-200" />
                    )}

                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all z-10",
                      isActive || isCompleted
                        ? "bg-purple-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    )}>
                      {isCompleted ? <Check size={14} className="stroke-[3]" /> : index + 1}
                    </div>

                    <div className="pt-1 cursor-pointer" onClick={() => {
                      // Only allow clicking back or current, not future (unless all completed)
                      if (isCompleted || isActive) setCurrentStep(step.id as Step);
                    }}>
                      <h4 className={cn(
                        "font-bold text-sm tracking-tight transition-colors",
                        isActive ? "text-purple-600" : "text-slate-700"
                      )}>
                        {step.name.split(': ')[1] || step.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        {index === 0 ? "Choose what starts" : "Set conditions"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Middle Content Column */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="p-6 md:p-10 space-y-12 bg-white border border-slate-100 rounded-3xl shadow-sm"
              >
                {currentStep === 'setup' && (
                  <div className="space-y-8">
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
                      onNext={() => { }}
                      onBack={() => navigate('/automation')}
                      readOnly={readOnly}
                    />

                    {formData.triggerType && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="pt-8 border-t border-slate-100"
                      >
                        <TriggerConfigStep
                          triggerType={formData.triggerType}
                          config={formData.triggerConfig}
                          onConfigChange={(triggerConfig: TriggerConfig) => !readOnly && setFormData({ ...formData, triggerConfig })}
                          onNext={() => setCurrentStep('configuration')}
                          onBack={() => { }}
                          readOnly={readOnly}
                        />
                      </motion.div>
                    )}
                  </div>
                )}

                {currentStep === 'configuration' && formData.triggerType && (
                  <div className="space-y-8">
                    <ActionConfig
                      triggerType={formData.triggerType}
                      actions={formData.actions}
                      onActionsChange={(actions: Action[]) => !readOnly && setFormData({ ...formData, actions })}
                      onSave={executeSave}
                      onBack={() => setCurrentStep('setup')}
                      saving={saving}
                      readOnly={readOnly}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Preview Column */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
            <div className="sticky top-8 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm min-h-[600px] flex flex-col items-center">
              <h3 className="w-full font-bold text-slate-800 text-lg mb-6 flex justify-between items-center">
                Preview
                <span className="text-slate-400 bg-slate-100 p-1.5 rounded-lg">
                  <Zap size={16} />
                </span>
              </h3>

              {/* Instagram Mockup */}
              <div className="w-full max-w-[280px] bg-slate-50 border-8 border-slate-200 rounded-[40px] h-[450px] overflow-hidden relative shadow-inner">
                {/* Mockup Top speaker slot */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-200 rounded-b-2xl z-20"></div>

                <div className="p-4 pt-10 h-full flex flex-col justify-end space-y-4 relative">
                  {/* Dummy bg image */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-50 z-0"></div>

                  <div className="relative z-10 flex flex-col gap-3 w-full">
                    {/* Incoming message */}
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[10px] text-slate-500 ml-2">User {formData.triggerType === 'post_comment' ? 'comments:' : 'says:'}</span>
                      <div className="bg-white px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm text-sm text-slate-700 max-w-[85%] self-start relative">
                        <div className="w-6 h-6 rounded-full bg-slate-200 absolute -left-2 -bottom-2 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-400">
                          U
                        </div>
                        Hey! Tell me the price?
                      </div>
                    </div>

                    {/* Bot reply */}
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 rounded-2xl rounded-br-sm shadow-md text-sm text-white max-w-[85%] self-end relative">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 absolute -right-2 -bottom-2 border-2 border-white flex items-center justify-center p-1">
                        <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                          <Zap size={10} className="text-pink-500 fill-pink-500" />
                        </div>
                      </div>
                      {formData.actions[0]?.type === 'send_dm' || formData.actions[1]?.type === 'send_dm'
                        ? "Thanks for asking! Check your DM 😊"
                        : "Waiting for actions..."}
                    </div>
                  </div>
                </div>
              </div>

              {/* Next step button area */}
              <div className="mt-auto pt-8 w-full">
                <div className="relative flex py-4 items-center mb-4">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase tracking-widest font-semibold">Next Step</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                {currentStep === 'setup' ? (
                  <button
                    onClick={() => setCurrentStep('configuration')}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold transition-all hover:shadow-lg hover:shadow-purple-500/20 text-center"
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    onClick={executeSave}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold transition-all hover:shadow-lg hover:shadow-purple-500/20 text-center"
                  >
                    Save & Finish ✓
                  </button>
                )}

                {currentStep === 'setup' && (
                  <button className="w-full mt-3 text-slate-400 hover:text-slate-600 text-sm font-semibold transition-colors">
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
