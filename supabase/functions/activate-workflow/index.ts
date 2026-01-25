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

    const { workflowId } = await req.json();
    if (!workflowId) throw new Error("Missing workflowId");

    console.log(`Activate Request: User=${user.id}, WorkflowId=${workflowId}`);

    // 1. Verify workflow & Ownership (Strict CHECK separated for debugging)
    const { data: existingWf, error: findError } = await supabase
      .from('n8n_workflows')
      .select('id, user_id, automation_id') // Fetched ID and Automation ID
      .eq('n8n_workflow_id', workflowId)
      .single();

    if (findError || !existingWf) {
      console.error("Workflow NOT FOUND in n8n_workflows table:", workflowId);
      throw new Error("Workflow not found in database");
    }

    if (existingWf.user_id !== user.id) {
      console.error(`Ownership Mismatch! Workflow Owner: ${existingWf.user_id}, Requestor: ${user.id}`);
      throw new Error("Unauthorized: Workflow belongs to another user");
    }

    // 2. Fetch Automation Details Separately (Avoid Join Issues)
    let automationsData = null;
    if (existingWf.automation_id) {
      const { data: autoData, error: autoError } = await supabase
        .from('automations')
        .select('instagram_account_id, trigger_type')
        .eq('id', existingWf.automation_id)
        .single();

      if (autoError) {
        console.error("Failed to fetch automation details:", autoError);
        // Proceed? Or Fail? Failing is safer as we need routing info.
        throw new Error(`Associated automation not found: ${existingWf.automation_id}`);
      }
      automationsData = autoData;
    } else {
      console.warn("Workflow has no associated automation ID. Routing might fail.");
    }

    // Construct wfDetails object to match existing structure
    const wfDetails = {
      ...existingWf,
      automations: automationsData
    };

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrl || !n8nApiKey) throw new Error("N8N Config missing");

    // 2. Register Route in automation_routes (DB FIRST - Source of Truth)
    if (wfDetails.automations) {
      // Fetch IG Account ID
      const { data: igAccount } = await supabase
        .from('instagram_accounts')
        .select('instagram_user_id')
        .eq('id', wfDetails.automations.instagram_account_id)
        .single();

      if (igAccount) {
        let eventType = 'messaging';
        let subType = null;

        const triggerType = wfDetails.automations.trigger_type;

        if (triggerType === 'dm_keyword') {
          eventType = 'messaging';
          subType = 'message';
        } else if (triggerType === 'comments') {
          eventType = 'changes';
          subType = 'comments';
        } else if (triggerType === 'story_reply') {
          eventType = 'messaging';
          subType = 'message';
        }

        // Upsert Route
        await supabase.from('automation_routes').upsert({
          user_id: user.id,
          account_id: igAccount.instagram_user_id,
          event_type: eventType,
          sub_type: subType,
          n8n_workflow_id: workflowId,
          is_active: true
        }, { onConflict: 'n8n_workflow_id' });

        console.log(`Route registered: ${workflowId} (${eventType}/${subType})`);
      }
    }

    // 3. Activate in n8n (Execution Logic)
    // If this fails, the route exists but execution might fail.
    // This is preferable to "Execution active but no route".
    try {
      const activateResp = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
      });

      if (!activateResp.ok) {
        console.error(`N8N Activation Failed: ${await activateResp.text()}`);
        // Optional: Rollback DB route here? 
        // For now, we prefer keeping the route active and logging error.
        // In a stricter system, we might delete the route.
        throw new Error("Failed to activate workflow in n8n");
      }
    } catch (e) {
      // Attempt rollback if n8n fails?
      // await supabase.from('automation_routes').delete().eq('n8n_workflow_id', workflowId);
      // Throwing error to frontend
      throw e;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
