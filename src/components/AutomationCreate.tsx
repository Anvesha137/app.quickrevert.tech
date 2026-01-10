import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AutomationFormData, TriggerType, TriggerConfig, Action } from '../types/automation';
import BasicInfo from './automation-steps/BasicInfo';
import TriggerSelection from './automation-steps/TriggerSelection';
import TriggerConfigStep from './automation-steps/TriggerConfig';
import ActionConfig from './automation-steps/ActionConfig';

type Step = 'basic' | 'trigger' | 'config' | 'actions';

async function getValidSession(supabaseClient: any, currentState: any) {
  // Check if the current state session is valid and not expired
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  
  // If session exists and token is not expired, use it
  let validSession = currentState;
  if (!currentState || !currentState.access_token || (currentState.expires_at && currentState.expires_at <= currentTime)) {
    // Token is expired or doesn't exist, refresh it
    const { data } = await supabaseClient.auth.refreshSession();
    validSession = data.session;
  }
  
  if (!validSession || !validSession.access_token) {
    throw new Error("No valid Supabase session");
  }
  
  return validSession;
}

export default function AutomationCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('basic');
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [formData, setFormData] = useState<AutomationFormData>({
    name: '',
    triggerType: null,
    triggerConfig: null,
    actions: [],
  });

  useEffect(() => {
    // Initialize session on first load
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Subscribe to auth state changes
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    
    return () => {
      if (data?.subscription) {
        data.subscription.unsubscribe();
      }
    };
  }, []);
  
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
      // Get a valid session using the helper function to ensure the user is authenticated
      const validSession = await getValidSession(supabase, session);
      console.log('Saving automation:', {
        user_id: user.id,
        name: formData.name.trim(),
        trigger_type: formData.triggerType,
        trigger_config: formData.triggerConfig,
        actions: formData.actions,
        status: 'active',
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
          status: 'active',
        }).select('id').single(); // Get the ID of the created automation

      if (automationError) {
        console.error('Supabase error creating automation:', automationError);
        throw automationError;
      }

      // After successfully saving to Supabase, create the corresponding N8N workflow
      try {
        // Use the already validated and refreshed session
        const authToken = validSession?.access_token;
        
        if (!authToken) {
          console.error('No authentication token available for N8N workflow creation');
          // Don't throw an error here as the main automation was saved
          // Just log the issue and continue
        } else {
          // Prepare N8N workflow variables based on the automation
          const workflowVariables = {
            instagramCredentialId: 'TODO', // Need to fetch from user's Instagram account
            calendarUrl: 'https://example.com/book', // Default or from settings
            brandName: 'QuickRevert',
            automationId: automationData.id, // Use the automation ID
            userId: user.id,
          };

          // Fetch Instagram account details to get credential info
          const { data: instagramAccount } = await supabase
            .from('instagram_accounts')
            .select('id, instagram_user_id, username, access_token')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();
          
          if (instagramAccount) {
            // Use the instagram_user_id as the credential identifier
            workflowVariables.instagramCredentialId = instagramAccount.instagram_user_id;
          } else {
            console.warn('No active Instagram account found for user, proceeding without Instagram credential');
          }

          // Call the Supabase Edge Function to create the N8N workflow
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-workflow`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              userId: user.id,
              template: 'instagram_automation_v1',
              templateVars: workflowVariables,
              triggerConfig: formData.triggerConfig,
              actions: formData.actions,
              autoActivate: true,
            })
          });

          const result = await response.json();

          if (!response.ok) {
            console.error('Error creating N8N workflow:', result.error || `HTTP ${response.status}`);
            
            // Log the failure but continue since the main automation was saved
            // In a production app, you might want to update a status field
            // or implement a retry mechanism
            alert(`Warning: Automation saved but workflow creation failed: ${result.error || `HTTP ${response.status}`}. This may affect automation functionality.`);
          } else {
            console.log('N8N workflow created successfully:', result);
          }
        }
      } catch (n8nError: any) {
        console.error('Error in N8N workflow creation process:', n8nError);
        // Don't throw an error here as the main automation was saved
        // Just log the issue and continue
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
