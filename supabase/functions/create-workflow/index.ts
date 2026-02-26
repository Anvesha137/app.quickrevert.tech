import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    console.log("--- CREATE WORKFLOW FUNCTION INVOKED [VERIFICATION ID: " + Date.now() + "] ---");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY")!;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !n8nBaseUrl || !n8nApiKey) return new Response(JSON.stringify({ error: "Config missing" }), { status: 500 });

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { userId, template, variables, instagramAccountId, workflowName, automationId, autoActivate = false, triggerType: bodyTriggerType } = body;

    let automationData: any = null;
    if (automationId) {
      const { data } = await supabase.from("automations").select("trigger_type, trigger_config, actions").eq("id", automationId).eq("user_id", userId).single();
      if (data) automationData = data;
    }

    if (!userId || userId !== user.id) throw new Error("User mismatch");

    let instagramAccount;
    if (instagramAccountId) {
      const { data, error } = await supabase.from("instagram_accounts").select("*").eq("id", instagramAccountId).eq("status", "active").single();
      if (error || !data) throw new Error("Account not found");
      instagramAccount = data;
    } else {
      const { data, error } = await supabase.from("instagram_accounts").select("*").eq("user_id", userId).eq("status", "active").order("connected_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !data) throw new Error("No active account");
      instagramAccount = data;
    }

    // --- CREDENTIAL MANAGEMENT ---
    const ensureCredential = async () => {
      const credName = `Instagram - ${instagramAccount.username} (${instagramAccount.instagram_user_id})`;
      const credType = "facebookGraphApi";
      try {
        const listRes = await fetch(`${n8nBaseUrl}/api/v1/credentials`, { headers: { "X-N8N-API-KEY": n8nApiKey } });
        if (listRes.ok) {
          const listData = await listRes.json();
          const existing = listData.data.find((c: any) => c.name === credName);
          if (existing) {
            await fetch(`${n8nBaseUrl}/api/v1/credentials/${existing.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey }, body: JSON.stringify({ data: { accessToken: instagramAccount.access_token } }) });
            return existing.id;
          }
        }
      } catch (e) { console.warn("Cred search failed", e); }
      const createRes = await fetch(`${n8nBaseUrl}/api/v1/credentials`, { method: "POST", headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey }, body: JSON.stringify({ name: credName, type: credType, data: { accessToken: instagramAccount.access_token } }) });
      if (!createRes.ok) throw new Error("Cred creation failed");
      return (await createRes.json()).id;
    };
    const credentialId = await ensureCredential();

    const userProvidedName = workflowName || `Instagram Automation - ${new Date().toISOString().split('T')[0]}`;
    const finalWorkflowName = `[${instagramAccount.username}] ${userProvidedName}`;
    // --- CHECK FOR EXISTING WORKFLOW ---
    let existingWorkflowId: string | null = null;
    let existingVibePath: string | null = null;

    if (automationId) {
      const { data: existing } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id, webhook_path')
        .eq('automation_id', automationId)
        .maybeSingle();

      if (existing) {
        existingWorkflowId = existing.n8n_workflow_id;
        existingVibePath = existing.webhook_path;
        console.log(`Found existing workflow for automation ${automationId}: ${existingWorkflowId}`);
      }
    }

    // Reuse path if existing
    const webhookPath = existingVibePath || `instagram-webhook-${userId}-${automationId || Date.now()}`;

    // --- BUILDERS ---
    // --- BUILDERS ---
    const buildWorkflow = () => {

      const triggerType = bodyTriggerType || automationData?.trigger_type || "user_dm";
      const actions = automationData?.actions || [];
      const hasAskToFollow = actions.some((a: any) => a.type === 'send_dm' && a.askToFollow);
      const uniqueId = automationId ? automationId.replace(/-/g, '') : Date.now().toString();

      // 0. Analytics Workflow (Special Case)
      if (bodyTriggerType === 'enable_analytics') {
        const nodes = [
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
              "options": {}
            },
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [-144, 464],
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
              "options": {}
            },
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [80, 464],
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
            "position": [-368, 464],
            "id": "schedule-trigger-node",
            "name": "Schedule Trigger"
          },
          {
            "parameters": {
              "method": "POST",
              "url": `${supabaseUrl}/functions/v1/update-followers`,
              "authentication": "genericCredentialType",
              "genericAuthType": "httpHeaderAuth",
              "sendHeaders": true,
              "headerParameters": {
                "parameters": [
                  {
                    "name": "content-type",
                    "value": "application/json"
                  }
                ]
              },
              "sendBody": true,
              "specifyBody": "json",
              "jsonBody": "={\n  \"id\": \"{{ $json.id }}\",\n  \"username\": \"{{ $json.username }}\",\n  \"followers_count\": {{ $json.followers_count }}\n}\n",
              "options": {}
            },
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [288, 464],
            "id": "update-followers-webhook",
            "name": "HTTP Request",
            "credentials": {
              "httpHeaderAuth": {
                "id": "uhPTiowIMVTOTKGn",
                "name": "supabase anon"
              }
            }
          },
          {
            "parameters": {
              "httpMethod": "POST",
              "path": `analytics-refresh-${userId}`,
              "responseMode": "lastNode",
              "options": {}
            },
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-368, 720],
            "id": "refresh-webhook-node",
            "name": "Webhook",
            "webhookId": `webhook-analytics-${userId}`
          }
        ];

        const connections = {
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
                  "node": "HTTP Request",
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
          },
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
          }
        };

        return { name: `[Analytics] ${instagramAccount.username}`, nodes, connections, settings: { saveExecutionProgress: false, timezone: "Asia/Kolkata" } };
      }

      const nodes: any[] = [];
      let nodeX = -300; // Start closer to center
      const connections: any = {};

      // 1. Webhook (Standard Worker)
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: hasAskToFollow ? [-336, -840] : [nodeX, 300],
        parameters: { httpMethod: "POST", path: webhookPath, responseMode: "onReceived", options: {} },
        webhookId: webhookPath
      });
      nodeX += 250;

      let previousNode = "Worker Webhook";
      let triggerAnchorNode = "Worker Webhook";

      // --- ADVANCED ASK TO FOLLOW: Event Type Switch ---
      if (hasAskToFollow) {
        console.log("--- ACTIVATING ADVANCED ASK TO FOLLOW FLOW (STRICT JSON) ---");

        nodes.push({
          id: "event-type-switch",
          name: "Event Type Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.3,
          position: [-112, -840],
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{ id: "is-comment", leftValue: "={{ $('Worker Webhook').item.json.body.sub_type }}", rightValue: "comments", operator: { type: "string", operation: "equals" } }],
                    combinator: "and"
                  },
                  renameOutput: true, outputKey: "Trigger Event"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{ id: "is-postback", leftValue: "={{ $('Worker Webhook').item.json.body.sub_type }}", rightValue: "postback", operator: { type: "string", operation: "equals" } }],
                    combinator: "and"
                  },
                  renameOutput: true, outputKey: "Button Click"
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });

        connections["Worker Webhook"] = { main: [[{ node: "Event Type Switch", type: "main", index: 0 }]] };

        // Initial Anchor
        let triggerChainAnchor = "Event Type Switch";
        let triggerChainOutputIndex = 0;
        nodeX = -80; // Match user position for Event Type Switch

        const triggerConfig = automationData?.trigger_config || {};

        // 1. Post Filter Switch
        const specificPosts = triggerConfig.postsType === 'specific' ? (triggerConfig.specificPosts || []) : [];
        if (specificPosts.length > 0) {
          const postRules = [{
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: specificPosts.map((id: string, i: number) => ({
                id: `post-${i}`,
                leftValue: "={{ $('Worker Webhook').item.json.body.entry?.[0]?.changes?.[0]?.value?.media?.id || $('Worker Webhook').item.json.body.payload?.value?.media?.id }}",
                rightValue: id,
                operator: { type: "string", operation: "equals" }
              })),
              combinator: "or"
            }
          }];
          nodes.push({
            id: "post-filter-switch", name: "Post Filter Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [112, -944],
            parameters: { rules: { values: postRules }, options: { ignoreCase: true } }
          });
          if (!connections[triggerChainAnchor]) connections[triggerChainAnchor] = { main: [] };
          connections[triggerChainAnchor].main[triggerChainOutputIndex] = [{ node: "Post Filter Switch", type: "main", index: 0 }];
          triggerChainAnchor = "Post Filter Switch";
          triggerChainOutputIndex = 0;
          nodeX += 250;
        }

        // 2. Comment Switch (Keywords)
        const keywords = triggerConfig.commentsType === 'keywords' ? (triggerConfig.keywords || []) : [];
        if (keywords.length > 0) {
          const kwRules = [{
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: keywords.map((k: string, i: number) => ({
                id: `comment-kw-${i}`,
                leftValue: "={{ $('Worker Webhook').item.json.body.entry?.[0]?.changes?.[0]?.value?.text }}",
                rightValue: k,
                operator: { type: "string", operation: "contains" }
              })),
              combinator: "or"
            }
          }];
          nodes.push({
            id: "comment-switch", name: "Comment Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [336, -944], // Match user position
            parameters: { rules: { values: kwRules }, options: { ignoreCase: true } }
          });
          if (!connections[triggerChainAnchor]) connections[triggerChainAnchor] = { main: [] };
          connections[triggerChainAnchor].main[triggerChainOutputIndex] = [{ node: "Comment Switch", type: "main", index: 0 }];
          triggerChainAnchor = "Comment Switch";
          triggerChainOutputIndex = 0;
          nodeX += 250;
        }

        // 3. Loop Protection Switch
        const instagramUsername = instagramAccount.username;
        nodes.push({
          id: "loop-protection-switch", name: "Loop Protection Switch1", type: "n8n-nodes-base.switch", typeVersion: 3.4,
          position: [560, -944], // Match user position
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 3 },
                    conditions: [{ id: "loop-check-1", leftValue: "={{ $('Worker Webhook').item.json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}", rightValue: instagramUsername, operator: { type: "string", operation: "notEquals", name: "filter.operator.notEquals" } }],
                    combinator: "and"
                  }
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 3 },
                    conditions: [{ id: "dummy-condition", leftValue: "", rightValue: "", operator: { type: "string", operation: "equals", name: "filter.operator.equals" } }],
                    combinator: "and"
                  }
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });
        if (!connections[triggerChainAnchor]) connections[triggerChainAnchor] = { main: [] };
        connections[triggerChainAnchor].main[triggerChainOutputIndex] = [{ node: "Loop Protection Switch1", type: "main", index: 0 }];

        // NO manual connection of Event Type Switch index 1/2 here - handled later in Postback generation

        previousNode = "Loop Protection Switch1"; // Anchor for Trigger flow
        triggerAnchorNode = "Loop Protection Switch1";
        nodeX += 600;
      }

      // 1.5 Switch Node Logic (Exclusive for keyword_dm and story_reply)

      const isKeywordTrigger =
        (triggerType === 'user_directed_messages' && automationData?.trigger_config?.messageType === 'keywords') ||
        (triggerType === 'story_reply' && automationData?.trigger_config?.storiesType === 'keywords');

      if (!hasAskToFollow && isKeywordTrigger) {
        const keywords = Array.isArray(automationData?.trigger_config?.keywords)
          ? automationData.trigger_config.keywords
          : [];

        const postbackButtons: any[] = [];
        const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
        if (sendDmAction && sendDmAction.actionButtons) {
          sendDmAction.actionButtons.forEach((b: any) => {
            const btnType = b.action || (b.url ? 'web_url' : 'postback');
            if (btnType === 'postback') {
              postbackButtons.push({
                type: 'postback',
                title: b.text,
                payload: `${b.text}_${uniqueId}`
              });
            }
          });
        }

        const rules: any[] = [];
        const outputTargets: string[] = [];

        keywords.forEach((k: string, index: number) => {
          rules.push({
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: [{
                id: `kw-${index}`,
                leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                rightValue: k,
                operator: { type: "string", operation: "contains" }
              }],
              combinator: "and"
            },
            renameOutput: true,
            outputKey: k
          });
          outputTargets.push("act-send-dm");
        });

        postbackButtons.forEach((b: any, index: number) => {
          rules.push({
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: [{
                id: `pb-${index}`,
                leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].postback.payload }}",
                rightValue: b.payload,
                operator: { type: "string", operation: "equals", name: "filter.operator.equals" }
              }],
              combinator: "and"
            },
            renameOutput: true,
            outputKey: b.title
          });
          outputTargets.push(`act-btn-${index}`);
        });

        nodes.push({
          id: "message-switch", name: "Message Switch",
          type: "n8n-nodes-base.switch", typeVersion: 3.3,
          position: [nodeX, 300],
          parameters: { rules: { values: rules }, options: { ignoreCase: true } }
        });
        nodeX += 400;

        connections[previousNode] = {
          main: [[{ node: "Message Switch", type: "main", index: 0 }]]
        };
        previousNode = "Message Switch";

        if (sendDmAction) {
          const text = sendDmAction.title || "Hello!";
          const subtitle = sendDmAction.subtitle || sendDmAction.messageTemplate || "";
          const imageUrl = sendDmAction.imageUrl || "";
          const hasButtons = sendDmAction.actionButtons && sendDmAction.actionButtons.length > 0;
          const isRichMessage = hasButtons || imageUrl;

          let jsonBody = "";
          if (isRichMessage) {
            const templateButtons: any[] = [];
            if (hasButtons) {
              sendDmAction.actionButtons.forEach((b: any) => {
                const btnType = b.action || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  templateButtons.push({ type: "web_url", url: b.url, title: b.text });
                } else {
                  templateButtons.push({ type: "postback", title: b.text, payload: `${b.text}_${uniqueId}` });
                }
              });
            }

            const messagePayload: any = {
              recipient: { id: `{{ $('Worker Webhook').item.json.body.payload.sender.id }}` },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: text,
                        subtitle: subtitle ? subtitle : "Powered By Quickrevert.tech",
                        image_url: imageUrl || undefined,
                        buttons: templateButtons.length > 0 ? templateButtons.slice(0, 3) : undefined
                      }
                    ]
                  }
                }
              }
            };

            jsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
          } else {
            jsonBody = `={
              "recipient": { "id": "{{ $('Worker Webhook').item.json.body.payload.sender.id }}" },
              "message": { "text": "${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }
            }`;
          }

          nodes.push({
            id: "act-send-dm", name: "Send DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 200],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: jsonBody,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
        }

        postbackButtons.forEach((b: any, index: number) => {
          const linkedAction = actions.find((a: any, i: number) => a.type === 'send_dm' && a.title === b.title && i > 0);
          let btnText = `You selected: ${b.title}`;
          let btnImage = "";
          if (linkedAction) {
            const bodyText = linkedAction.subtitle || linkedAction.messageTemplate || linkedAction.title;
            btnText = bodyText;
            btnImage = linkedAction.imageUrl || "";
          }

          const templateButtons: any[] = [];
          if (linkedAction && linkedAction.actionButtons) {
            linkedAction.actionButtons.forEach((b: any) => {
              const btnType = b.action || (b.url ? 'web_url' : 'postback');
              if (btnType === 'web_url') {
                templateButtons.push({ type: "web_url", url: b.url, title: b.text });
              } else {
                templateButtons.push({ type: "postback", title: b.text, payload: `${b.text}_${uniqueId}` });
              }
            });
          }

          const messagePayload: any = {
            recipient: { id: `{{ $json.body.entry[0].messaging[0].sender.id }}` },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [
                    {
                      title: btnText,
                      subtitle: "Powered By Quickrevert.tech",
                      image_url: btnImage || undefined,
                      buttons: templateButtons.length > 0 ? templateButtons.slice(0, 3) : undefined
                    }
                  ]
                }
              }
            }
          };

          nodes.push({
            id: `act-btn-${index}`, name: `Send DM - ${b.title}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [nodeX, 400 + (index * 150)],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `=${JSON.stringify(messagePayload, null, 2)}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
        });

        connections["Message Switch"] = { main: [] };
        rules.forEach((_, i) => {
          const targetId = outputTargets[i];
          const targetNode = nodes.find(n => n.id === targetId);
          if (targetNode) {
            connections["Message Switch"].main.push([
              { node: targetNode.name, type: "main", index: 0 }
            ]);
          } else {
            connections["Message Switch"].main.push([]);
          }
        });

        return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      // 1.52 Fetch Usernames + Switch (All DMs - user_dm / user_directed_messages with messageType !== 'keywords')
      const isAllDmsTrigger =
        (triggerType === 'user_dm' || triggerType === 'user_directed_messages' || triggerType === 'story_reply') &&
        automationData?.trigger_config?.messageType !== 'keywords' &&
        automationData?.trigger_config?.storiesType !== 'keywords' &&
        !hasAskToFollow;

      if (isAllDmsTrigger) {
        // Fetch Usernames node
        nodes.push({
          id: "fetch-usernames",
          name: "Fetch Usernames",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.3,
          position: [nodeX, 300],
          parameters: {
            url: "https://graph.instagram.com/v24.0/me?fields=id,username",
            authentication: "predefinedCredentialType",
            nodeCredentialType: "facebookGraphApi",
            options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });

        connections[previousNode] = {
          main: [[{ node: "Fetch Usernames", type: "main", index: 0 }]]
        };
        previousNode = "Fetch Usernames";
        nodeX += 250;

        // Switch node: filter out bot messages and message edits
        nodes.push({
          id: "dm-filter-switch",
          name: "Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.4,
          position: [nodeX, 300],
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 3 },
                    conditions: [
                      {
                        id: "sender-not-bot",
                        leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}",
                        rightValue: "={{ $('Fetch Usernames').item.json.id }}",
                        operator: { type: "string", operation: "notEquals" }
                      },
                      {
                        id: "not-a-message-edit",
                        leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].message_edit }}",
                        operator: { type: "object", operation: "notExists" }
                      },
                      ...(triggerType === 'story_reply' ? [{
                        id: "is-story-reply",
                        leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].message.reply_to.story }}",
                        operator: { type: "object", operation: "exists" }
                      }] : [])
                    ],
                    combinator: "and"
                  }
                }
              ]
            },
            options: {}
          }
        });

        connections["Fetch Usernames"] = {
          main: [[{ node: "Switch", type: "main", index: 0 }]]
        };
        previousNode = "Switch";
        nodeX += 250;
      }

      // 1.55 Post Filter Switch
      const isSpecificPostTrigger = triggerType === 'post_comment' && automationData?.trigger_config?.postsType === 'specific';
      if (!hasAskToFollow && isSpecificPostTrigger) {
        const specificPosts = Array.isArray(automationData?.trigger_config?.specificPosts)
          ? automationData.trigger_config.specificPosts
          : [];
        if (specificPosts.length > 0) {
          const conditions = specificPosts.map((id: string, index: number) => ({
            id: `post-${index}`,
            leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.media?.id || $json.body.payload?.value?.media?.id }}",
            rightValue: id,
            operator: { type: "string", operation: "equals" }
          }));
          const rules = [{
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: conditions,
              combinator: "or"
            }
          }];
          nodes.push({
            id: "post-switch", name: "Post Filter Switch",
            type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, 300],
            parameters: { rules: { values: rules }, options: { ignoreCase: true } }
          });

          // Connect from previous anchor
          if (!connections[previousNode]) connections[previousNode] = { main: [] };
          const outputIndex = (previousNode === "Event Type Switch") ? 0 : 0;
          if (!connections[previousNode].main[outputIndex]) connections[previousNode].main[outputIndex] = [];
          connections[previousNode].main[outputIndex].push({ node: "Post Filter Switch", type: "main", index: 0 });

          previousNode = "Post Filter Switch";
          nodeX += 300;
        }
      }

      // 1.56 Story Filter Switch
      const isSpecificStoryTrigger = triggerType === 'story_reply' && (automationData?.trigger_config as any)?.storiesType === 'specific';
      if (!hasAskToFollow && isSpecificStoryTrigger) {
        const specificStories = Array.isArray((automationData?.trigger_config as any)?.specificStories)
          ? (automationData.trigger_config as any).specificStories
          : [];
        if (specificStories.length > 0) {
          const conditions = specificStories.map((id: string, index: number) => ({
            id: `story-${index}`,
            leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].message.reply_to.story.id }}",
            rightValue: id,
            operator: { type: "string", operation: "equals" }
          }));
          const rules = [{
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: conditions,
              combinator: "or"
            }
          }];
          nodes.push({
            id: "story-switch", name: "Story Filter Switch",
            type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, 300],
            parameters: { rules: { values: rules }, options: { ignoreCase: true } }
          });

          // Connect from previous anchor
          if (!connections[previousNode]) connections[previousNode] = { main: [] };
          const outputIndex = 0;
          if (!connections[previousNode].main[outputIndex]) connections[previousNode].main[outputIndex] = [];
          connections[previousNode].main[outputIndex].push({ node: "Story Filter Switch", type: "main", index: 0 });

          previousNode = "Story Filter Switch";
          nodeX += 300;
        }
      }

      // 1.6 Comment Keyword Switch
      const isCommentKeywordTrigger = triggerType === 'post_comment' && automationData?.trigger_config?.commentsType === 'keywords';
      if (!hasAskToFollow && isCommentKeywordTrigger) {
        const keywords = Array.isArray(automationData?.trigger_config?.keywords)
          ? automationData.trigger_config.keywords
          : [];
        const rules: any[] = [];
        keywords.forEach((k: string, index: number) => {
          rules.push({
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: [{
                id: `comment-kw-${index}`,
                leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.text }}",
                rightValue: k,
                operator: { type: "string", operation: "contains" }
              }],
              combinator: "and"
            }
          });
        });
        if (rules.length > 0) {
          nodes.push({
            id: "comment-switch", name: "Comment Switch",
            type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, 300],
            parameters: { rules: { values: rules }, options: { ignoreCase: true } }
          });

          // Connect from previous anchor
          if (!connections[previousNode]) connections[previousNode] = { main: [] };
          const outputIndex = (previousNode === "Event Type Switch") ? 0 : 0;
          if (!connections[previousNode].main[outputIndex]) connections[previousNode].main[outputIndex] = [];

          // Connect ALL keyword outputs to the switch initially (wait, the switch itself is connected TO the next node)
          // We connect previous node TO the Comment Switch
          connections[previousNode].main[outputIndex].push({ node: "Comment Switch", type: "main", index: 0 });

          previousNode = "Comment Switch";
          nodeX += 300;
        }
      }

      // 1.7 Loop Protection Switch (Username-based)
      if (!hasAskToFollow && triggerType === 'post_comment') {
        console.log("--- ADDING USERNAME-BASED LOOP PROTECTION SWITCH ---");
        const instagramUsername = instagramAccount.username;
        console.log("Using Instagram Username for loop protection:", instagramUsername);

        const rules = [
          {
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 3 },
              conditions: [
                {
                  id: "loop-check-1",
                  leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}",
                  rightValue: instagramUsername,
                  operator: { type: "string", operation: "notEquals", name: "filter.operator.notEquals" }
                }
              ],
              combinator: "and"
            }
          },
          {
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 3 },
              conditions: [
                {
                  id: "dummy-condition",
                  leftValue: "",
                  rightValue: "",
                  operator: { type: "string", operation: "equals", name: "filter.operator.equals" }
                }
              ],
              combinator: "and"
            }
          }
        ];

        nodes.push({
          id: "loop-protection-switch", name: "Loop Protection Switch",
          type: "n8n-nodes-base.switch", typeVersion: 3.4,
          position: [nodeX, 304],
          parameters: { rules: { values: rules }, options: { ignoreCase: true } }
        });

        // Connect previous node to loop protection switch
        if (!connections[previousNode]) connections[previousNode] = { main: [] };

        // If the previous node is Comment Switch, we need to connect ALL its keyword outputs to Loop Protection
        if (previousNode === "Comment Switch") {
          const keywordCount = Array.isArray(automationData?.trigger_config?.keywords) ? automationData.trigger_config.keywords.length : 1;
          for (let k = 0; k < keywordCount; k++) {
            if (!connections[previousNode].main[k]) connections[previousNode].main[k] = [];
            connections[previousNode].main[k].push({ node: "Loop Protection Switch", type: "main", index: 0 });
          }
        } else {
          const outputIndex = (previousNode === "Event Type Switch") ? 0 : 0;
          if (!connections[previousNode].main[outputIndex]) connections[previousNode].main[outputIndex] = [];
          connections[previousNode].main[outputIndex].push({ node: "Loop Protection Switch", type: "main", index: 0 });
        }

        previousNode = "Loop Protection Switch";
        nodeX += 300;
      }

      triggerAnchorNode = previousNode; // Snapshot for parallel connections (Reply + Teaser)

      // 2. Actions Generation
      console.log(`--- GENERATING ACTIONS for Trigger: ${triggerType} ---`);
      const postbackActions: any[] = [];

      actions.forEach((action: any, index: number) => {
        let nodeParams: any = {};
        let nodeName = `Action ${index + 1}`;

        let commentIdPath = "";
        let senderIdPath = "";
        let usernamePath = "";

        if (triggerType === 'post_comment') {
          commentIdPath = "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}";
          senderIdPath = "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id }}";
          usernamePath = "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.username }}";
        } else {
          senderIdPath = "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}";
        }

        if (action.type === 'reply_to_comment') {
          const pickerNodeName = `Round Robin Picker ${index + 1}`;
          nodeName = `Reply to Comment ${index + 1}`;

          // 1. Round Robin Picker (n8n Code node)
          const templates = action.replyTemplates && action.replyTemplates.length > 0
            ? action.replyTemplates
            : [action.text || "Thanks!"];

          nodes.push({
            id: `picker-${index}`, name: pickerNodeName, type: "n8n-nodes-base.code", typeVersion: 2,
            position: [850, -1000],
            parameters: {
              jsCode: `// Round Robin Picker
const replies = ${JSON.stringify(templates)};
const username = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.username;

if (typeof $getWorkflowStaticData === 'function') {
  const staticData = $getWorkflowStaticData('global');
  if (staticData.replyIndex === undefined) staticData.replyIndex = 0;
  const index = staticData.replyIndex;
  staticData.replyIndex = (index + 1) % replies.length;
  // User asked for exact snippet logic: replace {username}
  const chosenReply = replies[index].replace('{username}', username).replace('@{username}', '@' + username);
  return [{ json: { chosenReply, index } }];
} else {
  // Fallback if static data not available
  const chosenReply = replies[0].replace('{username}', username).replace('@{username}', '@' + username);
  return [{ json: { chosenReply, index: 0 } }];
}`
            }
          });

          // 2. Reply to Comment (HTTP Request)
          nodes.push({
            id: `act-reply-${index}`, name: nodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [1100, -1000],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/${commentIdPath}/replies`,
              authentication: "predefinedCredentialType",
              nodeCredentialType: "facebookGraphApi",
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  \"message\": \"{{ $json.chosenReply }}\"\n}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // 3. Connect Picker -> Reply
          connections[pickerNodeName] = { main: [[{ node: nodeName, type: "main", index: 0 }]] };

          // 4. Connect Anchor -> Picker (if no teaser)
          const hasTeaser = actions.some((a: any) => a.type === 'send_dm' && a.askToFollow);
          if (!hasTeaser) {
            if (!connections[triggerAnchorNode]) connections[triggerAnchorNode] = { main: [[]] };
            if (!connections[triggerAnchorNode].main[0]) connections[triggerAnchorNode].main[0] = [];
            connections[triggerAnchorNode].main[0].push({ node: pickerNodeName, type: "main", index: 0 });
          }
          return;
        }

        if (action.type === 'send_dm') {
          if (action.askToFollow) {
            const teaserNodeName = `Send Teaser DM`;
            const teaserPayload = {
              recipient: { id: senderIdPath },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: (action.teaserMessage || "Hey there! I'm so happy you're here... Click below and I'll send you the link in"),
                        subtitle: "Powered By Quickrevert.tech",
                        image_url: action.imageUrl || undefined,
                        buttons: [
                          {
                            type: "postback",
                            title: (action.teaserBtnText || "link please "),
                            payload: `SEND_LINK_${uniqueId}`
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            };
            nodes.push({
              id: `teaser-${index}`, name: teaserNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
              position: [1100, -850], // Adjusted position
              parameters: {
                method: "POST",
                url: "https://graph.instagram.com/v24.0/me/messages",
                authentication: "predefinedCredentialType",
                nodeCredentialType: "facebookGraphApi",
                sendBody: true,
                specifyBody: "json",
                jsonBody: `={\n  \"recipient\": {\n    \"comment_id\": \"{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"${(action.teaserMessage || "Hey there! I'm so happy you're here...").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\",\n            \"subtitle\": \"Powered By Quickrevert.tech\",\n            \"buttons\": [\n              {\n                \"type\": \"postback\",\n                \"title\": \"${(action.teaserBtnText || "send link please ").replace(/"/g, '\\"').substring(0, 20)}\",\n                \"payload\": \"SEND_LINK_${uniqueId}\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}`,
                options: {}
              },
              credentials: { facebookGraphApi: { id: credentialId } }
            });

            // 1. Connect Loop Protection to Teaser (Sequential start)
            if (!connections[triggerAnchorNode]) connections[triggerAnchorNode] = { main: [[]] };
            if (!connections[triggerAnchorNode].main[0]) connections[triggerAnchorNode].main[0] = [];
            connections[triggerAnchorNode].main[0].push({ node: teaserNodeName, type: "main", index: 0 });

            // 2. Connect Teaser to Picker -> Reply (Sequential chain)
            const replyActionIndex = actions.findIndex((a: any) => a.type === 'reply_to_comment');
            if (replyActionIndex !== -1) {
              connections[teaserNodeName] = { main: [[{ node: `Round Robin Picker ${replyActionIndex + 1}`, type: "main", index: 0 }]] };
            }

            nodeX += 300;
            postbackActions.push({ ...action, index });
            return;
          }
          nodeName = `Send DM ${index + 1}`;
          const recipient = triggerType === 'post_comment' ? { comment_id: "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}" } : { id: senderIdPath };
          const hasButtons = action.actionButtons && action.actionButtons.length > 0;
          const hasImage = !!action.imageUrl;

          let messagePayload: any;
          if (hasButtons || hasImage) {
            // Build generic template with buttons
            const templateButtons: any[] = [];
            if (hasButtons) {
              action.actionButtons.slice(0, 3).forEach((b: any) => {
                const btnType = b.buttonType || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  templateButtons.push({ type: "web_url", url: b.url, title: (b.text || "Open") });
                } else {
                  templateButtons.push({ type: "postback", title: (b.text || "Click"), payload: `${b.text || "Click"}_${uniqueId}` });
                }
              });
            }
            const element: any = {
              title: (action.title || "Hi 👋"),
              subtitle: (action.subtitle || "Powered by Quickrevert.tech"),
            };
            if (action.imageUrl) element.image_url = action.imageUrl;
            if (templateButtons.length > 0) element.buttons = templateButtons;

            messagePayload = {
              recipient,
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [element]
                  }
                }
              }
            };
          } else {
            messagePayload = { recipient, message: { text: action.title || "Hello!" } };
          }
          nodeParams = { method: "POST", url: "https://graph.instagram.com/v24.0/me/messages", authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(messagePayload, null, 2)}`, options: {} };
        }

        if (Object.keys(nodeParams).length > 0) {
          nodes.push({
            id: `act-${index}`, name: nodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
            parameters: nodeParams, credentials: { facebookGraphApi: { id: credentialId } }
          });
          if (triggerType === 'post_comment') {
            if (!connections[previousNode]) connections[previousNode] = { main: [[], []] };
            connections[previousNode].main[0].push({ node: nodeName, type: "main", index: 0 });
            nodeX += 300;
          } else {
            if (previousNode) connections[previousNode] = { main: [[{ node: nodeName, type: "main", index: 0 }]] };
            previousNode = nodeName;
            nodeX += 300;
          }
        }
      });

      // --- 3. POSTBACK BRANCH GENERATION (Ask to Follow) ---
      if (postbackActions.length > 0) {
        console.log("--- GENERATING POSTBACK BRANCH ---");
        let postbackNodeX = 400;
        const postbackNodeY = 800; // Separate visual lane

        postbackActions.forEach((action: any, i: number) => {
          const index = action.index; // Original index
          const senderIdForContext = "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}";
          const recipientId = "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}";

          // 3.1 Button Action Switch
          const teaserBtnText = action.teaserBtnText || "Yes, send me link";
          const payloadPath = "={{ $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.postback?.payload || $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.message?.quick_reply?.payload }}";

          const switchRules = [
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "check", leftValue: payloadPath, rightValue: `CHECK_FOLLOW_${uniqueId}`, operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Check Follow"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "send", leftValue: payloadPath, rightValue: `SEND_LINK_${uniqueId}`, operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Send Link"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "qr-check", leftValue: "={{ $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.message?.text }}", rightValue: "send link please ", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "qr"
            }
          ];

          const switchName = `Button Action Switch`; // Match user JSON naming
          nodes.push({
            id: `btn-switch-${index}`, name: switchName, type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [112, -664], // Match user position
            parameters: { rules: { values: switchRules }, options: { ignoreCase: true } }
          });

          // Connect "Event Type Switch" (Index 1: Button Click) to this.
          if (!connections["Event Type Switch"]) connections["Event Type Switch"] = { main: [[], []] };
          if (!connections["Event Type Switch"].main[1]) connections["Event Type Switch"].main[1] = [];
          connections["Event Type Switch"].main[1].push({ node: switchName, type: "main", index: 0 }); // Postback Click (SEND_LINK/CHECK_FOLLOW)

          postbackNodeX += 250;

          // 3.2 Fetch Context
          const fetchName = `Fetch Context`;
          nodes.push({
            id: `fetch-context-${index}`, name: fetchName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [336, -648], // Match user position
            parameters: {
              url: `=https://graph.instagram.com/v24.0/${senderIdForContext}`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendQuery: true, queryParameters: { parameters: [{ name: "fields", value: "id,username,name,follower_count,is_user_follow_business,is_business_follow_user" }] },
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Switch (Check Follow, Send Link, qr) to Fetch Context
          if (!connections[switchName]) connections[switchName] = { main: [[], [], []] };
          connections[switchName].main[0].push({ node: fetchName, type: "main", index: 0 }); // Check Follow
          connections[switchName].main[1].push({ node: fetchName, type: "main", index: 0 }); // Send Link
          connections[switchName].main[2].push({ node: fetchName, type: "main", index: 0 }); // qr

          postbackNodeX += 250;

          // 3.3 Extract Status
          const extractName = `Extract Status`;
          nodes.push({
            id: `extract-status-${index}`, name: extractName, type: "n8n-nodes-base.code", typeVersion: 2,
            position: [560, -648], // Match user position
            parameters: {
              jsCode: `const conversationData = $input.item.json;
const isFollowing = conversationData.is_user_follow_business || false;
const userId = conversationData.id;
const username = conversationData.username || 'user';
return { json: { userId, username, isFollowing } };`
            }
          });
          connections[fetchName] = { main: [[{ node: extractName, type: "main", index: 0 }]] };
          postbackNodeX += 250;

          // 3.4 Is Following?
          const ifName = `Is Following?`;
          nodes.push({
            id: `is-following-${index}`, name: ifName, type: "n8n-nodes-base.if", typeVersion: 2.1,
            position: [784, -648], // Match user position
            parameters: {
              conditions: {
                options: { caseSensitive: true, leftValue: "" },
                conditions: [{ id: "if-check", leftValue: "={{ $json.isFollowing }}", rightValue: true, operator: { type: "boolean", operation: "true" } }],
                combinator: "and"
              }
            }
          });
          connections[extractName] = { main: [[{ node: ifName, type: "main", index: 0 }]] };
          postbackNodeX += 250;

          // 3.5 REWARD (True Branch) - Use Generic Template
          const rewardButtons: any[] = [];
          if (action.actionButtons && action.actionButtons.length > 0) {
            action.actionButtons.slice(0, 3).forEach((b: any) => {
              rewardButtons.push({
                type: "web_url",
                url: (b.url || "https://quickrevert.tech").replace(/"/g, '\\"'),
                title: (b.text || "link").replace(/"/g, '\\"').substring(0, 20)
              });
            });
          } else {
            rewardButtons.push({
              type: "web_url",
              url: "https://quickrevert.tech",
              title: "link"
            });
          }

          const rewardName = `Send Reward 2`; // Match user JSON naming
          nodes.push({
            id: `act-reward-${index}`, name: rewardName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [1400, -700], // Adjusted position
            parameters: {
              method: "POST",
              url: `https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType",
              nodeCredentialType: "facebookGraphApi",
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  \"recipient\": {\n    \"id\": \"{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"${(action.title || "hey, heres your link").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\",\n            \"image_url\": \"${(action.imageUrl || "").replace(/"/g, '\\"')}\",\n            \"subtitle\": \"${(action.subtitle || "Powered By Quickrevert.tech").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\",\n            \"default_action\": {\n              \"type\": \"web_url\",\n              \"url\": \"${(action.actionButtons?.[0]?.url || "quickrevert.tech").replace(/"/g, '\\"')}\"\n            },\n            \"buttons\": ${JSON.stringify(rewardButtons, null, 2)}\n          }\n        ]\n      }\n    }\n  }\n}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // 3.6 ASK (False Branch) - Use Quick Replies
          const notFollowingText = action.askToFollowMessage || "Oops! Looks like you haven't followed me yet 👀";
          const askBtn = action.askToFollowBtnText || "qr"; // Match user "want" JSON example "qr"

          const askPayload = {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [
                    {
                      title: (action.askToFollowMessage || "Follow to unlock!"),
                      subtitle: "Please follow us first!",
                      buttons: [
                        {
                          type: "web_url",
                          url: `https://www.instagram.com/${instagramAccount.username}/`,
                          title: "Follow Now"
                        },
                        {
                          type: "postback",
                          title: askBtn,
                          payload: `CHECK_FOLLOW_${uniqueId}`
                        }
                      ]
                    }
                  ]
                }
              }
            }
          };

          const askName = `Ask to Follow 2`; // Match user JSON naming
          nodes.push({
            id: `act-ask-${index}`, name: askName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [1200, -560], // Match user position
            parameters: {
              method: "POST",
              url: `https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType",
              nodeCredentialType: "facebookGraphApi",
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  \"recipient\": {\n    \"id\": \"{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}\"\n  },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [\n          {\n            \"title\": \"${(action.askToFollowMessage || "Oops! Looks like you haven't followed me yet 👀...").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\",\n            \"subtitle\": \"Please follow us first!\",\n            \"buttons\": [\n              {\n                \"type\": \"web_url\",\n                \"url\": \"https://www.instagram.com/${instagramAccount.username}/\",\n                \"title\": \"Follow Now\"\n              },\n              {\n                \"type\": \"postback\",\n                \"title\": \"${(action.askToFollowBtnText || "followed").replace(/"/g, '\\"')}\",\n                \"payload\": \"CHECK_FOLLOW_${uniqueId}\"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Is Following
          connections[ifName] = { main: [[{ node: rewardName, type: "main", index: 0 }], [{ node: askName, type: "main", index: 0 }]] };
        });
      }

      // Final cleanup: Ensure Event Type Switch only has 2 outputs in the connections object
      if (connections["Event Type Switch"] && connections["Event Type Switch"].main) {
        connections["Event Type Switch"].main = connections["Event Type Switch"].main.slice(0, 2);
      }

      return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
    };

    const n8nWorkflowJSON = buildWorkflow();

    // Create & Activate
    const createRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, { method: "POST", headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey }, body: JSON.stringify(n8nWorkflowJSON) });
    if (!createRes.ok) throw new Error("n8n Create Failed");
    const n8nResult = await createRes.json();

    if (autoActivate) await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, { method: "POST", headers: { "X-N8N-API-KEY": n8nApiKey } });

    // ATOMIC DATABASE REGISTRATION & CLEANUP
    if (automationId) {
      console.log(`Checking for existing workflows for Automation ID: ${automationId}`);

      // 1. Find existing workflows for this automation
      const { data: existingWorkflows } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id')
        .eq('automation_id', automationId);

      if (existingWorkflows && existingWorkflows.length > 0) {
        const oldWorkflowIds = existingWorkflows.map((w: any) => w.n8n_workflow_id);
        console.log(`Found ${oldWorkflowIds.length} old workflows to cleanup:`, oldWorkflowIds);

        // 2. Delete Routes for old workflows
        const { error: routeDelError } = await supabase
          .from('automation_routes')
          .delete()
          .in('n8n_workflow_id', oldWorkflowIds);

        if (routeDelError) console.error("Error cleaning up old routes:", routeDelError);

        // 3. Delete from n8n_workflows table
        const { error: wfDelError } = await supabase
          .from('n8n_workflows')
          .delete()
          .in('n8n_workflow_id', oldWorkflowIds);

        if (wfDelError) console.error("Error cleaning up old workflow records:", wfDelError);

        // 4. (Optional) Request n8n to delete old workflows to keep things clean
        // We do this asynchronously and don't block on failures
        for (const oldId of oldWorkflowIds) {
          try {
            fetch(`${n8nBaseUrl}/api/v1/workflows/${oldId}`, {
              method: "DELETE",
              headers: { "X-N8N-API-KEY": n8nApiKey }
            }).catch(e => console.warn(`Failed to delete old n8n workflow ${oldId}`, e));
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    // INSERT NEW WORKFLOW RECORD
    const { error: insertError } = await supabase.from("n8n_workflows").insert({
      user_id: user.id,
      n8n_workflow_id: n8nResult.id,
      n8n_workflow_name: n8nResult.name,
      webhook_path: webhookPath,
      instagram_account_id: instagramAccount.id,
      template: template || 'instagram_automation_v1',
      variables: variables || {},
      automation_id: automationId || null,
      is_active: autoActivate // Set initial active state
    });

    if (insertError) {
      console.error("Failed to insert n8n_workflow record:", insertError);
      throw new Error("Database Insert Failed: " + insertError.message);
    }

    // ALWAYS CREATE ROUTES (Inactive by default if autoActivate is false)
    // This ensues that toggling "Active" in UI works immediately because routes exist.
    // Fetch ALL active Instagram accounts for this user to ensure broad coverage
    const { data: userAccounts } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (userAccounts && userAccounts.length > 0) {
      const newRoutes: any[] = [];
      const finalTriggerType = bodyTriggerType || automationData?.trigger_type || 'user_dm';

      for (const account of userAccounts) {
        if (finalTriggerType === 'post_comment') {
          // Comment automations: changes/comments routes + postback for buttons
          newRoutes.push({
            account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id,
            event_type: 'changes', sub_type: 'comments', is_active: autoActivate
          });
          newRoutes.push({
            account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id,
            event_type: 'messaging', sub_type: 'postback', is_active: autoActivate
          });
        } else if (finalTriggerType === 'story_reply') {
          // Story reply: only messaging routes (stories come as messaging events with story_reply sub_type)
          newRoutes.push({
            account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id,
            event_type: 'messaging', sub_type: null, is_active: autoActivate
          });
        } else {
          // Default: DM automation (user_dm / user_directed_messages)
          // Broad messaging route (catches all DMs)
          newRoutes.push({
            account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id,
            event_type: 'messaging', sub_type: null, is_active: autoActivate
          });
          // Postback route (for quick replies / button clicks)
          newRoutes.push({
            account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id,
            event_type: 'messaging', sub_type: 'postback', is_active: autoActivate
          });
        }
      }

      const { error: routeError } = await supabase.from('automation_routes').insert(newRoutes);
      if (routeError) console.error("Failed to create default routes:", routeError);
      else console.log(`Created ${newRoutes.length} default routes (Active: ${autoActivate})`);
    } else {
      console.warn("No active Instagram accounts found. Routes not created.");
    }

    return new Response(JSON.stringify({
      success: true,
      workflowId: n8nResult.id,
      webhookPath: webhookPath
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}); 