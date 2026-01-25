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

    // 1. Verify workflow & Ownership
    // FETCH instagram_account_id FROM n8n_workflows (Source of Truth)
    const { data: existingWf, error: findError } = await supabase
      .from('n8n_workflows')
      .select('id, user_id, automation_id, instagram_account_id')
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

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrl || !n8nApiKey) throw new Error("N8N Config missing");

    // 2. Register Route in automation_routes (Non-Blocking)
    try {
      let automationsData = null;
      if (existingWf.automation_id) {
        const { data: autoData, error: autoError } = await supabase
          .from('automations')
          .select('trigger_type') // Only trigger_type
          .eq('id', existingWf.automation_id)
          .single();

        if (autoError || !autoData) {
          console.warn(`Associated automation lookup failed for ID ${existingWf.automation_id}:`, autoError);
        } else {
          automationsData = autoData;
        }
      }

      // We need Account ID (from n8n_workflows) and Trigger Type (from automations)
      if (existingWf.instagram_account_id) {

        // Fetch IG Account ID Scoped
        const { data: igAccount } = await supabase
          .from('instagram_accounts')
          .select('instagram_user_id')
          .eq('id', existingWf.instagram_account_id)
          .single();

        if (igAccount) {
          let eventType = 'messaging';
          let subType = null;
          const triggerType = automationsData?.trigger_type || 'user_dm'; // Default to DM if missing

          if (triggerType === 'dm_keyword' || triggerType === 'user_dm' || triggerType === 'dm' || triggerType === 'user_directed_messages') {
            eventType = 'messaging';
            subType = 'message';
          } else if (triggerType === 'comments') {
            eventType = 'changes';
            subType = 'comments';
          } else if (triggerType === 'story_reply') {
            eventType = 'messaging';
            subType = 'message';
          } else {
            // Fallback for unknown types
            eventType = 'messaging';
            subType = 'message';
            console.warn(`Unknown trigger type ${triggerType}, defaulting to messaging/message`);
          }

          // Upsert Route (Using Delete+Insert to handle schema constraints)
          const { error: deleteError } = await supabase
            .from('automation_routes')
            .delete()
            .eq('workflow_ref', workflowId);

          if (deleteError) console.error("Error clearing old route:", deleteError);

          const { error: insertError } = await supabase.from('automation_routes').insert({
            account_id: igAccount.instagram_user_id,
            event_type: eventType,
            sub_type: subType,
            workflow_ref: workflowId,
            is_active: true
          });

          if (insertError) {
            console.error("Error inserting route:", insertError);
          } else {
            console.log(`Route registered: ${workflowId} (${eventType}/${subType})`);
          }
        } else {
          console.warn(`Instagram Account record not found for ID: ${existingWf.instagram_account_id}`);
        }
      } else {
        console.warn(`Workflow record missing instagram_account_id. Routing skipped.`);
      }
    } catch (routeError) {
      console.error("Non-fatal error registering route:", routeError);
      // Continue to n8n activation
    }

    // 3. Activate in n8n
    try {
      const activateResp = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
      });

      if (!activateResp.ok) {
        console.error(`N8N Activation Failed: ${await activateResp.text()}`);
        throw new Error("Failed to activate workflow in n8n");
      }
    } catch (e) {
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
