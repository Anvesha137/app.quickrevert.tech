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

        // 1. Fetch trigger_type for the target automation
        const targetWfPath = 'instagram-webhook-4d45ae4f-2036-444b-8753-4d4ca1b99ee5-7175f282-dc03-4960-b039-ced5d8ec78af';
        const { data: wf } = await supabase.from('n8n_workflows').select('automation_id').eq('webhook_path', targetWfPath).maybeSingle();
        let triggerType = null;
        if (wf?.automation_id) {
            const { data: auto } = await supabase.from('automations').select('trigger_type').eq('id', wf.automation_id).maybeSingle();
            triggerType = auto?.trigger_type;
        }

        // 2. Fetch schema info (hard to do via PostgREST, so we try to insert a dummy route with null subtype and see error)
        // We can't easily check information_schema via client.
        // Instead we will just try to select * from automation_routes limit 1 and see if any existing have null subtype.
        const { data: routes } = await supabase.from('automation_routes').select('sub_type').limit(10);


        return new Response(JSON.stringify({
            triggerType,
            routesSample: routes
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
