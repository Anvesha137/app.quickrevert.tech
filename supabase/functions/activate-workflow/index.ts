import { validateUser, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user, supabase } = await validateUser(req);

    const body = await req.json();
    const { workflowId, active } = body; // Support 'active' flag if sent, default to true
    const shouldActivate = active !== false; // Default true

    if (!workflowId) throw new Error("Missing workflowId");

    console.log(`Req: User=${user.id}, Workflow=${workflowId}, Active=${shouldActivate}`);

    // 1. Verify workflow
    const { data: existingWf, error: findError } = await supabase
      .from('n8n_workflows')
      .select('id, user_id, automation_id, instagram_account_id')
      .eq('n8n_workflow_id', workflowId)
      .single();

    if (findError || !existingWf) {
      console.error("Workflow not found", findError);
      throw new Error("Workflow not found in database");
    }

    if (existingWf.user_id !== user.id) throw new Error("Unauthorized");

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

    // 2. FETCH TRIGGER CONFIG & ACTIONS
    let triggerType = 'user_dm';
    let triggerConfig: any = {};
    let automationActions: any[] = [];
    let automationId = existingWf.automation_id;

    if (automationId) {
      const { data: autoData } = await supabase
        .from('automations')
        .select('trigger_type, trigger_config, actions')
        .eq('id', automationId)
        .single();
      if (autoData) {
        triggerType = autoData.trigger_type || 'user_dm';
        triggerConfig = autoData.trigger_config || {};
        automationActions = autoData.actions || [];
      }
    }

    const hasLeadManager = automationActions.some((a: any) => a.type === 'save_lead');
    const specificPosts = triggerConfig.postsType === 'specific' ? (triggerConfig.specificPosts || []) : [];

    // 3. ROUTE MANAGEMENT
    if (shouldActivate) {
      console.log(`Activating routes for workflow: ${workflowId}`);
      const { error: routeError } = await supabase.from('automation_routes')
        .update({ is_active: true })
        .eq('n8n_workflow_id', workflowId)
        .eq('user_id', user.id);

      if (routeError) {
        console.error("Failed to update active routes:", routeError);
      }
    } else {
      console.log(`Deactivating routes for workflow: ${workflowId}`);
      const { error: routeError } = await supabase.from('automation_routes')
        .update({ is_active: false })
        .eq('n8n_workflow_id', workflowId)
        .eq('user_id', user.id);

      if (routeError) {
        console.error("Failed to deactivate routes:", routeError);
      }
    }

    // 4. N8N ACTIVATION
    if (!n8nBaseUrl || !n8nApiKey) {
      throw new Error("N8N Configuration missing in secrets");
    }

    const action = shouldActivate ? 'activate' : 'deactivate';
    const baseUrl = n8nBaseUrl.endsWith('/') ? n8nBaseUrl.slice(0, -1) : n8nBaseUrl;
    const finalUrl = `${baseUrl}/api/v1/workflows/${workflowId}/${action}`;
    
    console.log(`n8n ${action}: ${finalUrl}`);
    const n8nRes = await fetch(finalUrl, {
      method: "POST",
      headers: { 
        "X-N8N-API-KEY": n8nApiKey,
        "Content-Type": "application/json"
      }
    });

    if (!n8nRes.ok) {
      const errorText = await n8nRes.text();
      console.error(`n8n ${action} failed:`, {
        status: n8nRes.status,
        statusText: n8nRes.statusText,
        body: errorText
      });
      throw new Error(`n8n ${action} failed: ${errorText || n8nRes.statusText}`);
    }

    // 5. Update Statuses
    console.log(`Syncing database status for workflow: ${workflowId} to ${shouldActivate}`);
    await supabase.from('n8n_workflows').update({ is_active: shouldActivate }).eq('n8n_workflow_id', workflowId);
    if (automationId) {
      const { error: autoError } = await supabase.from('automations').update({ status: shouldActivate ? 'active' : 'inactive' }).eq('id', automationId);
      if (autoError) console.error("Failed to sync automation status:", autoError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      active: shouldActivate,
      message: `Workflow ${shouldActivate ? 'activated' : 'deactivated'} successfully`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(`[Error] activate-workflow:`, err);
    return new Response(JSON.stringify({ 
      error: err.message,
      success: false 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
