import { validateUser, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user, supabase } = await validateUser(req);

    const { workflowId } = await req.json();
    if (!workflowId) throw new Error("Missing workflowId");

    // 1. Verify owner (Strict)
    console.log(`Deactivate Request: User=${user.id}, WorkflowId=${workflowId}`);

    const { data: workflow, error: wfError } = await supabase
      .from("n8n_workflows")
      .select("user_id, automation_id")
      .eq("n8n_workflow_id", workflowId)
      .eq("user_id", user.id) // STRICT
      .single();

    if (wfError || !workflow) {
      console.warn(`Workflow record not found for ID ${workflowId}. Proceeding with N8N deactivation attempt mostly as cleanup.`);
      // Do NOT throw. We want to stop the n8n execution regardless of DB state.
    }

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrl || !n8nApiKey) throw new Error("N8N Config missing");

    // 2. Deactivate in n8n (Stop Execution)
    const deactResp = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
    });

    if (!deactResp.ok) {
      const errorText = await deactResp.text();
      console.error(`n8n deactivation failed with status ${deactResp.status}:`, errorText);
      throw new Error(`n8n deactivation failed: ${errorText || deactResp.statusText}`);
    }

    // 3. Update automation_routes (Stop Routing)
    // Only update if N8N successfully deactivated to keep state in sync
    const { error: routeError } = await supabase.from('automation_routes')
      .update({ is_active: false })
      .eq('n8n_workflow_id', workflowId)
      .eq('user_id', user.id);

    if (routeError) {
      console.error("Failed to deactivate database routes:", routeError);
      throw new Error(`Database Deactivation Failed: ${routeError.message}`);
    }

    // 4. Update n8n_workflows table status
    const { error: wfUpdateError } = await supabase.from('n8n_workflows')
      .update({ is_active: false })
      .eq('n8n_workflow_id', workflowId)
      .eq('user_id', user.id);

    if (wfUpdateError) {
      console.error("Failed to update n8n_workflow status:", wfUpdateError);
      throw new Error(`Workflow Table Update Failed: ${wfUpdateError.message}`);
    }

    // 5. 🔥 CRITICAL FIX: Update automations.status to trigger active_automations_count sync
    if (workflow.automation_id) {
      console.log(`Syncing automation ${workflow.automation_id} status to inactive`);
      const { error: automationError } = await supabase
        .from('automations')
        .update({ status: 'inactive' })
        .eq('id', workflow.automation_id);
      
      if (automationError) console.error('Failed to sync automation status:', automationError);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
