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
    
    // Get authentication token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    
    // Get Supabase configuration
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client and validate user authentication
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);
    
    // Parse request body
    const body = await req.json();
    const { userId, template, variables, instagramAccountId, workflowName, automationId } = body;
    
    console.log("User ID:", userId);
    console.log("Template:", template);
    console.log("Variables:", variables);
    console.log("Instagram Account ID:", instagramAccountId);
    
    // Validate input and ensure userId matches authenticated user
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure the userId in the request matches the authenticated user
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized: userId does not match authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's Instagram account(s)
    let instagramAccount;
    if (instagramAccountId) {
      // Fetch specific account
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("id", instagramAccountId)
        .eq("user_id", userId)
        .eq("status", "active")
        .single();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Instagram account not found or inactive" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instagramAccount = data;
    } else {
      // Fetch first active account
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: "No active Instagram account found. Please connect an Instagram account first." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instagramAccount = data;
    }

    console.log("Using Instagram account:", instagramAccount.username);

    // Get n8n credentials from environment variables
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    
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
      console.error("X-N8N-API-KEY not configured");
      return new Response(JSON.stringify({ error: "X-N8N-API-KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create workflow name
    const finalWorkflowName = workflowName || `Instagram Automation - ${instagramAccount.username} - ${new Date().toISOString().split('T')[0]}`;
    const webhookPath = `instagram-webhook-${userId}-${automationId || Date.now()}`;
    
    // Helper function to recursively replace placeholders in workflow nodes
    const replacePlaceholders = (obj: any): any => {
      if (typeof obj === "string") {
        return obj
          .replace(/\{\{userId\}\}/g, userId)
          .replace(/\{\{automationId\}\}/g, automationId || "")
          .replace(/\{\{instagramAccessToken\}\}/g, instagramAccount.access_token)
          .replace(/\{\{instagramCredentialId\}\}/g, instagramAccount.instagram_user_id)
          .replace(/\{\{instagramUsername\}\}/g, instagramAccount.username);
      } else if (Array.isArray(obj)) {
        return obj.map(item => replacePlaceholders(item));
      } else if (obj !== null && typeof obj === "object") {
        const result: any = {};
        for (const key in obj) {
          result[key] = replacePlaceholders(obj[key]);
        }
        return result;
      }
      return obj;
    };

    // Create workflow with Instagram credentials embedded
    const workflowTemplate = {
      name: finalWorkflowName,
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
          id: "extract-message-data",
          name: "Extract Message Data",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [320, 300],
          parameters: {
            values: {
              string: [
                {
                  name: "instagramMessage",
                  value: "={{ ($requestBody || $input.first().json).message || $json.text || $json.message || '' }}"
                },
                {
                  name: "instagramUserId",
                  value: "={{ ($requestBody || $input.first().json).sender_id || $json.sender_id || $json.from.id || '' }}"
                },
                {
                  name: "instagramUserName",
                  value: "={{ ($requestBody || $input.first().json).sender_name || $json.sender_name || $json.from.username || '' }}"
                }
              ]
            },
            options: {}
          }
        },
        {
          id: "send-instagram-reply",
          name: "Send Instagram DM Reply",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [540, 300],
          parameters: {
            method: "POST",
            url: "https://graph.instagram.com/v20.0/me/messages",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Authorization",
                  value: `Bearer ${instagramAccount.access_token}`
                },
                {
                  name: "Content-Type",
                  value: "application/json"
                }
              ]
            },
            sendBody: true,
            bodyParameters: {
              parameters: [
                {
                  name: "recipient",
                  value: "={{ {\"id\": $json.instagramUserId} }}"
                },
                {
                  name: "message",
                  value: "={{ {\"text\": \"Hello! Thanks for your message.\"} }}"
                }
              ]
            },
            options: {}
          }
        }
      ],
      connections: {
        "Instagram Webhook": {
          main: [
            [
              {
                node: "Extract Message Data",
                type: "main",
                index: 0
              }
            ]
          ]
        },
        "Extract Message Data": {
          main: [
            [
              {
                node: "Send Instagram DM Reply",
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

    // Replace any placeholders in the workflow
    const finalWorkflow = replacePlaceholders(workflowTemplate);

    // Call n8n API
    console.log("Calling N8N API...");
    const n8nResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey
      },
      body: JSON.stringify(finalWorkflow)
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

    // Store the workflow mapping in Supabase
    try {
      await supabase
        .from("n8n_workflows")
        .insert({
          user_id: userId,
          n8n_workflow_id: n8nResult.id,
          n8n_workflow_name: n8nResult.name,
          webhook_path: webhookPath,
          instagram_account_id: instagramAccount.id,
          created_at: new Date().toISOString()
        });
      
      console.log("Workflow mapping stored in Supabase");
    } catch (dbError) {
      console.error("Failed to store workflow mapping:", dbError);
      // Continue even if database storage fails
    }

    return new Response(JSON.stringify({
      success: true,
      workflowId: n8nResult.id,
      workflowName: n8nResult.name,
      webhookPath: webhookPath,
      webhookUrl: `${n8nBaseUrl}/webhook/${webhookPath}`,
      instagramAccount: {
        id: instagramAccount.id,
        username: instagramAccount.username
      },
      message: `Workflow created successfully with Instagram account @${instagramAccount.username}`
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