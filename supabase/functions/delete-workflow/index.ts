import { validateUser, corsHeaders } from "../_shared/auth.ts";
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
    const { user, supabase } = await validateUser(req);

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

    // 🔥 PERFORMANCE: Immediate success response
    // Background the n8n deletion and DB cleanup
    const finalizationTask = (async () => {
      try {
        console.log(`[BACKGROUND] Deleting workflow ${workflowId} from n8n...`);
        const delRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
          method: "DELETE",
          headers: { "X-N8N-API-KEY": n8nApiKey },
        });

        if (!delRes.ok) {
          console.error(`[BACKGROUND] n8n delete failed:`, await delRes.text());
        }

        // Cleanup workflow record
        const { error: dbError } = await supabase
          .from("n8n_workflows")
          .delete()
          .eq("n8n_workflow_id", workflowId);

        if (dbError) console.error("[BACKGROUND] n8n_workflows cleanup failed:", dbError);
      } catch (err) {
        console.error("[BACKGROUND] Deletion error:", err.message);
      }
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(finalizationTask);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Deletion initiated in the background",
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
