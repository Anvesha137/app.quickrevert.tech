import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) throw new Error("Unauthorized");

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

    // 2. ROUTE MANAGEMENT - FIXED: Create routes for ALL user's Instagram accounts
    // This ensures scalability - works for any user with any number of accounts

    // Fetch ALL Instagram accounts for this user
    const { data: userAccounts, error: accountsError } = await supabase
      .from('instagram_accounts')
      .select('id, username, instagram_user_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (accountsError) {
      console.error("Error fetching user accounts:", accountsError);
    }

    const accountMappings = userAccounts || [];
    console.log(`Found ${accountMappings.length} active Instagram accounts for user`);

    if (shouldActivate) {
      // ACTIVATE:
      // A. Clean up Previous Versions
      const { error: delError } = await supabase
        .from('automation_routes')
        .delete()
        .eq('n8n_workflow_id', workflowId);

      if (delError) console.error("Cleanup Error:", delError);

      // B. INSERT ROUTES (Messaging + Comments) FOR ALL User's Accounts
      const newRoutes = [];
      for (const account of accountMappings) {
        newRoutes.push({
          account_id: account.id,
          user_id: user.id,
          n8n_workflow_id: workflowId,
          event_type: 'messaging',
          sub_type: 'message',
          is_active: true
        });
        newRoutes.push({
          account_id: account.id,
          user_id: user.id,
          n8n_workflow_id: workflowId,
          event_type: 'changes',
          sub_type: null,
          is_active: true
        });
      }

      if (newRoutes.length > 0) {
        const { error: insError } = await supabase
          .from('automation_routes')
          .insert(newRoutes);

        if (insError) console.error("Insert Error:", insError);
        else console.log(`✅ Routes created for ${accountMappings.length} accounts`);
      } else {
        console.log("⚠️ No active Instagram accounts found - no routes created");
      }

    } else {
      // DEACTIVATE
      const { error: delError } = await supabase
        .from('automation_routes')
        .delete()
        .eq('n8n_workflow_id', workflowId);

      if (delError) console.error("Deactivation Error:", delError);
      else console.log("Routes deactivated");
    }

    // 3. N8N ACTIVATION
    if (n8nBaseUrl && n8nApiKey) {
      const action = shouldActivate ? 'activate' : 'deactivate';
      try {
        await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/${action}`, {
          method: "POST",
          headers: { "X-N8N-API-KEY": n8nApiKey }
        });
      } catch (e) {
        console.error(`n8n ${action} failed`, e);
        // Don't fail the request if n8n is down, routing is what matters
      }
    }

    // 4. CRITICAL: Update is_active in n8n_workflows table
    // This ensures execute-automation and other systems see the workflow as active
    const { error: updateError } = await supabase
      .from('n8n_workflows')
      .update({ is_active: shouldActivate })
      .eq('n8n_workflow_id', workflowId);

    if (updateError) {
      console.error('Failed to update workflow is_active status:', updateError);
    } else {
      console.log(`✅ Workflow ${workflowId} is_active set to ${shouldActivate}`);
    }

    return new Response(JSON.stringify({ success: true, active: shouldActivate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
