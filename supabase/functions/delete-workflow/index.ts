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

    // Parse request body
    const body = await req.json();
    const { workflowId } = body;

    if (!workflowId) {
      return new Response(JSON.stringify({ error: "Missing workflowId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify workflow belongs to user
    console.log(`Delete Request: User=${user.id}, WorkflowId=${workflowId}`);

    const { data: workflow, error: workflowError } = await supabase
      .from("n8n_workflows")
      .select("n8n_workflow_id, user_id")
      .eq("n8n_workflow_id", workflowId)
      .eq("user_id", user.id)
      .single();

    if (workflowError) console.error("Delete Lookup Error:", workflowError);

    if (workflowError || !workflow) {
      return new Response(JSON.stringify({ error: "Workflow not found or unauthorized" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get n8n credentials
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

    if (!n8nBaseUrl || !n8nApiKey) {
      return new Response(JSON.stringify({ error: "N8N configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete workflow from n8n
    const deleteResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey,
      },
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error("Failed to delete workflow from n8n:", errorText);
      return new Response(JSON.stringify({
        error: `Failed to delete workflow from n8n: ${deleteResponse.status} ${deleteResponse.statusText}`,
        details: errorText,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete workflow from database
    const { error: dbError } = await supabase
      .from("n8n_workflows")
      .delete()
      .eq("n8n_workflow_id", workflowId)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Failed to delete workflow from database:", dbError);
      // Still return success since n8n deletion worked
      return new Response(JSON.stringify({
        success: true,
        message: "Workflow deleted from n8n, but database cleanup failed",
        warning: dbError.message,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Workflow deleted successfully",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in delete-workflow function:", error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
