import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { n8nService } from '../lib/n8nService';
import { AutomationFormData, TriggerType, TriggerConfig, Action } from '../types/automation';
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
    if (!user || !formData.name.trim() || !formData.triggerType || !formData.triggerConfig || formData.actions.length === 0) {
      return;
    }

    setSaving(true);

    try {
      // Get the user's Instagram account
      const { data: instagramAccount, error: igError } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (igError || !instagramAccount) {
        throw new Error('No active Instagram account found');
      }

      // Prepare workflow data
      const workflowData = {
        userId: user.id,
        instagramAccountId: instagramAccount.id,
        automationName: formData.name.trim(),
        triggerType: formData.triggerType,
        triggerConfig: formData.triggerConfig,
        actions: formData.actions,
        status: 'active' as const,
      };

      // Create workflow in N8N - with fallback to local storage if N8N is unavailable
      try {
        const n8nResponse = await n8nService.createWorkflow(workflowData);
        
        // Update local navigation after a brief delay to allow for processing
        setTimeout(() => {
          navigate('/automation');
        }, 1500);
      } catch (n8nError) {
        console.error('Error creating workflow in N8N:', n8nError);
        
        // Fallback: save to Supabase directly if N8N is unavailable
        const { error: supabaseError } = await supabase
          .from('automations')
          .insert({
            user_id: user.id,
            name: formData.name.trim(),
            trigger_type: formData.triggerType,
            trigger_config: formData.triggerConfig,
            actions: formData.actions,
            status: 'active',
            instagram_account_id: instagramAccount.id,
          });

        if (supabaseError) {
          console.error('Error saving automation to Supabase:', supabaseError);
          throw supabaseError; // This will be caught by the outer catch
        }
        
        // Navigate after successful fallback save
        navigate('/automation');
      }
    } catch (error: any) {
      console.error('Error creating automation:', error);
      
      // Check if this is a specific error we can handle
      if (error.message === 'No active Instagram account found') {
        alert('No active Instagram account found. Please connect an Instagram account first.');
      } else {
        alert('Failed to create automation. Please try again.');
      }
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
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      isCompleted
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
                    className={`mt-2 text-sm font-medium ${
                      isActive ? 'text-blue-600' : isPast ? 'text-gray-900' : 'text-gray-500'
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
              onTriggerSelect={(triggerType: TriggerType) => setFormData({ ...formData, triggerType })}
              onNext={() => setCurrentStep('config')}
              onBack={() => setCurrentStep('basic')}
            />
          )}

          {currentStep === 'trigger' && formData.triggerType !== null && (
            <TriggerSelection
              selectedTrigger={formData.triggerType}
              onTriggerSelect={(triggerType: TriggerType) => setFormData({ ...formData, triggerType })}
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
