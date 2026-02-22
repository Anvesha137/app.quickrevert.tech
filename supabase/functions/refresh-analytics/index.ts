import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 200,
            headers: corsHeaders,
        });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
        const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        if (!n8nBaseUrl || !n8nApiKey) throw new Error("Missing n8n config");

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            throw new Error("Missing authorization header");
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            throw new Error("Invalid user token");
        }

        const { data: analyticsWorkflow, error: wfError } = await supabase
            .from("n8n_workflows")
            .select("n8n_workflow_id")
            .eq("user_id", user.id)
            .like("n8n_workflow_name", "[Analytics]%")
            .limit(1)
            .maybeSingle();

        if (wfError || !analyticsWorkflow) {
            throw new Error("Analytics workflow not found. Please enable it first.");
        }

        // Trigger the manual execution endpoint for this specific workflow in n8n
        const workflowId = analyticsWorkflow.n8n_workflow_id;

        const triggerResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}/run?trigger=manual`, {
            method: 'POST',
            headers: {
                'X-N8N-API-KEY': n8nApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Empty body since it just triggers the flow
        });

        if (!triggerResponse.ok) {
            const errBody = await triggerResponse.text();
            console.error("Failed to trigger n8n manual workflow:", errBody);
            throw new Error(`Failed to trigger analytics refresh in n8n: ${triggerResponse.statusText}`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Analytics refresh triggered successfully via n8n"
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error: any) {
        console.error("Error triggering manual refresh:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Internal server error" }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
