import { validateUser, corsHeaders } from "../_shared/auth.ts";
import { sendAlert } from "../_shared/alert.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user, supabase } = await validateUser(req);

    const body = await req.json();
    const { workflowId } = body;

    if (!workflowId) {
      return new Response(JSON.stringify({ error: "Missing workflowId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Delete Request: User=${user.id}, WorkflowId=${workflowId}`);

    // 1. Verify workflow belongs to user
    const { data: workflow, error: workflowError } = await supabase
      .from("n8n_workflows")
      .select("n8n_workflow_id, user_id, automation_id")
      .eq("n8n_workflow_id", workflowId)
      .eq("user_id", user.id)
      .single();

    if (workflowError) console.error("Delete Lookup Error:", workflowError);

    if (workflowError || !workflow) {
      return new Response(JSON.stringify({ error: "Workflow not found or unauthorized" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Get n8n credentials
    const n8nBaseUrlRaw = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

    if (!n8nBaseUrlRaw || !n8nApiKey) {
      return new Response(JSON.stringify({ error: "N8N configuration missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const n8nBaseUrl = n8nBaseUrlRaw.endsWith('/') ? n8nBaseUrlRaw.slice(0, -1) : n8nBaseUrlRaw;

    // 3. Delete from n8n SYNCHRONOUSLY (not background — Supabase kills background tasks!)
    console.log(`Deleting workflow ${workflowId} from n8n...`);
    const delRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      method: "DELETE",
      headers: { "X-N8N-API-KEY": n8nApiKey },
    });

    if (!delRes.ok) {
      const errText = await delRes.text();
      console.error(`n8n delete failed (${delRes.status}):`, errText);
      sendAlert({
        level: "warning",
        subject: "Workflow Delete Failed in n8n",
        context: "delete-workflow",
        details: `n8n returned ${delRes.status} when trying to delete workflow ${workflowId}.\nDB records were cleaned up but the workflow may still exist in n8n.`,
        data: { workflowId, userId: user.id, n8nStatus: delRes.status, n8nResponse: errText }
      }).catch(() => {});
      // Continue anyway to cleanup DB — stale n8n workflows are better than stale DB
    } else {
      console.log(`✅ Successfully deleted workflow ${workflowId} from n8n`);
    }

    // 4. Cleanup DB records SYNCHRONOUSLY
    const { error: routeErr } = await supabase.from("automation_routes").delete().eq("n8n_workflow_id", workflowId);
    if (routeErr) console.error("Failed to delete routes:", routeErr);

    const { error: postsErr } = await supabase.from("tracked_posts").delete().eq("workflow_id", workflowId);
    if (postsErr) console.error("Failed to delete tracked_posts:", postsErr);

    const { error: dbError } = await supabase.from("n8n_workflows").delete().eq("n8n_workflow_id", workflowId);
    if (dbError) console.error("n8n_workflows cleanup failed:", dbError);

    // 5. Update automation status if linked
    if (workflow.automation_id) {
      const { error: autoErr } = await supabase.from("automations").update({ status: 'inactive' }).eq("id", workflow.automation_id);
      if (autoErr) console.error("Failed to update automation status:", autoErr);
    }

    return new Response(JSON.stringify({ success: true, message: "Workflow deleted successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in delete-workflow function:", error);
    sendAlert({
      level: "error",
      subject: "Workflow Delete Function Crashed",
      context: "delete-workflow",
      details: `The delete-workflow function threw an unhandled error.\nError: ${error.message}`,
      data: { error: error.message }
    }).catch(() => {});
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
