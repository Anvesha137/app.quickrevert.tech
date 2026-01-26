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

        const limit = 5;

        // 1. Last 5 Routes
        const { data: routes, error: routeError } = await supabase
            .from('automation_routes')
            .select(`
                id, account_id, event_type, n8n_workflow_id, is_active, created_at
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        // 2. Last 5 Failed Events
        const { data: failures, error: failError } = await supabase
            .from('failed_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        // 3. Last 5 Workflows
        const { data: workflows, error: wfError } = await supabase
            .from('n8n_workflows')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        // 4. Last 5 Instagram Accounts
        const { data: accounts, error: accError } = await supabase
            .from('instagram_accounts')
            .select('id, username, instagram_user_id, user_id')
            .order('created_at', { ascending: false })
            .limit(limit);

        // 5. Last 5 Contacts
        const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .order('last_interaction_at', { ascending: false })
            .limit(limit);

        // 6. Last 5 Automation Activities
        const { data: activities, error: actsError } = await supabase
            .from('automation_activities')
            .select('*')
            .order('created_at', { ascending: false }) // Fixed column name
            .limit(limit);

        return new Response(JSON.stringify({
            routes: routes || routeError,
            failures: failures || failError,
            workflows: workflows || wfError,
            accounts: accounts || accError,
            contacts: contacts || contactsError,
            activities: activities || actsError,
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
