import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { username } = await req.json();
    if (!username) return new Response(JSON.stringify({ error: "Missing username" }), { status: 400 });

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY")!;

    console.log(`[DEBUG] Searching workflows for ${username}...`);
    
    // 1. Fetch all workflows
    const workflowsRes = await fetch(`${n8nBaseUrl}/api/v1/workflows?limit=100`, {
      headers: { "X-N8N-API-KEY": n8nApiKey }
    });
    const workflowsData = await workflowsRes.json();
    const workflows = workflowsData.data || [];

    const foundInWorkflows = [];

    // 2. Scan each workflow's JSON
    for (const wf of workflows) {
      // Fetch full workflow details
      const wfRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${wf.id}`, {
        headers: { "X-N8N-API-KEY": n8nApiKey }
      });
      const fullWf = await wfRes.json();
      const wfJson = JSON.stringify(fullWf.nodes);
      
      if (wfJson.toLowerCase().includes(username.toLowerCase())) {
        // Extract credentials used in this workflow
        const credentialsUsed = [];
        for (const node of fullWf.nodes || []) {
          if (node.credentials) {
             for (const [type, cred] of Object.entries(node.credentials)) {
               credentialsUsed.push({ 
                 nodeName: node.name, 
                 type, 
                 id: cred.id || cred, // Handle both object and string formats
                 name: cred.name || ''
               });
             }
          }
        }
        foundInWorkflows.push({ id: wf.id, name: wf.name, credentialsUsed });
      }
    }

    return new Response(JSON.stringify({
      username,
      foundInWorkflows: foundInWorkflows.map(wf => ({
        wfName: wf.name,
        credentials: wf.credentialsUsed
      }))
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
