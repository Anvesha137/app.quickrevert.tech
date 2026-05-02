import { validateUser, corsHeaders } from "../_shared/auth.ts";
import { sendAlert } from "../_shared/alert.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user, supabase } = await validateUser(req);

    const body = await req.json();
    const { workflowId, active } = body;
    const shouldActivate = active !== false; // Default true

    if (!workflowId) throw new Error("Missing workflowId");
    console.log(`Req: User=${user.id}, Workflow=${workflowId}, Active=${shouldActivate}`);

    // 1. Verify workflow & get instagram_account_id
    const { data: existingWf, error: findError } = await supabase
      .from('n8n_workflows')
      .select('id, user_id, automation_id, instagram_account_id')
      .eq('n8n_workflow_id', workflowId)
      .single();

    if (findError || !existingWf) throw new Error("Workflow not found in database");
    if (existingWf.user_id !== user.id) throw new Error("Unauthorized");

    const n8nBaseUrlRaw = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrlRaw || !n8nApiKey) throw new Error("N8N Config missing");
    const baseUrl = n8nBaseUrlRaw.endsWith('/') ? n8nBaseUrlRaw.slice(0, -1) : n8nBaseUrlRaw;

    // 2. Get automation config to rebuild routes correctly
    let triggerType = 'user_dm';
    let triggerConfig: any = {};
    const automationId = existingWf.automation_id;

    if (automationId) {
      const { data: autoData } = await supabase
        .from('automations')
        .select('trigger_type, trigger_config')
        .eq('id', automationId)
        .single();
      if (autoData) {
        triggerType = autoData.trigger_type || 'user_dm';
        triggerConfig = autoData.trigger_config || {};
      }
    }

    // 3. Get the Meta Instagram Business ID from the instagram account
    const { data: igAccount } = await supabase
      .from('instagram_accounts')
      .select('instagram_business_id')
      .eq('id', existingWf.instagram_account_id)
      .single();

    const metaAccountId = igAccount ? String(igAccount.instagram_business_id) : null;
    console.log(`[ROUTES] Meta account ID: ${metaAccountId}, trigger: ${triggerType}`);

    // 4. ROUTE MANAGEMENT
    if (shouldActivate) {
      // Try updating existing routes first
      const { data: updatedRoutes, error: updateErr } = await supabase
        .from('automation_routes')
        .update({ is_active: true })
        .eq('n8n_workflow_id', workflowId)
        .eq('user_id', user.id)
        .select();

      if (updateErr) console.error("Failed to update routes:", updateErr);

      // If no routes exist (were never created due to RPC bug), INSERT them now
      const routeCount = updatedRoutes?.length || 0;
      console.log(`[ROUTES] Updated ${routeCount} existing routes`);

      if (routeCount === 0 && metaAccountId) {
        console.log(`[ROUTES] No existing routes found — rebuilding from scratch`);

        const isSpecificPosts = triggerConfig.postsType === 'specific';
        const routesToInsert: any[] = [];

        if (triggerType === 'post_comment') {
          if (!isSpecificPosts) {
            routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'changes', sub_type: 'comments', is_active: true });
          }
          routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'messaging', sub_type: 'postback', is_active: true });
          routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'messaging', sub_type: null, is_active: true });
        } else if (triggerType === 'story_reply') {
          routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'messaging', sub_type: null, is_active: true });
        } else {
          routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'messaging', sub_type: null, is_active: true });
          routesToInsert.push({ account_id: metaAccountId, user_id: user.id, n8n_workflow_id: workflowId, event_type: 'messaging', sub_type: 'postback', is_active: true });
        }

        if (routesToInsert.length > 0) {
          const { error: insertErr } = await supabase.from('automation_routes').insert(routesToInsert);
          if (insertErr) console.error("[ROUTES] Failed to rebuild routes:", insertErr);
          else console.log(`[ROUTES] ✅ Rebuilt ${routesToInsert.length} routes for ${workflowId}`);
        }
      }
    } else {
      // Deactivating — just update flag
      const { error: routeError } = await supabase.from('automation_routes')
        .update({ is_active: false })
        .eq('n8n_workflow_id', workflowId)
        .eq('user_id', user.id);
      if (routeError) console.error("Failed to deactivate routes:", routeError);
    }

    // 5. Call n8n to activate/deactivate
    const action = shouldActivate ? 'activate' : 'deactivate';
    const finalUrl = `${baseUrl}/api/v1/workflows/${workflowId}/${action}`;
    console.log(`[N8N] Calling ${action}: ${finalUrl}`);

    const n8nRes = await fetch(finalUrl, {
      method: "POST",
      headers: { "X-N8N-API-KEY": n8nApiKey, "Content-Type": "application/json" }
    });

    if (!n8nRes.ok) {
      const n8nErr = await n8nRes.text();
      console.warn(`n8n /${action} returned ${n8nRes.status}: ${n8nErr}`);
      sendAlert({
        level: "error",
        subject: `Workflow ${shouldActivate ? 'Activation' : 'Deactivation'} Failed in n8n`,
        context: "activate-workflow",
        details: `n8n returned ${n8nRes.status} when trying to ${action} workflow ${workflowId}.\nThe DB was updated but n8n may be out of sync.`,
        data: { workflowId, userId: user.id, action, n8nStatus: n8nRes.status, n8nResponse: n8nErr }
      }).catch(() => {});
    } else {
      console.log(`[N8N] ✅ ${action} succeeded`);
    }

    // 6. Sync DB statuses
    await supabase.from('n8n_workflows')
      .update({ is_active: shouldActivate })
      .eq('n8n_workflow_id', workflowId);

    if (automationId) {
      await supabase.from('automations')
        .update({ status: shouldActivate ? 'active' : 'inactive' })
        .eq('id', automationId);
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
    sendAlert({
      level: "error",
      subject: `Workflow ${"activate"} Error`,
      context: "activate-workflow",
      details: `Unhandled error in activate-workflow.\nError: ${err.message}`,
      data: { error: err.message }
    }).catch(() => {});
    return new Response(JSON.stringify({
      error: err.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
