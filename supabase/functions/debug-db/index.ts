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

        // COMPREHENSIVE DEBUG 16
        const targetPath = 'instagram-webhook-4d45ae4f-2036-444b-8753-4d4ca1b99ee5-509528fa-0d5b-48b9-a58e-c6fd055e9e7b';

        const { data: wf } = await supabase
            .from('n8n_workflows')
            .select('*')
            .eq('webhook_path', targetPath)
            .maybeSingle();

        let routeStatus = "NOT_FOUND";
        let triggerType = null;
        let accountId = null;

        if (wf) {
            // Check Trigger Type
            if (wf.automation_id) {
                const { data: auto } = await supabase
                    .from('automations')
                    .select('trigger_type')
                    .eq('id', wf.automation_id)
                    .maybeSingle();
                triggerType = auto?.trigger_type;
            }

            // Check Route
            const { data: r } = await supabase
                .from('automation_routes')
                .select('*')
                .eq('n8n_workflow_id', wf.n8n_workflow_id)
                .maybeSingle();

            if (r) {
                routeStatus = r.is_active ? "ACTIVE" : "INACTIVE";
                accountId = r.account_id;
            }
        }

        return new Response(JSON.stringify({
            workflowFound: !!wf,
            triggerType,
            routeStatus,
            routedAccountId: accountId
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
