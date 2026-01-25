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

        // CHECK TRAFFIC (LAST 1 HOUR)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: trafficCount } = await supabase
            .from('processed_events')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneHourAgo);

        // CHECK LAST 1 MINUTE (To see if loop died)
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
        const { count: lastMinCount } = await supabase
            .from('processed_events')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneMinuteAgo);

        return new Response(JSON.stringify({
            last_hour: trafficCount || 0,
            last_minute: lastMinCount || 0,
            status: (lastMinCount || 0) > 50 ? "LOOP_ACTIVE" : "STABLE"
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
