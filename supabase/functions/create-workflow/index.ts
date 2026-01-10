import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
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
    
    // Get the Supabase client with service role for database operations
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const body = await req.json();
    const {
      userId,
      template,
      autoActivate,
      templateVars,
      triggerConfig,
      actions
    } = body;
    
    // Validate input
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate input
    if (!userId || !template || !templateVars) {
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
            "url": "={{ $json.instagramMessage }}",
            "options": {}
          },
          "id": "log-reply",
          "name": "Log Reply",
          "type": "n8n-nodes-base.log",
          "typeVersion": 1,
          "position": [900, 200]
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
                "node": "Log Reply",
                "type": "main",
                "index": 0
              }
            ],
            []
          ]
        },
        "Log Reply": {
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
    async function injectVariables(template: any, variables: Record<string, any>) {
      // Convert template to string, replace variables, then parse back
      let templateString = JSON.stringify(template);
      
      // Replace string variables in the template
      for (const [key, value] of Object.entries(variables)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          const placeholder = `{{${key}}}`;
          templateString = templateString.split(placeholder).join(String(value));
        }
      }
      
      return JSON.parse(templateString);
    }

    // Function to remove unsupported fields
    async function removeUnsupportedFields(workflow: any) {
      // Remove fields that are not supported or should not be in the template
      delete workflow.pinData;
      delete workflow.id;
      
      // Remove meta field if it exists
      if (workflow.meta) {
        delete workflow.meta;
      }
      
      // Remove webhookId since n8n generates it server-side
      if (workflow.webhookId !== undefined) {
        delete workflow.webhookId;
      }
      
      // Update timezone to Asia/Kolkata for Indian users
      if (workflow.settings && workflow.settings.timeZone) {
        workflow.settings.timeZone = "Asia/Kolkata";
      }
      
      // Remove nested meta fields recursively
      const removeNestedMeta = (obj: any) => {
        if (obj && typeof obj === 'object') {
          for (const key in obj) {
            if (key === 'meta') {
              delete obj[key];
            } else {
              removeNestedMeta(obj[key]);
            }
          }
        }
      };
      
      removeNestedMeta(workflow);
      
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
          "Authorization": `Bearer ${n8nApiKey}`
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
            "Authorization": `Bearer ${n8nApiKey}`
          }
        });
        
        if (!activateResponse.ok) {
          console.error(`Failed to activate workflow: ${activateResponse.status} ${activateResponse.statusText}`);
        }
      }
      
      return result;
    }

    // Create enhanced template variables with extracted values
    const enhancedTemplateVars = { ...templateVars };
    
    // Extract trigger keywords from automation configuration
    if (triggerConfig && triggerConfig.keywords) {
      const keywords = triggerConfig.keywords;
      // Add multiple keyword conditions to the template
      for (let i = 0; i < Math.min(keywords.length, 5); i++) { // Limit to 5 keywords
        enhancedTemplateVars[`triggerKeyword${i + 1}`] = keywords[i];
      }
    }
    
    // Extract reply templates from automation configuration
    if (actions && actions.length > 0) {
      const firstAction = actions[0]; // Use first action for now
      if (firstAction.replyTemplates && firstAction.replyTemplates.length > 0) {
        // Use a random reply template
        const randomIndex = Math.floor(Math.random() * firstAction.replyTemplates.length);
        enhancedTemplateVars.replyTemplate1 = firstAction.replyTemplates[randomIndex];
      }
    }
    
    // Inject variables into the template
    const workflowWithVariables = await injectVariables(workflowTemplate, enhancedTemplateVars);

    // Remove unsupported fields
    const cleanWorkflow = await removeUnsupportedFields(workflowWithVariables);

    // Log the cURL command that would be used to create the workflow
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
    const n8nApiKey = Deno.env.get("N8N_API_KEY")!;
    
    const curlCommand = `curl -X POST '${n8nBaseUrl}/api/v1/workflows' -H 'accept: application/json' -H 'Authorization: Bearer ***MASKED***' -H 'Content-Type: application/json' -d '${JSON.stringify(cleanWorkflow).replace(/'/g, "'")}'`;
    console.log('cURL command to create workflow (API key masked for security):');
    console.log(curlCommand);
    
    // Create workflow in N8N
    const n8nWorkflow = await createWorkflowInN8N(cleanWorkflow, autoActivate || false);

    // Store the mapping in Supabase using service role client
    const { error } = await supabaseServiceRole
      .from("n8n_workflows")
      .insert({
        user_id: userId,
        n8n_workflow_id: n8nWorkflow.id,
        template: template,
        variables: { templateVars, triggerConfig, actions },
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