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

      // 0. Analytics Workflow (Special Case)
      if (bodyTriggerType === 'enable_analytics') {
        // ... (keep existing analytics logic manually or just returning it if I can't see it all, but I have it in context)
        // Since I need to preserve it, I will copy the analytics block from previous context.
        const nodes = [
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
            "position": [64, -32],
            "id": "get-insta-stats",
            "name": "Get Instagram Stats",
            "credentials": {
              "facebookGraphApi": {
                "id": credentialId
              }
            }
          },
          {
            "parameters": {
              "method": "PATCH",
              "url": `${supabaseUrl}/rest/v1/instagram_accounts?id=eq.${instagramAccount.id}`,
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
        ];

        const connections = {
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
        };

        return { name: `[Analytics] ${instagramAccount.username}`, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      const nodes: any[] = [];
      let nodeX = -300; // Start closer to center
      const connections: any = {};

      // 1. Webhook (Standard Worker)
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [nodeX, 300],
        parameters: { httpMethod: "POST", path: webhookPath, responseMode: "onReceived", options: {} },
        webhookId: webhookPath
      });
      nodeX += 250;

      // --- ADDED: IDENTITY RESOLUTION NODE ---
      const resolverNodeName = "Identity Resolver";
      const supabaseUpdateNodeName = "Update Contact in Supabase";

      nodes.push({
        id: "identity-resolver", name: resolverNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [nodeX, 300],
        parameters: {
          url: "=https://graph.instagram.com/v24.0/{{ $json.body.from?.id || $json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $json.body.entry?.[0]?.changes?.[0]?.value?.from?.id }}",
          authentication: "predefinedCredentialType",
          nodeCredentialType: "facebookGraphApi",
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: "fields", value: "username,name,is_user_follow_business,profile_pic" }
            ]
          },
          options: {}
        },
        credentials: { facebookGraphApi: { id: credentialId } },
        continueOnFail: true
      });
      nodeX += 250;

      nodes.push({
        id: "update-contact-supabase", name: supabaseUpdateNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [nodeX, 300],
        parameters: {
          method: "POST",
          url: `${supabaseUrl}/rest/v1/contacts`,
          headers: {
            parameters: [
              { name: "apikey", value: supabaseServiceKey },
              { name: "Authorization", value: `Bearer ${supabaseServiceKey}` },
              { name: "Content-Type", value: "application/json" },
              { name: "Prefer", value: "resolution=merge-duplicates" }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={\n  \"user_id\": \"{{ $('Worker Webhook').item.json.userId }}\",\n  \"instagram_account_id\": \"{{ $('Worker Webhook').item.json.instagramAccountId }}\",\n  \"instagram_user_id\": \"{{ $node[\"Identity Resolver\"].json.id }}\",\n  \"username\": \"{{ $node[\"Identity Resolver\"].json.username }}\",\n  \"full_name\": \"{{ $node[\"Identity Resolver\"].json.name }}\",\n  \"follows_us\": {{ $node[\"Identity Resolver\"].json.is_user_follow_business || false }},\n  \"last_interaction_at\": \"{{ new Date().toISOString() }}\"\n}",
          options: {}
        },
        continueOnFail: true
      });
      nodeX += 250;

      connections["Worker Webhook"] = { main: [[{ node: resolverNodeName, type: "main", index: 0 }]] };
      connections[resolverNodeName] = { main: [[{ node: supabaseUpdateNodeName, type: "main", index: 0 }]] };

      let previousNode = supabaseUpdateNodeName;
      let triggerAnchorNode = supabaseUpdateNodeName;

      // --- ADVANCED ASK TO FOLLOW: Event Type Switch ---
      if (hasAskToFollow) {
        console.log("--- ACTIVATING ADVANCED ASK TO FOLLOW FLOW (STRICT JSON) ---");

        nodes.push({
          id: "event-type-switch",
          name: "Event Type Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.3,
          position: [nodeX, 32],
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{ id: "is-comment", leftValue: "={{ $json.body.sub_type }}", rightValue: "comments", operator: { type: "string", operation: "equals" } }],
                    combinator: "and"
                  },
                  renameOutput: true, outputKey: "Trigger Event"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{ id: "is-postback", leftValue: "={{ $json.body.sub_type }}", rightValue: "postback", operator: { type: "string", operation: "equals" } }],
                    combinator: "and"
                  },
                  renameOutput: true, outputKey: "Button Click"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{ id: "is-message", leftValue: "={{ $json.body.sub_type }}", rightValue: "message", operator: { type: "string", operation: "equals" } }],
                    combinator: "and"
                  },
                  renameOutput: true, outputKey: "message"
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });

        connections[supabaseUpdateNodeName] = { main: [[{ node: "Event Type Switch", type: "main", index: 0 }]] };

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
                leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.media?.id || $json.body.payload?.value?.media?.id }}",
                rightValue: id,
                operator: { type: "string", operation: "equals" }
              })),
              combinator: "or"
            }
          }];
          nodes.push({
            id: "post-filter-switch", name: "Post Filter Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, -64],
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
                leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.text }}",
                rightValue: k,
                operator: { type: "string", operation: "contains" }
              })),
              combinator: "or"
            }
          }];
          nodes.push({
            id: "comment-switch", name: "Comment Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, -64],
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
          position: [144, -80], // Match user position
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 3 },
                    conditions: [{ id: "loop-check-1", leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}", rightValue: instagramUsername, operator: { type: "string", operation: "notEquals", name: "filter.operator.notEquals" } }],
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
                payload: b.text
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
                leftValue: "={{ $json.body.entry[0].messaging[0].message.text }}",
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
                leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
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
                  templateButtons.push({ type: "web_url", url: b.url, title: b.text.substring(0, 20) });
                } else {
                  templateButtons.push({ type: "postback", title: b.text.substring(0, 20), payload: b.text });
                }
              });
            }

            const messagePayload: any = {
              recipient: { id: `{{ $json.body.payload.sender.id }}` },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: text.substring(0, 80),
                        subtitle: subtitle ? subtitle.substring(0, 80) : "Powered By Quickrevert.tech",
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
              "recipient": { "id": "{{ $json.body.payload.sender.id }}" },
              "message": { "text": "${text.replace(/"/g, '\\"')}" }
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
                templateButtons.push({ type: "web_url", url: b.url, title: b.text.substring(0, 20) });
              } else {
                templateButtons.push({ type: "postback", title: b.text.substring(0, 20), payload: b.text });
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
                      title: btnText.substring(0, 80),
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
          commentIdPath = "{{ $json.body.entry[0].changes[0].value.id }}";
          senderIdPath = "{{ $json.body.entry[0].changes[0].value.from.id }}";
          usernamePath = "{{ $json.body.entry[0].changes[0].value.from.username }}";
        } else {
          senderIdPath = "{{ $json.body.entry[0].messaging[0].sender.id }}";
        }

        if (action.type === 'reply_to_comment') {
          nodeName = `Reply to Comment `;
          const replyText = `@${usernamePath} ${action.replyTemplates?.[0] || action.text || "Thanks!"}`;
          nodes.push({
            id: `act-reply-${index}`, name: nodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, -160],
            parameters: { method: "POST", url: `=https://graph.instagram.com/v24.0/${commentIdPath}/replies`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify({ message: replyText }, null, 2)}`, options: {} },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
          if (!connections[triggerAnchorNode]) connections[triggerAnchorNode] = { main: [] };
          if (!connections[triggerAnchorNode].main[0]) connections[triggerAnchorNode].main[0] = [];
          connections[triggerAnchorNode].main[0].push({ node: nodeName, type: "main", index: 0 });
          nodeX += 300;
          return;
        }

        if (action.type === 'send_dm') {
          if (action.askToFollow) {
            const teaserNodeName = `Send Teaser DM`;
            const teaserPayload = {
              recipient: triggerType === 'post_comment' ? { comment_id: "{{ $json.body.entry[0].changes[0].value.id }}" } : { id: senderIdPath },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: (action.teaserMessage || "Interested?").substring(0, 80),
                        subtitle: "Powered By Quickrevert.tech",
                        image_url: action.imageUrl || undefined,
                        buttons: [
                          {
                            type: "postback",
                            title: (action.teaserBtnText || "access").substring(0, 20),
                            payload: "SEND_LINK"
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            };
            nodes.push({
              id: `teaser-${index}`, name: teaserNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [352, -96], // Match user position
              parameters: { method: "POST", url: "https://graph.instagram.com/v24.0/me/messages", authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(teaserPayload, null, 2)}`, options: {} },
              credentials: { facebookGraphApi: { id: credentialId } }
            });
            if (!connections[triggerAnchorNode]) connections[triggerAnchorNode] = { main: [] };
            if (!connections[triggerAnchorNode].main[0]) connections[triggerAnchorNode].main[0] = [];
            connections[triggerAnchorNode].main[0].push({ node: teaserNodeName, type: "main", index: 0 });
            nodeX += 300;
            postbackActions.push({ ...action, index });
            return;
          } else {
            nodeName = `Send DM ${index + 1}`;
            const recipient = triggerType === 'post_comment' ? { comment_id: "{{ $json.body.entry[0].changes[0].value.id }}" } : { id: senderIdPath };
            const messagePayload = { recipient, message: { text: action.title || "Hello!" } };
            nodeParams = { method: "POST", url: "https://graph.instagram.com/v24.0/me/messages", authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(messagePayload, null, 2)}`, options: {} };
          }
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
          const payloadPath = "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload || $json.body.entry?.[0]?.messaging?.[0]?.message?.quick_reply?.payload }}";

          const switchRules = [
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "check", leftValue: payloadPath, rightValue: "CHECK_FOLLOW", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Check Follow"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "send", leftValue: payloadPath, rightValue: "SEND_LINK", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Send Link"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "qr-check", leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.message?.text }}", rightValue: teaserBtnText, operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "qr"
            }
          ];

          const switchName = `Button Action Switch`; // Match user JSON naming
          nodes.push({
            id: `btn-switch-${index}`, name: switchName, type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [144, 112], // Match user position
            parameters: { rules: { values: switchRules }, options: { ignoreCase: true } }
          });

          // Connect "Event Type Switch" (Index 1: Button Click AND Index 2: message) to this.
          if (!connections["Event Type Switch"]) connections["Event Type Switch"] = { main: [[], [], []] };
          if (!connections["Event Type Switch"].main[1]) connections["Event Type Switch"].main[1] = [];
          if (!connections["Event Type Switch"].main[2]) connections["Event Type Switch"].main[2] = [];
          connections["Event Type Switch"].main[1].push({ node: switchName, type: "main", index: 0 }); // Postback Click (SEND_LINK/CHECK_FOLLOW)
          connections["Event Type Switch"].main[2].push({ node: switchName, type: "main", index: 0 }); // Message (Quick Reply Click - "qr")

          postbackNodeX += 250;

          // 3.2 Fetch Context
          const fetchName = `Fetch Context`;
          nodes.push({
            id: `fetch-context-${index}`, name: fetchName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [368, 128], // Match user position
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
            position: [592, 128], // Match user position
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
            position: [816, 128], // Match user position
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
          const text = action.title || "Check out this link!";
          const subtitle = action.subtitle || "Powered by Quickrevert.tech";
          const imageUrl = action.imageUrl || "https://your-image-url.com/image.jpg";
          const webUrl = action.actionButtons?.[0]?.url || "https://your-link.com";
          const btnTitle = action.actionButtons?.[0]?.text || "View Link";

          const rewardPayload = {
            recipient: {
              id: "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}"
            },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [
                    {
                      title: text,
                      image_url: imageUrl,
                      subtitle: subtitle,
                      default_action: {
                        type: "web_url",
                        url: webUrl
                      },
                      buttons: [
                        {
                          type: "web_url",
                          url: webUrl,
                          title: btnTitle
                        }
                      ]
                    }
                  ]
                }
              }
            }
          };

          const rewardName = `Send Reward 2`; // Match user JSON naming
          nodes.push({
            id: `act-reward-${index}`, name: rewardName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [1040, 32], // Match user position
            parameters: { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(rewardPayload, null, 2)}`, options: {} },
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
                      title: (action.askToFollowMessage || "Follow to unlock!").substring(0, 80),
                      subtitle: "Please follow us first!",
                      buttons: [
                        {
                          type: "web_url",
                          url: `https://www.instagram.com/${instagramAccount.username}/`,
                          title: "Follow Now"
                        },
                        {
                          type: "postback",
                          title: askBtn.substring(0, 20),
                          payload: "CHECK_FOLLOW"
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
            position: [1040, 224], // Match user position
            parameters: { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(askPayload, null, 2)}`, options: {} },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Is Following
          connections[ifName] = { main: [[{ node: rewardName, type: "main", index: 0 }], [{ node: askName, type: "main", index: 0 }]] };
        });
      }

      // Final wiring for loop protection switch (ONLY for non-post_comment triggers or if handled differently)
      // For post_comment, we handled connections inside the loop above.
      if (triggerType !== 'post_comment') {
        const lpNode = nodes.find(n => n.name === "Loop Protection Switch" || n.name === "Loop Protection Switch1");
        if (lpNode) {
          // Find the first action node
          const firstActionNode = nodes.find(n =>
            n.name !== "Worker Webhook" &&
            n.name !== lpNode.name &&
            n.name !== "Post Filter Switch" &&
            n.name !== "Comment Switch" &&
            n.name !== "Event Type Switch" &&
            n.name !== "Button Action Switch" &&
            n.name !== "Message Switch"
          );

          if (firstActionNode) {
            connections[lpNode.name] = {
              main: [
                [{ node: firstActionNode.name, type: "main", index: 0 }], // Output 0: Continue
                [] // Output 1: Stop (no connection)
              ]
            };
          }
        }
      }

      return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
    };

    const n8nWorkflowJSON = buildWorkflow();

    // Create & Activate
    const createRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, { method: "POST", headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey }, body: JSON.stringify(n8nWorkflowJSON) });
    if (!createRes.ok) throw new Error("n8n Create Failed");
    const n8nResult = await createRes.json();

    if (autoActivate) await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, { method: "POST", headers: { "X-N8N-API-KEY": n8nApiKey } });

    // ATOMIC DATABASE REGISTRATION
    if (autoActivate) {
      const globalRoutesPayload: any[] = [];
      const trackedPostsPayload: any[] = [];

      const isSpecificPostTrigger = automationData && automationData.trigger_type === 'post_comment' && automationData.trigger_config && automationData.trigger_config.postsType === 'specific';

      if (isSpecificPostTrigger) {
        const specificPosts = (automationData && automationData.trigger_config && Array.isArray(automationData.trigger_config.specificPosts))
          ? automationData.trigger_config.specificPosts
          : [];
        if (specificPosts.length > 0) {
          specificPosts.forEach((pid: string) => {
            trackedPostsPayload.push({
              media_id: pid,
              platform: 'instagram'
            });
          });
        }
      } else {
        globalRoutesPayload.push(
          {
            account_id: instagramAccount.instagram_user_id,
            event_type: 'messaging',
            sub_type: null,
            is_active: true
          },
          {
            account_id: instagramAccount.instagram_user_id,
            event_type: 'changes',
            sub_type: null,
            is_active: true
          }
        );
      }

      const { error: dbError } = await supabase.rpc('register_automation', {
        p_user_id: user.id,
        p_n8n_id: n8nResult.id,
        p_n8n_name: n8nResult.name,
        p_webhook_path: webhookPath,
        p_instagram_account_id: instagramAccount.id,
        p_template: template || 'instagram_automation_v1',
        p_variables: variables || {},
        p_automation_id: automationId || null,
        p_global_routes: globalRoutesPayload,
        p_tracked_posts: trackedPostsPayload
      });

      if (dbError) {
        console.error("RPC Error:", dbError);
        throw new Error("Database Transaction Failed: " + dbError.message);
      }
    } else {
      await supabase.from("n8n_workflows").insert({
        user_id: user.id,
        n8n_workflow_id: n8nResult.id,
        n8n_workflow_name: n8nResult.name,
        webhook_path: webhookPath,
        instagram_account_id: instagramAccount.id,
        template: template || 'instagram_automation_v1',
        variables: variables || {},
        ...(automationId && { automation_id: automationId })
      });
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