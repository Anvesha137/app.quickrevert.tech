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
      
          // Create dynamic webhook path
          const webhookPath = `instagram-webhook-${user.id}-${Date.now()}`;
          
          // Load the Instagram DM automation workflow template
          const workflowTemplate = {
            name: `Instagram DM Automation ${new Date().toISOString().split('T')[0]}`,
            nodes: [
              {
                parameters: {
                  multipleMethods: true,
                  path: webhookPath, // Dynamic webhook path
                  responseMode: "responseNode",
                  options: {}
                },
                type: "n8n-nodes-base.webhook",
                typeVersion: 2.1,
                position: [-1568, 560],
                id: "9c6d45b7-9448-42ce-ba0c-a6adac690b19",
                name: "Webhook",
                webhookId: webhookPath
              },
              {
                parameters: {
                  respondWith: "text",
                  responseBody: "={{ $json.query['hub.challenge'] }}",
                  options: {}
                },
                type: "n8n-nodes-base.respondToWebhook",
                typeVersion: 1.4,
                position: [-1120, 80],
                id: "8d832c22-40a1-4051-8077-a642c1aac20b",
                name: "Respond to Webhook"
              },
              {
                parameters: {
                  conditions: {
                    options: {
                      caseSensitive: true,
                      leftValue: "",
                      typeValidation: "strict",
                      version: 2
                    },
                    conditions: [
                      {
                        id: "52773ef2-be7d-49e4-be5f-1906b21f4b60",
                        leftValue: "={{ $json.query['hub.mode'] }}",
                        rightValue: "subscribe",
                        operator: {
                          type: "string",
                          operation: "equals",
                          name: "filter.operator.equals"
                        }
                      },
                      {
                        id: "3fb1b160-b73c-44a6-a62b-525070ec6688",
                        leftValue: "={{ $json.query['hub.verify_token'] }}",
                        rightValue: "={{ $json.query['hub.verify_token'] }}",
                        operator: {
                          type: "string",
                          operation: "equals",
                          name: "filter.operator.equals"
                        }
                      }
                    ],
                    combinator: "and"
                  },
                  options: {}
                },
                type: "n8n-nodes-base.if",
                typeVersion: 2.2,
                position: [-1344, 80],
                id: "73355b53-be47-4e20-808e-9889821cc0d8",
                name: "If"
              },
              {
                parameters: {
                  rules: {
                    values: [
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              leftValue: "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                              rightValue: "hi",
                              operator: {
                                type: "string",
                                operation: "contains"
                              },
                              id: "106e1f83-ed53-45d0-a979-b5d2d9216586"
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "hi"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "3a64c616-1cef-43ec-b349-76e27b41d954",
                              leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
                              rightValue: "WHATSAPP_AUTOMATION",
                              operator: {
                                type: "string",
                                operation: "equals",
                                name: "filter.operator.equals"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "WhatsApp Automation"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "7b999a9d-c123-4125-aa20-671969a9c72b",
                              leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
                              rightValue: "INSTAGRAM_AUTOMATION",
                              operator: {
                                type: "string",
                                operation: "equals",
                                name: "filter.operator.equals"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "Instagram Automation"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "6e0d6eaf-0edd-4dda-90d5-61c6c6018b18",
                              leftValue: "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text }} ",
                              rightValue: "book",
                              operator: {
                                type: "string",
                                operation: "contains"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "book"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "9b741482-a927-40ee-8d8f-323fc51bf79e",
                              leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
                              rightValue: "=EXPLORE_NOW",
                              operator: {
                                type: "string",
                                operation: "contains"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "EXPLORE_NOW"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "ec73f3b1-aabf-45df-863e-c3e92d3a0b41",
                              leftValue: "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                              rightValue: "hey",
                              operator: {
                                type: "string",
                                operation: "contains"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "hey"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "52a34a60-1440-4d57-803d-5bb35e5b4797",
                              leftValue: "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                              rightValue: "hello",
                              operator: {
                                type: "string",
                                operation: "contains"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "hello"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "90824a09-9ca6-46be-8d83-6f43a676137b",
                              leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
                              rightValue: "Following",
                              operator: {
                                type: "string",
                                operation: "equals",
                                name: "filter.operator.equals"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "Following"
                      }
                    ]
                  },
                  options: {
                    ignoreCase: true
                  }
                },
                type: "n8n-nodes-base.switch",
                typeVersion: 3.3,
                position: [-1120, 944],
                id: "f2a79e62-b199-4cf5-9b62-50b728347bc7",
                name: "Switch1"
              },
              {
                parameters: {
                  content: "## Instagram automation\n",
                  height: 1744,
                  width: 1520,
                  color: 6
                },
                type: "n8n-nodes-base.stickyNote",
                position: [-1840, 32],
                typeVersion: 1,
                id: "3d476491-8b4d-4386-97eb-aedceb5fc568",
                name: "Sticky Note"
              },
              {
                parameters: {
                  rules: {
                    values: [
                      {
                        conditions: {
                          options: {
                            caseSensitive: false,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              leftValue: "={{ $json.body.entry[0].changes[0].value.text }}",
                              rightValue: "=Demo",
                              operator: {
                                type: "string",
                                operation: "equals"
                              },
                              id: "de04c81d-ab8c-4706-8d00-a191731e80a2"
                            }
                          ],
                          combinator: "and"
                        }
                      }
                    ]
                  },
                  options: {
                    ignoreCase: true
                  }
                },
                type: "n8n-nodes-base.switch",
                typeVersion: 3.3,
                position: [-1120, 272],
                id: "b97090cd-3b5c-40b3-8d5f-3bb8d9dca602",
                name: "Switch"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.facebook.com/v24.0/{{ $json.body.entry[0].changes[0].value.id }}/replies",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"message\": \"@{{ $json.body.entry[0].changes[0].value.from.username }} Thankyou for showing interest !✨ Will get back to you\"\n}\n",
                  options: {}
                },
                name: "Reply to comment",
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4,
                position: [-896, 272],
                id: "0dcc0e24-02fb-40fc-b41b-4046620e2c39"
              },
              {
                parameters: {
                  rules: {
                    values: [
                      {
                        conditions: {
                          options: {
                            caseSensitive: true,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              leftValue: "={{ $json.body.entry[0].changes[0].field }}",
                              rightValue: "comments",
                              operator: {
                                type: "string",
                                operation: "equals"
                              },
                              id: "c0f8da85-9794-48b5-a2e3-df805c3e4e03"
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true,
                        outputKey: "comments"
                      },
                      {
                        conditions: {
                          options: {
                            caseSensitive: true,
                            leftValue: "",
                            typeValidation: "strict",
                            version: 2
                          },
                          conditions: [
                            {
                              id: "e91b8930-35f5-4482-8f05-683ba73ddc21",
                              leftValue: "=",
                              rightValue: "",
                              operator: {
                                type: "string",
                                operation: "equals",
                                name: "filter.operator.equals"
                              }
                            }
                          ],
                          combinator: "and"
                        },
                        renameOutput: true
                      }
                    ]
                  },
                  options: {}
                },
                type: "n8n-nodes-base.switch",
                typeVersion: 3.3,
                position: [-1344, 656],
                id: "a9428d66-e3b7-4010-9aa6-c46858e33bcb",
                name: "Switch2"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": {\n    \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Hi👋\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Thank you for reaching out to QuickRevert!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing QuickRevert!\",\n            \"buttons\": [\n              {\n                \"type\": \"postback\",\n                \"title\": \"Explore Now\",\n                \"payload\": \"EXPLORE_NOW\"\n              },\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://calendar.app.google/QmsYv4Q4G5DNeham6\",\n                \"title\": \"Book Demo\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 464],
                id: "3f193aea-2e04-4bf6-bcd2-d71070f098c6",
                name: "HI"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages ",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": { \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Great choice\\nOur Whatsapp Automation solution helps businesses reply instantly, qualify leads, and manage all customer conversations in one place.\\n\\nOne of our experts will contact you soon to guide you further.\\n\\nYou can also book a quick demo to see how it works📅\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Thank you for choosing QuickRevert!\",\n            \"buttons\": [\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://calendar.app.google/QmsYv4Q4G5DNeham6\",\n                \"title\": \"Book Demo\"\n              }\\\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 656],
                id: "44338e99-8617-407b-a557-798241aac9e0",
                name: "WHATSAPP_AUTOMATION"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages ",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": { \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Great choice\\nOur instagram Automation solution helps businesses reply instantly, qualify leads, and manage all customer conversations in one place.\\n\\nOne of our experts will contact you soon to guide you further.\\n\\nYou can also book a quick demo to see how it works📅\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Thank you for choosing QuickRevert!\",\n            \"buttons\": [\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://calendar.app.google/QmsYv4Q4G5DNeham6\",\n                \"title\": \"Book Demo\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 848],
                id: "7756baf1-ca27-4743-9018-99ba99e0e18b",
                name: "INSTA_AUTOMATION"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages ",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": { \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Awesome🙌\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Let's help you get started!\\nTell us what you are looking for?\",\n            \"buttons\": [\n              { \"type\": \"postback\", \"title\": \"WhatsApp Automation\", \"payload\": \"WHATSAPP_AUTOMATION\" },\n              { \"type\": \"postback\", \"title\": \"Instagram Automation\", \"payload\": \"INSTAGRAM_AUTOMATION\" }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 1040],
                id: "32e72098-20cd-43d2-83c3-7a7a242bb63d",
                name: "EXPLORE NOW"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": {\n    \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Hi👋\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Thank you for reaching out to QuickRevert!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing QuickRevert!\",\n            \"buttons\": [\n              {\n                \"type\": \"postback\",\n                \"title\": \"Explore Now\",\n                \"payload\": \"EXPLORE_NOW\"\n              },\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://calendar.app.google/QmsYv4Q4G5DNeham6\",\n                \"title\": \"Book Demo\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 1232],
                id: "d950345b-835c-4dfc-9aa2-55b802479811",
                name: "hey"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": {\n    \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Hi👋\",\n            \"image_url\": \"https://i.ibb.co/N29QzF6Z/QR-Logo.png\",\n            \"subtitle\": \"Thank you for reaching out to QuickRevert!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing QuickRevert!\",\n            \"buttons\": [\n              {\n                \"type\": \"postback\",\n                \"title\": \"Explore Now\",\n                \"payload\": \"EXPLORE_NOW\"\n              },\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://calendar.app.google/QmsYv4Q4G5DNeham6\",\n                \"title\": \"Book Demo\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 1424],
                id: "e3b649e2-9f0a-4686-a47c-a0f7ea827d5c",
                name: "HELLO"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages ",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": {\n    \"id\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Cool 😎\\nHere's the link you asked for\",\n            \"buttons\": [\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://quickrevert.tech/\",\n                \"title\": \"Link\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-896, 1616],
                id: "39879385-4e00-440c-a707-1e720a7a2e06",
                name: "following"
              },
              {
                parameters: {
                  method: "POST",
                  url: "=https://graph.instagram.com/v24.0/{{ $('Switch').item.json.body.entry[0].id }}/messages",
                  authentication: "genericCredentialType",
                  genericAuthType: "httpHeaderAuth",
                  sendHeaders: true,
                  headerParameters: {
                    parameters: [
                      {
                        name: "Content-Type",
                        value: "application/json"
                      },
                      {
                        name: "Authorization",
                        value: `Bearer ${instagramAccount?.access_token || 'default_token'}`
                      }
                    ]
                  },
                  sendBody: true,
                  specifyBody: "json",
                  jsonBody: "={\n  \"recipient\": {\n    \"id\": \"{{ $('Switch').item.json.body.entry[0].changes[0].value.from.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"Cool 😎\\nBefore I share you the link, please hit that follow button\",\n            \"buttons\": [\n              {\n                \"type\": \"postback\",\n                \"title\": \"I'm Following ✅\",\n                \"payload\": \"Following\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n",
                  options: {}
                },
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4.3,
                position: [-672, 272],
                id: "3e99d72b-33b2-4aff-b0aa-4d4773d0032b",
                name: "please follow"
              }
            ],
            connections: {
              "Webhook": {
                main: [
                  [
                    {
                      node: "If",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "Switch2",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "If": {
                main: [
                  [
                    {
                      node: "Respond to Webhook",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "Switch1": {
                main: [
                  [
                    {
                      node: "HI",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "WHATSAPP_AUTOMATION",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "INSTA_AUTOMATION",
                      type: "main",
                      index: 0
                    }
                  ],
                  [],
                  [
                    {
                      node: "EXPLORE NOW",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "hey",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "HELLO",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "following",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "Switch": {
                main: [
                  [
                    {
                      node: "Reply to comment",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "Reply to comment": {
                main: [
                  [
                    {
                      node: "please follow",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "Switch2": {
                main: [
                  [
                    {
                      node: "Switch",
                      type: "main",
                      index: 0
                    }
                  ],
                  [
                    {
                      node: "Switch1",
                      type: "main",
                      index: 0
                    }
                  ]
                ]
              },
              "HI": {
                main: [
                  []
                ]
              }
            },
            settings: {
              saveExecutionProgress: true,
              saveManualExecutions: true,
              saveDataErrorExecution: "all",
              saveDataSuccessExecution: "all",
              executionTimeout: 3600,
              timezone: "Asia/Kolkata"
            }
          };
          
          // Call the N8N API directly to create the workflow
          const n8nResponse = await fetch('https://khushi-n8n.g5ccll.easypanel.host/api/v1/workflows', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-N8N-API-KEY': import.meta.env.VITE_N8N_API_KEY
            },
            body: JSON.stringify(workflowTemplate)
          });
      
          const n8nResult = await n8nResponse.json();
      
          if (!n8nResponse.ok) {
            console.error('Error creating N8N workflow:', n8nResult.error || `HTTP ${n8nResponse.status}`);
                  
            // Log the failure but continue since the main automation was saved
            // In a production app, you might want to update a status field
            // or implement a retry mechanism
            const errorMsg = n8nResult?.error || `HTTP ${n8nResponse?.status || 'Unknown'}`;
            alert(`Warning: Automation saved but workflow creation failed: ${errorMsg}. This may affect automation functionality.`);
          } else {
            console.log('N8N workflow created successfully:', n8nResult);
                  
            // Store the workflow mapping in Supabase
            const { error: mappingError } = await supabase
              .from('n8n_workflows')
              .insert({
                user_id: user.id,
                n8n_workflow_id: n8nResult.id,
                n8n_workflow_name: n8nResult.name,
                webhook_path: webhookPath,
                created_at: new Date().toISOString()
              });
                    
            if (mappingError) {
              console.error('Error storing workflow mapping:', mappingError);
            } else {
              console.log('Workflow mapping stored in Supabase');
            }
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
