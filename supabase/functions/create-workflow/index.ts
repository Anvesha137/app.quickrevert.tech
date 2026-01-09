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
      "name": "Instagram Automation Workflow",
      "nodes": [
        {
          "parameters": {},
          "id": "webhook-trigger",
          "name": "Webhook Trigger",
          "type": "n8n-nodes-base.webhook",
          "typeVersion": 1,
          "position": [240, 300]
        },
        {
          "parameters": {
            "values": {
              "string": [
                {
                  "name": "response",
                  "value": "={{ ($requestBody || $input.first().json).text || '' }}"
                }
              ]
            },
            "options": {}
          },
          "id": "set-response",
          "name": "Set Response",
          "type": "n8n-nodes-base.set",
          "typeVersion": 1,
          "position": [500, 300]
        },
        {
          "parameters": {
            "conditions": {
              "options": {
                "caseSensitive": true,
                "leftValue": "",
                "typeValidation": "strict"
              },
              "conditions": [
                {
                  "id": "condition-1",
                  "leftValue": "={{ $json.response.toLowerCase() }}",
                  "rightValue": "hello",
                  "operator": {
                    "type": "string",
                    "operation": "contains"
                  }
                }
              ],
              "combinator": "and"
            },
            "options": {}
          },
          "id": "check-hello",
          "name": "Check for Hello",
          "type": "n8n-nodes-base.if",
          "typeVersion": 2,
          "position": [700, 300]
        },
        {
          "parameters": {
            "method": "POST",
            "url": "https://graph.instagram.com/{{instagramMediaId}}/replies",
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
                  "name": "message",
                  "value": "Hi there! Thanks for reaching out to {{brandName}}! 🙌"
                }
              ]
            },
            "options": {}
          },
          "id": "send-hello-reply",
          "name": "Send Hello Reply",
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4,
          "position": [900, 200]
        },
        {
          "parameters": {
            "method": "POST",
            "url": "https://graph.instagram.com/{{instagramMediaId}}/replies",
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
                  "name": "message",
                  "value": "Thanks for your message! Check out our services: {{calendarUrl}}"
                }
              ]
            },
            "options": {}
          },
          "id": "send-default-reply",
          "name": "Send Default Reply",
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4,
          "position": [900, 400]
        }
      ],
      "connections": {
        "Webhook Trigger": {
          "main": [
            [
              {
                "node": "Set Response",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Set Response": {
          "main": [
            [
              {
                "node": "Check for Hello",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Check for Hello": {
          "main": [
            [
              {
                "node": "Send Hello Reply",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "Send Default Reply",
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
      const n8nUrl = Deno.env.get("N8N_URL")!;
      const n8nApiKey = Deno.env.get("N8N_API_KEY")!;
      
      // Call N8N API to create workflow
      const response = await fetch(`${n8nUrl}/api/v1/workflows`, {
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
      const workflowId = result.id;
      
      // Optionally activate the workflow
      if (activate) {
        const activateResponse = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}/activate`, {
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

    // Inject variables into the template
    const workflowWithVariables = await injectVariables(workflowTemplate, variables);

    // Remove unsupported fields
    const cleanWorkflow = await removeUnsupportedFields(workflowWithVariables);

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