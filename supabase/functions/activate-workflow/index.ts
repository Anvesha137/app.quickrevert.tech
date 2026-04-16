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

    // 3. ROUTE & TRACKING MANAGEMENT
    if (shouldActivate) {
      // Fetch ALL active Instagram accounts for this user (for global routing)
      const { data: userAccounts } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      const accountIds = (userAccounts || []).map(a => a.id);
      
      const globalRoutes = [];
      const trackedPosts = [];

      for (const accId of accountIds) {
        if (triggerType === 'post_comment') {
          globalRoutes.push({ account_id: accId, event_type: 'changes', sub_type: 'comments', is_active: true });
          globalRoutes.push({ account_id: accId, event_type: 'messaging', sub_type: 'postback', is_active: true });
          if (hasLeadManager) {
            globalRoutes.push({ account_id: accId, event_type: 'messaging', sub_type: null, is_active: true });
          }
        } else if (triggerType === 'story_reply') {
          globalRoutes.push({ account_id: accId, event_type: 'messaging', sub_type: null, is_active: true });
        } else {
          globalRoutes.push({ account_id: accId, event_type: 'messaging', sub_type: null, is_active: true });
          globalRoutes.push({ account_id: accId, event_type: 'messaging', sub_type: 'postback', is_active: true });
        }
      }

      // Populate tracked_posts if specific media is selected
      if (triggerType === 'post_comment' && specificPosts.length > 0) {
        for (const mediaId of specificPosts) {
          trackedPosts.push({ platform: 'instagram', media_id: mediaId });
        }
      }

      console.log(`Registering automation: ${workflowId}. Accounts: ${accountIds.length}, Tracked posts: ${trackedPosts.length}`);

      // ATOMIC REGISTRATION via RPC
      const { error: rpcError } = await supabase.rpc('register_automation', {
        p_user_id: user.id,
        p_n8n_id: workflowId,
        p_n8n_name: 'Workflow ' + workflowId,
        p_webhook_path: '', // For existing workflows, path is already in DB or not needed for execute
        p_instagram_account_id: existingWf.instagram_account_id,
        p_template: '',
        p_variables: {},
        p_automation_id: automationId,
        p_global_routes: globalRoutes,
        p_tracked_posts: trackedPosts
      });

      if (rpcError) {
        console.error("RPC Registration Error:", rpcError);
        throw new Error(`Failed to update automation routes: ${rpcError.message}`);
      }
    } else {
      // DEACTIVATE: Clean up routes and tracking
      await supabase.from('automation_routes').delete().eq('n8n_workflow_id', workflowId);
      await supabase.from('tracked_posts').delete().eq('workflow_id', workflowId);
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
      headers: { "X-N8N-API-KEY": n8nApiKey }
    });

    if (!n8nRes.ok) {
      const errorText = await n8nRes.text();
      throw new Error(`n8n ${action} failed: ${errorText || n8nRes.statusText}`);
    }

    // 5. Update Statuses
    await supabase.from('n8n_workflows').update({ is_active: shouldActivate }).eq('n8n_workflow_id', workflowId);
    if (automationId) {
      await supabase.from('automations').update({ status: shouldActivate ? 'active' : 'inactive' }).eq('id', automationId);
    }

    return new Response(JSON.stringify({ success: true, active: shouldActivate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

    return new Response(JSON.stringify({ success: true, active: shouldActivate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
