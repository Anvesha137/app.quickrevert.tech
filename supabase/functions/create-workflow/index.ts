import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { userId, template, variables, autoActivate } = body;

    // Validate input
    if (!userId || !template || !variables) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow predefined templates
    if (template !== "instagram_automation_v1") {
      return new Response(JSON.stringify({ error: "Invalid template" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instagram automation workflow template
    const instagramWorkflowTemplate = {
      "name": "Instagram DM Automation Workflow",
      "nodes": [
        {
          "parameters": {
            "httpMethod": "POST",
            "path": "instagram-webhook-{{userId}}-{{automationId}}",
            "responseMode": "responseNode",
            "options": {}
          },
          "id": "webhook-trigger",
          "name": "Instagram DM Trigger",
          "type": "n8n-nodes-base.webhook",
          "typeVersion": 1,
          "position": [240, 300],
          "webhookId": "{{webhookId}}"
        },
        {
          "parameters": {
            "values": {
              "string": [
                {
                  "name": "instagramMessage",
                  "value": "={{ ($requestBody || $input.first().json).message || $json.text || $json.message || '' }}"
                },
                {
                  "name": "instagramUserId",
                  "value": "={{ ($requestBody || $input.first().json).sender_id || $json.sender_id || $json.from.id || '' }}"
                },
                {
                  "name": "instagramUserName",
                  "value": "={{ ($requestBody || $input.first().json).sender_name || $json.sender_name || $json.from.username || '' }}"
                }
              ]
            },
            "options": {}
          },
          "id": "extract-message-data",
          "name": "Extract Message Data",
          "type": "n8n-nodes-base.set",
          "typeVersion": 1,
          "position": [500, 300]
        },
        {
          "parameters": {
            "conditions": {
              "options": {
                "caseSensitive": false,
                "leftValue": "",
                "typeValidation": "loose"
              },
              "conditions": [
                {
                  "id": "condition-1",
                  "leftValue": "={{ $json.instagramMessage.toLowerCase() }}",
                  "rightValue": "{{triggerKeyword1}}",
                  "operator": {
                    "type": "string",
                    "operation": "contains"
                  }
                }
              ],
              "combinator": "or"
            },
            "options": {
              "elseOutput": "noMatch"
            }
          },
          "id": "check-keyword-condition",
          "name": "Check Keyword Condition",
          "type": "n8n-nodes-base.if",
          "typeVersion": 2,
          "position": [700, 300]
        },
        {
          "parameters": {
            "method": "POST",
            "url": "https://graph.instagram.com/v20.0/me/messages",
            "sendHeaders": true,
            "headerParameters": {
              "parameters": [
                {
                  "name": "Authorization",
                  "value": "Bearer {{instagramAccessToken}}"
                },
                {
                  "name": "Content-Type",
                  "value": "application/json"
                }
              ]
            },
            "sendBody": true,
            "bodyParameters": {
              "parameters": [
                {
                  "name": "recipient",
                  "value": "{\"id\": \"{{$json.instagramUserId}}\"}"
                },
                {
                  "name": "message",
                  "value": "{\"text\": \"{{replyTemplate1}}\"}"
                }
              ]
            },
            "options": {}
          },
          "id": "send-instagram-reply",
          "name": "Send Instagram DM Reply",
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4,
          "position": [900, 200],
          "credentials": {
            "httpHeaderAuth": {
              "id": "{{instagramCredentialId}}",
              "name": "Instagram API"
            }
          }
        },
        {
          "parameters": {
            "operation": "create",
            "tableId": "logs",
            "fieldsUi": {
              "valuesContainer": {
                "values": [
                  {
                    "name": "timestamp",
                    "value": "={{ new Date().toISOString() }}"
                  },
                  {
                    "name": "userId",
                    "value": "={{ $json.userId || '{{userId}}' }}"
                  },
                  {
                    "name": "automationId",
                    "value": "={{ $json.automationId || '{{automationId}}' }}"
                  },
                  {
                    "name": "message",
                    "value": "={{ $json.instagramMessage }}"
                  },
                  {
                    "name": "response",
                    "value": "{{replyTemplate1}}"
                  },
                  {
                    "name": "status",
                    "value": "sent"
                  }
                ]
              }
            }
          },
          "id": "log-response",
          "name": "Log Response",
          "type": "n8n-nodes-base.supabase",
          "typeVersion": 1,
          "position": [1100, 200],
          "credentials": {
            "supabaseApi": {
              "id": "{{supabaseCredentialId}}",
              "name": "Supabase account"
            }
          }
        }
      ],
      "connections": {
        "Instagram DM Trigger": {
          "main": [
            [
              {
                "node": "Extract Message Data",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Extract Message Data": {
          "main": [
            [
              {
                "node": "Check Keyword Condition",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Check Keyword Condition": {
          "main": [
            [
              {
                "node": "Send Instagram DM Reply",
                "type": "main",
                "index": 0
              }
            ],
            []
          ]
        },
        "Send Instagram DM Reply": {
          "main": [
            [
              {
                "node": "Log Response",
                "type": "main",
                "index": 0
              }
            ]
          ]
        }
      },
      "active": false,
      "settings": {
        "saveManualExecutions": true,
        "timeZone": "America/New_York"
      },
      "tags": []
    };

    // Load the appropriate template
    let workflowTemplate;
    if (template === "instagram_automation_v1") {
      workflowTemplate = JSON.parse(JSON.stringify(instagramWorkflowTemplate)); // Deep clone
    } else {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Function to inject variables
    async function injectVariables(template: any, variables: Record<string, string>) {
      // Convert template to string, replace variables, then parse back
      let templateString = JSON.stringify(template);
      
      // Replace variables in the template
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        templateString = templateString.split(placeholder).join(value);
      }
      
      // Replace webhookId with a generated ID if not provided
      if (!variables.webhookId) {
        const webhookId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        templateString = templateString.split('{{webhookId}}').join(webhookId);
      }
      
      return JSON.parse(templateString);
    }

    // Function to remove unsupported fields
    async function removeUnsupportedFields(workflow: any) {
      // Remove fields that are not supported or should not be in the template
      delete workflow.pinData;
      delete workflow.meta;
      delete workflow.id;
      
      // Clean up any remaining placeholder values
      if (workflow.webhookId && workflow.webhookId.includes('{{')) {
        workflow.webhookId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      return workflow;
    }

    // Function to create workflow in N8N
    async function createWorkflowInN8N(workflowData: any, activate: boolean = false) {
      const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
      const n8nApiKey = Deno.env.get("N8N_API_KEY")!;
      
      // Call N8N API to create workflow
      const response = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey
        },
        body: JSON.stringify(workflowData)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create workflow in N8N: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      const workflowId = result.data?.id || result.id;
      
      // Optionally activate the workflow
      if (activate && workflowId) {
        const activateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/activate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-N8N-API-KEY": n8nApiKey
          }
        });
        
        if (!activateResponse.ok) {
          console.error(`Failed to activate workflow: ${activateResponse.status} ${activateResponse.statusText}`);
        }
      }
      
      return result;
    }

    // Extract trigger keywords and reply templates from automation configuration
    const enhancedVariables = { ...variables };
    
    // Extract trigger keywords from automation configuration
    if (variables.triggerConfig && variables.triggerConfig.keywords) {
      const keywords = variables.triggerConfig.keywords;
      // Add multiple keyword conditions to the template
      for (let i = 0; i < Math.min(keywords.length, 5); i++) { // Limit to 5 keywords
        enhancedVariables[`triggerKeyword${i + 1}`] = keywords[i];
      }
    }
    
    // Extract reply templates from automation configuration
    if (variables.actions && variables.actions.length > 0) {
      const firstAction = variables.actions[0]; // Use first action for now
      if (firstAction.replyTemplates && firstAction.replyTemplates.length > 0) {
        // Use a random reply template
        const randomIndex = Math.floor(Math.random() * firstAction.replyTemplates.length);
        enhancedVariables.replyTemplate1 = firstAction.replyTemplates[randomIndex];
      }
    }
    
    // Inject variables into the template
    const workflowWithVariables = await injectVariables(workflowTemplate, enhancedVariables);

    // Remove unsupported fields
    const cleanWorkflow = await removeUnsupportedFields(workflowWithVariables);

    // Log the cURL command that would be used to create the workflow
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
    const n8nApiKey = Deno.env.get("N8N_API_KEY")!;
    
    const curlCommand = `curl -X POST '${n8nBaseUrl}/api/v1/workflows' -H 'accept: application/json' -H 'X-N8N-API-KEY: ${n8nApiKey}' -H 'Content-Type: application/json' -d '${JSON.stringify(cleanWorkflow).replace(/'/g, "'")}'`;
    console.log('cURL command to create workflow:');
    console.log(curlCommand);
    
    // Create workflow in N8N
    const n8nWorkflow = await createWorkflowInN8N(cleanWorkflow, autoActivate || false);

    // Store the mapping in Supabase
    const { error } = await supabase
      .from("n8n_workflows")
      .insert({
        user_id: userId,
        n8n_workflow_id: n8nWorkflow.id,
        template: template,
        variables: variables,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Error storing workflow mapping:", error);
      return new Response(JSON.stringify({ error: "Failed to store workflow mapping" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      workflowId: n8nWorkflow.id,
      n8nWorkflow: n8nWorkflow,
      message: `Workflow created successfully${autoActivate ? " and activated" : ""}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error creating workflow:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});