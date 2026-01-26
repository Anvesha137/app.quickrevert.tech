import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
        const n8nApiKey = Deno.env.get("X-N8N-API-KEY")!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get All Active Routes
        const { data: routes } = await supabase
            .from('automation_routes')
            .select('n8n_workflow_id, account_id')
            .eq('is_active', true);

        if (!routes || routes.length === 0) return new Response(JSON.stringify({ msg: "No active routes to sync" }), { headers: corsHeaders });

        const results = [];

        // 2. Iterate and Sync
        for (const route of routes) {
            const wfId = route.n8n_workflow_id;
            try {
                // A. Fetch from n8n
                const res = await fetch(`${n8nBaseUrl}/api/v1/workflows/${wfId}`, {
                    headers: { "X-N8N-API-KEY": n8nApiKey }
                });

                if (!res.ok) {
                    results.push({ id: wfId, status: "Failed to fetch from n8n", code: res.status });
                    continue;
                }
                const n8nWf = await res.json();

                // B. Extract Path
                let n8nPath = null;
                if (n8nWf.nodes) {
                    const webhookNode = n8nWf.nodes.find((n: any) => n.type.includes('webhook') || n.type.includes('Webhook'));
                    if (webhookNode) n8nPath = webhookNode.parameters?.path;
                }

                if (!n8nPath) {
                    results.push({ id: wfId, status: "No Webhook Node found in n8n" });
                    continue;
                }

                // C. Update DB
                const { error: updateError } = await supabase
                    .from('n8n_workflows')
                    .update({ webhook_path: n8nPath })
                    .eq('n8n_workflow_id', wfId);

                if (updateError) {
                    results.push({ id: wfId, status: "DB Update Failed", error: updateError });
                } else {
                    results.push({ id: wfId, status: "Synced", old_path: "overwritten", new_path: n8nPath });
                }

            } catch (e: any) {
                results.push({ id: wfId, status: "Error", error: e.message });
            }
        }

        return new Response(JSON.stringify({
            summary: "Sync Complete",
            details: results
        }, null, 2), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
