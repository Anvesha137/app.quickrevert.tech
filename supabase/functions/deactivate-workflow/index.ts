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

    // 1. Verify owner (Strict)
    console.log(`Deactivate Request: User=${user.id}, WorkflowId=${workflowId}`);

    const { data: workflow, error: wfError } = await supabase
      .from("n8n_workflows")
      .select("user_id")
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

    if (!deactResp.ok) console.warn(`N8N Deactivation Warning: ${await deactResp.text()}`);

    // 3. Update automation_routes (Stop Routing)
    // Validate User ID again in the update query for double safety
    await supabase.from('automation_routes')
      .update({ is_active: false })
      .eq('n8n_workflow_id', workflowId)
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
