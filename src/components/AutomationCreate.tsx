import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AutomationFormData, TriggerType, TriggerConfig, Action, ReplyToCommentAction, SendDmAction } from '../types/automation';
import { N8nWorkflowService } from '../lib/n8nService';
import BasicInfo from './automation-steps/BasicInfo';
import TriggerSelection from './automation-steps/TriggerSelection';
import TriggerConfigStep from './automation-steps/TriggerConfig';
import ActionConfig from './automation-steps/ActionConfig';

type Step = 'basic' | 'trigger' | 'config' | 'actions';

export default function AutomationCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('basic');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<AutomationFormData>({
    name: '',
    triggerType: null,
    triggerConfig: null,
    actions: [],
  });

  useEffect(() => {
    checkInstagramAccount();
  }, [user]);

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
        alert('Please connect an Instagram account before creating automations.');
        navigate('/connect-accounts');
      }
    } catch (error) {
      console.error('Error checking Instagram account:', error);
    }
  };

  const steps = [
    { id: 'basic', name: 'Basic Info', completed: formData.name.trim().length > 0 },
    { id: 'trigger', name: 'Trigger', completed: formData.triggerType !== null },
    { id: 'config', name: 'Configure', completed: formData.triggerConfig !== null },
    { id: 'actions', name: 'Actions', completed: formData.actions.length > 0 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const handleSave = async () => {
    if (!user) {
      console.error('No user authenticated');
      alert('You must be logged in to create an automation');
      return;
    }

    if (!formData.name.trim()) {
      console.error('Automation name is required');
      alert('Please provide a name for your automation');
      return;
    }

    if (!formData.triggerType) {
      console.error('Trigger type is required');
      alert('Please select a trigger type');
      return;
    }

    if (!formData.triggerConfig) {
      console.error('Trigger configuration is required');
      alert('Please configure your trigger');
      return;
    }

    if (formData.actions.length === 0) {
      console.error('At least one action is required');
      alert('Please add at least one action to your automation');
      return;
    }

    setSaving(true);

    try {
      console.log('Saving automation:', {
        user_id: user.id,
        name: formData.name.trim(),
        trigger_type: formData.triggerType,
        trigger_config: formData.triggerConfig,
        actions: formData.actions,
        status: 'inactive',
      });

      // First, save the automation to Supabase
      const { data: automationData, error: automationError } = await supabase
        .from('automations')
        .insert({
          user_id: user.id,
          name: formData.name.trim(),
          trigger_type: formData.triggerType,
          trigger_config: formData.triggerConfig,
          actions: formData.actions,
          status: 'inactive',
        }).select('id').single(); // Get the ID of the created automation

      if (automationError) {
        console.error('Supabase error creating automation:', automationError);
        throw automationError;
      }

      // After successfully saving to Supabase, create the corresponding N8N workflow
      try {
        // Fetch Instagram account details
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
          alert('Warning: Automation saved but no Instagram account found. Please connect an Instagram account to create workflows.');
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
        alert(`Warning: Automation saved but workflow creation failed: ${n8nError.message || 'Unknown error'}. This may affect automation functionality.`);
      }

      navigate('/automation');
    } catch (error: any) {
      console.error('Error creating automation:', error);
      alert(`Failed to create automation: ${error.message || 'Please try again'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/automation')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            Back to Automations
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Create Automation</h1>
          <p className="text-gray-600 mt-1">Set up a new Instagram automation</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-10">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              />
            </div>
            {steps.map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted = step.completed && currentStepIndex > index;
              const isPast = currentStepIndex > index;

              return (
                <div key={step.id} className="flex flex-col items-center relative">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${isCompleted
                      ? 'bg-blue-600 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white'
                        : isPast
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-white border-2 border-gray-300 text-gray-400'
                      }`}
                  >
                    {isCompleted ? <Check size={20} /> : index + 1}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${isActive ? 'text-blue-600' : isPast ? 'text-gray-900' : 'text-gray-500'
                      }`}
                  >
                    {step.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {currentStep === 'basic' && (
            <BasicInfo
              name={formData.name}
              onNameChange={(name) => setFormData({ ...formData, name })}
              onNext={() => setCurrentStep('trigger')}
            />
          )}

          {currentStep === 'trigger' && formData.triggerType === null && (
            <TriggerSelection
              selectedTrigger={formData.triggerType}
              onTriggerSelect={(triggerType: TriggerType) => {
                // Set default configuration based on trigger type
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
              onNext={() => setCurrentStep('config')}
              onBack={() => setCurrentStep('basic')}
            />
          )}

          {currentStep === 'trigger' && formData.triggerType !== null && (
            <TriggerSelection
              selectedTrigger={formData.triggerType}
              onTriggerSelect={(triggerType: TriggerType) => {
                // Set default configuration based on trigger type
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
              onNext={() => setCurrentStep('config')}
              onBack={() => setCurrentStep('basic')}
            />
          )}

          {currentStep === 'config' && formData.triggerType && (
            <TriggerConfigStep
              triggerType={formData.triggerType}
              config={formData.triggerConfig}
              onConfigChange={(triggerConfig: TriggerConfig) => setFormData({ ...formData, triggerConfig })}
              onNext={() => setCurrentStep('actions')}
              onBack={() => setCurrentStep('trigger')}
            />
          )}

          {currentStep === 'actions' && formData.triggerType && (
            <ActionConfig
              triggerType={formData.triggerType}
              actions={formData.actions}
              onActionsChange={(actions: Action[]) => setFormData({ ...formData, actions })}
              onSave={handleSave}
              onBack={() => setCurrentStep('config')}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
