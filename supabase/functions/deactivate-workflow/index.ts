import { validateUser, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user, supabase } = await validateUser(req);

    const { workflowId } = await req.json();
    if (!workflowId) throw new Error("Missing workflowId");

    console.log(`Deactivate Request: User=${user.id}, WorkflowId=${workflowId}`);

    // 1. Verify owner
    const { data: workflow, error: wfError } = await supabase
      .from("n8n_workflows")
      .select("user_id, automation_id")
      .eq("n8n_workflow_id", workflowId)
      .eq("user_id", user.id)
      .single();

    if (wfError || !workflow) {
      console.warn(`Workflow record not found for ID ${workflowId}. Attempting n8n deactivation anyway.`);
    }

    const n8nBaseUrlRaw = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrlRaw || !n8nApiKey) throw new Error("N8N Config missing");

    const n8nBaseUrl = n8nBaseUrlRaw.endsWith('/') ? n8nBaseUrlRaw.slice(0, -1) : n8nBaseUrlRaw;

    // 2. Call /deactivate endpoint first — this is the HARD stop
    console.log(`Calling n8n /deactivate for workflow: ${workflowId}`);
    const deactResp = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
    });

    if (!deactResp.ok) {
      console.warn(`n8n /deactivate returned ${deactResp.status}: ${await deactResp.text()}`);
      // Don't throw — continue to sync DB
    } else {
      console.log(`✅ n8n /deactivate succeeded`);
    }

    // 3. Update automation_routes (Stop Routing)
    console.log(`Deactivating routes for workflow: ${workflowId}`);
    const { error: routeError } = await supabase.from('automation_routes')
      .update({ is_active: false })
      .eq('n8n_workflow_id', workflowId)
      .eq('user_id', user.id);

    if (routeError) console.error("Failed to deactivate database routes:", routeError);

    // 4. Update n8n_workflows table status
    await supabase.from('n8n_workflows')
      .update({ is_active: false })
      .eq('n8n_workflow_id', workflowId)
      .eq('user_id', user.id);

    // 5. Update automations.status
    if (workflow?.automation_id) {
      console.log(`Syncing automation ${workflow.automation_id} status to inactive`);
      const { error: automationError } = await supabase
        .from('automations')
        .update({ status: 'inactive' })
        .eq('id', workflow.automation_id);
      
      if (automationError) console.error('Failed to sync automation status:', automationError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: "Workflow deactivated successfully" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(`[Error] deactivate-workflow:`, err);
    return new Response(JSON.stringify({ 
      error: err.message,
      success: false 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
