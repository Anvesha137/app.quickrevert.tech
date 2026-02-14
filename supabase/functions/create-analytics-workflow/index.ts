
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
        const n8nApiKey = Deno.env.get("N8N_API_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Validate Input
        const body = await req.json();
        const { userId, instagramAccountId } = body;

        if (!userId || !instagramAccountId) {
            throw new Error("Missing required fields: userId, instagramAccountId");
        }

        console.log(`Creating Analytics Workflow for User: ${userId}, IG Account: ${instagramAccountId}`);

        // 2. Use Shared Credential (as requested for all users)
        const credentialId = "hCnOS0fdlwyo2fxv";

        // 3. Fetch Instagram Username (for naming)
        const { data: igAccount, error: igError } = await supabase
            .from("instagram_accounts")
            .select("username")
            .eq("id", instagramAccountId)
            .single();

        if (igError) throw new Error("Failed to fetch IG Account: " + igError.message);
        const username = igAccount.username;

        // 4. Construct Workflow JSON
        const workflowName = `[Analytics] ${username}`;

        const n8nWorkflowJSON = {
            name: workflowName,
            nodes: [
                {
                    "parameters": {
                        "rule": {
                            "interval": [
                                {
                                    "field": "hours",
                                    "hoursInterval": 12
                                }
                            ]
                        }
                    },
                    "id": "schedule-trigger",
                    "name": "Every 12 Hours",
                    "type": "n8n-nodes-base.scheduleTrigger",
                    "typeVersion": 1.2,
                    "position": [-160, -32]
                },
                {
                    "parameters": {
                        "url": "https://graph.instagram.com/me",
                        "authentication": "genericCredentialType",
                        "genericAuthType": "httpHeaderAuth",
                        "sendQuery": true,
                        "queryParameters": {
                            "parameters": [
                                {
                                    "name": "fields",
                                    "value": "followers_count,media_count,username,follows_count"
                                }
                            ]
                        },
                        "options": {}
                    },
                    "type": "n8n-nodes-base.httpRequest",
                    "typeVersion": 4.3,
                    "position": [64, -32],
                    "id": "get-insta-stats",
                    "name": "Get Instagram Stats",
                    "credentials": {
                        "httpHeaderAuth": {
                            "id": credentialId,
                            "name": "insta"
                        }
                    }
                },
                {
                    "parameters": {
                        "method": "PATCH",
                        "url": `${supabaseUrl}/rest/v1/instagram_accounts?id=eq.${instagramAccountId}`,
                        "headers": {
                            "parameters": [
                                {
                                    "name": "apikey",
                                    "value": supabaseServiceKey
                                },
                                {
                                    "name": "Authorization",
                                    "value": `Bearer ${supabaseServiceKey}`
                                },
                                {
                                    "name": "Content-Type",
                                    "value": "application/json"
                                },
                                {
                                    "name": "Prefer",
                                    "value": "return=minimal"
                                }
                            ]
                        },
                        "sendBody": true,
                        "specifyBody": "json",
                        "jsonBody": "={\n  \"followers_count\": {{ $json.followers_count }}\n}",
                        "options": {}
                    },
                    "type": "n8n-nodes-base.httpRequest",
                    "typeVersion": 4.3,
                    "position": [288, -32],
                    "id": "update-supabase",
                    "name": "Update Supabase"
                }
            ],
            connections: {
                "Every 12 Hours": {
                    "main": [
                        [
                            {
                                "node": "Get Instagram Stats",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                },
                "Get Instagram Stats": {
                    "main": [
                        [
                            {
                                "node": "Update Supabase",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                }
            },
            settings: {
                saveExecutionProgress: true,
                timezone: "Asia/Kolkata"
            }
        };

        // 5. Create Workflow in N8N
        const createRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-N8N-API-KEY": n8nApiKey
            },
            body: JSON.stringify(n8nWorkflowJSON)
        });

        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`n8n Create Failed: ${createRes.status} ${errorText}`);
        }

        const n8nResult = await createRes.json();
        console.log("n8n Create Result:", n8nResult);

        // 6. Activate Workflow
        await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, {
            method: "POST",
            headers: { "X-N8N-API-KEY": n8nApiKey }
        });

        // 7. Register in Database
        const { error: dbError } = await supabase.from("n8n_workflows").insert({
            user_id: userId,
            n8n_workflow_id: n8nResult.id,
            n8n_workflow_name: n8nResult.name,
            instagram_account_id: instagramAccountId,
            template: 'analytics_v1',
            webhook_path: null // No webhook for scheduled workflows
        });

        if (dbError) console.error("Database Insert Error:", dbError);

        return new Response(JSON.stringify({
            success: true,
            workflowId: n8nResult.id
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
