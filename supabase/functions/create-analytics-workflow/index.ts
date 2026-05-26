
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
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
        const n8nApiKey = Deno.env.get("X-N8N-API-KEY")!;
        const internalSecret = Deno.env.get("QUICKREVERT_INTERNAL_SECRET") || "";

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Validate Input
        const body = await req.json();
        const { userId, instagramAccountId } = body;

        if (!userId || !instagramAccountId) {
            throw new Error("Missing required fields: userId, instagramAccountId");
        }

        console.log(`Creating Analytics Workflow for User: ${userId}, IG Account: ${instagramAccountId}`);

        // 3. Fetch Instagram Username (for naming)
        const { data: igAccount, error: igError } = await supabase
            .from("instagram_accounts")
            .select("*")
            .eq("id", instagramAccountId)
            .single();

        if (igError) throw new Error("Failed to fetch IG Account: " + igError.message);
        const username = igAccount.username;

        // 2. Ensure Credential Exists
        const ensureCredential = async () => {
            const credName = `Instagram - ${igAccount.username} (${igAccount.instagram_user_id})`;
            const credType = "facebookGraphApi";
            try {
                const listRes = await fetch(`${n8nBaseUrl}/api/v1/credentials`, { headers: { "X-N8N-API-KEY": n8nApiKey } });
                if (listRes.ok) {
                    const listData = await listRes.json();
                    const existing = listData.data.find((c: any) => c.name === credName);
                    if (existing) {
                        await fetch(`${n8nBaseUrl}/api/v1/credentials/${existing.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
                            body: JSON.stringify({ data: { accessToken: igAccount.access_token } })
                        });
                        return existing.id;
                    }
                }
            } catch (e) {
                console.warn("Cred search failed", e);
            }

            const createRes = await fetch(`${n8nBaseUrl}/api/v1/credentials`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
                body: JSON.stringify({ name: credName, type: credType, data: { accessToken: igAccount.access_token } })
            });

            if (!createRes.ok) throw new Error("Cred creation failed");
            return (await createRes.json()).id;
        };

        const credentialId = await ensureCredential();

        // 4. Construct Workflow JSON
        const workflowName = `[Analytics] ${username}`;
        const webhookPath = `analytics-refresh-${userId}`;
        const webhookUrl = `${n8nBaseUrl}/webhook/${webhookPath}`;

        const n8nWorkflowJSON = {
            name: workflowName,
            nodes: [
                {
                    "parameters": {
                        "httpMethod": "POST",
                        "path": webhookPath,
                        "responseMode": "lastNode",
                        "options": {}
                    },
                    "id": "webhook-node",
                    "name": "Webhook",
                    "type": "n8n-nodes-base.webhook",
                    "typeVersion": 2.1,
                    "position": [-320, -112],
                    "webhookId": `webhook-analytics-${userId}`
                },
                {
                    "parameters": {
                        "url": "https://graph.instagram.com/me",
                        "authentication": "predefinedCredentialType",
                        "nodeCredentialType": "facebookGraphApi",
                        "sendQuery": true,
                        "queryParameters": {
                            "parameters": [
                                {
                                    "name": "fields",
                                    "value": "followers_count,media_count,username,follows_count"
                                }
                            ]
                        },
                        "options": { "timeout": 15000 }
                    },
                    "type": "n8n-nodes-base.httpRequest",
                    "typeVersion": 4.3,
                    "position": [-96, -208],
                    "id": "get-initial-stats",
                    "name": "Get Instagram Stats1",
                    "credentials": {
                        "facebookGraphApi": {
                            "id": credentialId
                        }
                    }
                },
                {
                    "parameters": {
                        "url": "https://graph.instagram.com/me",
                        "authentication": "predefinedCredentialType",
                        "nodeCredentialType": "facebookGraphApi",
                        "sendQuery": true,
                        "queryParameters": {
                            "parameters": [
                                {
                                    "name": "fields",
                                    "value": "followers_count,media_count,username,follows_count"
                                }
                            ]
                        },
                        "options": { "timeout": 15000 }
                    },
                    "type": "n8n-nodes-base.httpRequest",
                    "typeVersion": 4.3,
                    "position": [128, -208],
                    "id": "get-updated-stats",
                    "name": "updated followers",
                    "credentials": {
                        "facebookGraphApi": {
                            "id": credentialId
                        }
                    }
                },
                {
                    "parameters": {
                        "rule": {
                            "interval": [
                                {
                                    "field": "days",
                                    "daysInterval": 2
                                }
                            ]
                        }
                    },
                    "type": "n8n-nodes-base.scheduleTrigger",
                    "typeVersion": 1.3,
                    "position": [-320, -304],
                    "id": "schedule-trigger-node",
                    "name": "Schedule Trigger"
                },
                {
                    "parameters": {
                        "method": "POST",
                        "url": supabaseUrl + "/functions/v1/update-followers",
                        "sendHeaders": true,
                        "headerParameters": {
                            "parameters": [
                                { "name": "x-quickrevert-secret", "value": internalSecret },
                                { "name": "Content-Type", "value": "application/json" }
                            ]
                        },
                        "sendBody": true,
                        "specifyBody": "json",
                        "jsonBody": "={\n  \"id\": \"{{ $json.id }}\",\n  \"username\": \"{{ $json.username }}\",\n  \"followers_count\": {{ $json.followers_count }}\n}",
                        "options": { "timeout": 15000 }
                    },
                    "type": "n8n-nodes-base.httpRequest",
                    "typeVersion": 4.1,
                    "position": [352, -208],
                    "id": "update-followers-webhook",
                    "name": "Update Followers"
                }
            ],
            connections: {
                "Webhook": {
                    "main": [
                        [
                            {
                                "node": "Get Instagram Stats1",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                },
                "Get Instagram Stats1": {
                    "main": [
                        [
                            {
                                "node": "updated followers",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                },
                "updated followers": {
                    "main": [
                        [
                            {
                                "node": "Update Followers",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                },
                "Schedule Trigger": {
                    "main": [
                        [
                            {
                                "node": "Get Instagram Stats1",
                                "type": "main",
                                "index": 0
                            }
                        ]
                    ]
                }
            },
            settings: {
                saveExecutionProgress: true,
                saveDataErrorExecution: "all",
                saveManualExecutions: true,
                executionTimeout: 300,
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

        // 7. Trigger the Webhook to START the process immediately
        // Wait a brief moment to ensure activation propagates
        await new Promise(r => setTimeout(r, 1000));

        // Trigger via Production URL since we activated it
        const triggerRes = await fetch(webhookUrl, {
            method: "POST",
            body: JSON.stringify({ action: "init" })
        });

        console.log(`Webhook Triggered: ${triggerRes.status}`);

        // 8. Register in Database
        const { error: dbError } = await supabase.from("n8n_workflows").insert({
            user_id: userId,
            n8n_workflow_id: n8nResult.id,
            n8n_workflow_name: n8nResult.name,
            instagram_account_id: instagramAccountId,
            template: 'analytics_v2', // version 2
            webhook_path: webhookPath
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
