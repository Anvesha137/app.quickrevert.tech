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
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // FETCH LATEST WORKFLOW
        const { data: wf, error: wfError } = await supabase
            .from('n8n_workflows')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (wfError) throw wfError;
        if (!wf) return new Response(JSON.stringify({ error: "No workflows found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // CHECK ROUTE
        const { data: r } = await supabase
            .from('automation_routes')
            .select('*')
            .eq('n8n_workflow_id', wf.n8n_workflow_id)
            .maybeSingle();

        let routeStatus = "NOT_FOUND";
        let accountId = null;
        if (r) {
            routeStatus = r.is_active ? "ACTIVE" : "INACTIVE";
            accountId = r.account_id;
        }

        // FETCH 5 MOST RECENT FAILED EVENTS
        const { data: failures } = await supabase
            .from('failed_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        return new Response(JSON.stringify({
            latestWorkflow: {
                id: wf.n8n_workflow_id,
                name: wf.n8n_workflow_name,
                path: wf.webhook_path,
                created_at: wf.created_at
            },
            routeStatus,
            routedAccountId: accountId,
            recentFailures: failures
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
