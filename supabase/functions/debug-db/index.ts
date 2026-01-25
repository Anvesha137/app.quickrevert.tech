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
        const WORKFLOW_ID = "pyJre9NR0QzGz7rl";

        // 1. Fetch Workflow JSON from n8n
        const res = await fetch(`${n8nBaseUrl}/api/v1/workflows/${WORKFLOW_ID}`, {
            headers: { "X-N8N-API-KEY": n8nApiKey }
        });

        if (!res.ok) throw new Error(`n8n API Error: ${res.status}`);
        const n8nWf = await res.json();

        // 2. Extract Webhook Path
        let userPath = null;
        if (n8nWf && n8nWf.nodes) {
            const webhookNode = n8nWf.nodes.find((n: any) => n.type.includes('webhook'));
            if (webhookNode) {
                userPath = webhookNode.parameters?.path;
            }
        }

        if (!userPath) throw new Error("Could not find Webhook Path in n8n workflow. Is the node present?");

        // 3. Find Correct User & Account
        const { data: acc } = await supabase.from('instagram_accounts').select('user_id, id, instagram_user_id').eq('status', 'active').limit(1).single();
        if (!acc) throw new Error("No active account");

        // 4. Update DB to match User's Path
        const { error: wfError } = await supabase.from('n8n_workflows').upsert({
            user_id: acc.user_id,
            n8n_workflow_id: WORKFLOW_ID,
            n8n_workflow_name: n8nWf.name,
            webhook_path: userPath, // <--- SYNC WITH USER
            instagram_account_id: acc.id,
            template: 'manual_sync',
            variables: {}
        }, { onConflict: 'n8n_workflow_id' });

        if (wfError) throw wfError;

        // 5. Restore Route
        await supabase.from('automation_routes').delete().eq('n8n_workflow_id', WORKFLOW_ID);

        const { error: routeError } = await supabase.from('automation_routes').insert({
            user_id: acc.user_id,
            account_id: acc.instagram_user_id,
            event_type: 'messaging',
            sub_type: null,
            n8n_workflow_id: WORKFLOW_ID,
            is_active: true
        });

        if (routeError) throw routeError;

        return new Response(JSON.stringify({
            success: true,
            msg: `Synced! Connected Router to User Path: ${userPath}`,
            path: userPath
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
