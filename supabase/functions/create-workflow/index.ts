import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("Creating workflow...");
    
    // Parse request body
    const body = await req.json();
    const { userId, templateVars } = body;
    
    console.log("User ID:", userId);
    console.log("Template vars:", templateVars);
    
    // Validate input
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get n8n credentials from environment variables
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("N8N_API_KEY");
    
    console.log("N8N Base URL:", n8nBaseUrl ? "Set" : "Not set");
    console.log("N8N API Key:", n8nApiKey ? "Set (masked)" : "Not set");
    
    if (!n8nBaseUrl) {
      console.error("N8N_BASE_URL not configured");
      return new Response(JSON.stringify({ error: "N8N_BASE_URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!n8nApiKey) {
      console.error("N8N_API_KEY not configured");
      return new Response(JSON.stringify({ error: "N8N_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a simple test workflow
    const workflowName = `Instagram Automation ${new Date().toISOString().split('T')[0]}`;
    const webhookPath = `instagram-webhook-${userId}-${Date.now()}`;
    
    const simpleWorkflow = {
      name: workflowName,
      nodes: [
        {
          id: "webhook-node",
          name: "Instagram Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2.1,
          position: [100, 300],
          parameters: {
            httpMethod: "POST",
            path: webhookPath,
            responseMode: "responseNode",
            options: {}
          }
        },
        {
          id: "log-node",
          name: "Log Webhook Data",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [320, 300],
          parameters: {
            jsCode: `// Log incoming webhook data\nconsole.log('Webhook received:', $input.first().json);\nreturn $input.first();`
          }
        }
      ],
      connections: {
        "Instagram Webhook": {
          main: [
            [
              {
                node: "Log Webhook Data",
                type: "main",
                index: 0
              }
            ]
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

    // Call n8n API
    console.log("Calling N8N API...");
    const n8nResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey
      },
      body: JSON.stringify(simpleWorkflow)
    });

    // Log the response for debugging
    const responseText = await n8nResponse.text();
    console.log("N8N Response Status:", n8nResponse.status);
    console.log("N8N Response:", responseText);

    if (!n8nResponse.ok) {
      console.error("N8N API error details:", {
        status: n8nResponse.status,
        statusText: n8nResponse.statusText,
        body: responseText
      });
      
      return new Response(JSON.stringify({ 
        error: `Failed to create workflow in n8n: ${n8nResponse.status} ${n8nResponse.statusText}`,
        details: responseText
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let n8nResult;
    try {
      n8nResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse N8N response:", parseError);
      n8nResult = { id: "unknown", name: workflowName };
    }

    console.log("Workflow created successfully:", n8nResult.id);

    // Create Supabase client to store the workflow mapping
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from("n8n_workflows")
          .insert({
            user_id: userId,
            n8n_workflow_id: n8nResult.id,
            n8n_workflow_name: n8nResult.name,
            webhook_path: webhookPath,
            created_at: new Date().toISOString()
          });
        
        console.log("Workflow mapping stored in Supabase");
      } catch (dbError) {
        console.error("Failed to store workflow mapping:", dbError);
        // Continue even if database storage fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      workflowId: n8nResult.id,
      workflowName: n8nResult.name,
      webhookPath: webhookPath,
      webhookUrl: `${n8nBaseUrl}/webhook/${webhookPath}`,
      message: "Workflow created successfully"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in create-workflow function:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});