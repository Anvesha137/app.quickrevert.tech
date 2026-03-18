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

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
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

    // Get query parameters
    const url = new URL(req.url);
    const executionId = url.searchParams.get("executionId");
    const workflowId = url.searchParams.get("workflowId");
    const automationId = url.searchParams.get("automationId");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    // Get n8n credentials
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

    if (!n8nBaseUrl || !n8nApiKey) {
      return new Response(JSON.stringify({ error: "N8N configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If executionId is provided, get specific execution
    if (executionId) {
      const executionResponse = await fetch(`${n8nBaseUrl}/api/v1/executions/${executionId}`, {
        method: "GET",
        headers: {
          "X-N8N-API-KEY": n8nApiKey,
        },
      });

      if (!executionResponse.ok) {
        const errorText = await executionResponse.text();
        return new Response(JSON.stringify({
          error: `Failed to get execution: ${executionResponse.status} ${executionResponse.statusText}`,
          details: errorText,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const execution = await executionResponse.json();
      return new Response(JSON.stringify({
        success: true,
        execution,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's workflows
    let workflowQuery = supabase
      .from("n8n_workflows")
      .select("n8n_workflow_id, automation_id")
      .eq("user_id", user.id);

    // If automationId is provided, filter by it
    if (automationId) {
      workflowQuery = workflowQuery.eq("automation_id", automationId);
    }

    const { data: userWorkflows, error: workflowsError } = await workflowQuery;

    if (workflowsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch user workflows" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userWorkflows || userWorkflows.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        executions: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get executions for user's workflows
    const workflowIds = userWorkflows.map((w) => w.n8n_workflow_id);
    const targetWorkflowId = workflowId && workflowIds.includes(workflowId) ? workflowId : null;

    // Fetch executions from n8n
    // Note: n8n API might require fetching per workflow or using a different endpoint
    // This is a simplified version - adjust based on actual n8n API
    const executions: any[] = [];

    for (const wfId of targetWorkflowId ? [targetWorkflowId] : workflowIds.slice(0, 10)) {
      try {
        const execResponse = await fetch(
          `${n8nBaseUrl}/api/v1/executions?workflowId=${wfId}&limit=${limit}`,
          {
            method: "GET",
            headers: {
              "X-N8N-API-KEY": n8nApiKey,
            },
          }
        );

        if (execResponse.ok) {
          const execData = await execResponse.json();
          if (execData.data) {
            executions.push(...execData.data);
          } else if (Array.isArray(execData)) {
            executions.push(...execData);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch executions for workflow ${wfId}:`, err);
      }
    }

    // Sort by most recent first
    executions.sort((a, b) => {
      const timeA = new Date(a.startedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.startedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return new Response(JSON.stringify({
      success: true,
      executions: executions.slice(0, limit),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in get-executions function:", error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
