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

      // 0. Analytics Workflow (Special Case)
      if (bodyTriggerType === 'enable_analytics') {
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
      nodeX += 300;

      let previousNode = "Worker Webhook";

      // 1.5 Switch Node Logic (Exclusive for keyword_dm and story_reply)
      const isKeywordTrigger =
        (triggerType === 'user_directed_messages' && automationData?.trigger_config?.messageType === 'keywords') ||
        (triggerType === 'story_reply' && automationData?.trigger_config?.storiesType === 'keywords');

      if (isKeywordTrigger) {
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
            const elementsButtons: any[] = [];
            if (hasButtons) {
              sendDmAction.actionButtons.forEach((b: any) => {
                const btnType = b.action || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                } else {
                  elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
                }
              });
            }
            const messagePayload = {
              recipient: { id: `{{ $json.body.payload.sender.id }}` },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [{
                      title: text,
                      ...(imageUrl ? { image_url: imageUrl } : {}),
                      subtitle: subtitle,
                      buttons: elementsButtons
                    }]
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
          const jsonBodyObj: any = {
            recipient: { id: `{{ $json.body.payload.sender.id }}` },
            message: { text: btnText.replace(/"/g, '\\"') }
          };
          if (btnImage) {
            jsonBodyObj.message = {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: linkedAction?.title || b.title,
                    image_url: btnImage,
                    subtitle: btnText,
                    buttons: []
                  }]
                }
              }
            };
          }
          nodes.push({
            id: `act-btn-${index}`, name: `Send DM - ${b.title}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [nodeX, 400 + (index * 150)],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `=${JSON.stringify(jsonBodyObj, null, 2)}`,
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
      if (isSpecificPostTrigger) {
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
          connections[previousNode] = {
            main: [[{ node: "Post Filter Switch", type: "main", index: 0 }]]
          };
          previousNode = "Post Filter Switch";
          nodeX += 300;
        }
      }

      // 1.6 Comment Keyword Switch
      const isCommentKeywordTrigger = triggerType === 'post_comment' && automationData?.trigger_config?.commentsType === 'keywords';
      if (isCommentKeywordTrigger) {
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
                leftValue: "={{ $json.body.entry[0].changes[0].value.text }}",
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
          connections[previousNode] = {
            main: [[{ node: "Comment Switch", type: "main", index: 0 }]]
          };
          previousNode = "Comment Switch";
          nodeX += 300;
        }
      }

      // 1.7 Loop Protection Switch (Username-based)
      if (triggerType === 'post_comment') {
        console.log("--- ADDING USERNAME-BASED LOOP PROTECTION SWITCH ---");
        const instagramUsername = instagramAccount.username;
        console.log("Using Instagram Username for loop protection:", instagramUsername);

        const rules = [
          {
            conditions: {
              options: {
                caseSensitive: false,
                leftValue: "",
                typeValidation: "strict",
                version: 3
              },
              conditions: [
                {
                  id: "loop-check-1",
                  leftValue: "={{ $json.body.entry[0].changes[0].value.from.username }}",
                  rightValue: instagramUsername,
                  operator: {
                    type: "string",
                    operation: "notEquals",
                    name: "filter.operator.notEquals"
                  }
                }
              ],
              combinator: "and"
            }
          },
          {
            conditions: {
              options: {
                caseSensitive: false,
                leftValue: "",
                typeValidation: "strict",
                version: 3
              },
              conditions: [
                {
                  id: "dummy-condition",
                  leftValue: "",
                  rightValue: "",
                  operator: {
                    type: "string",
                    operation: "equals",
                    name: "filter.operator.equals"
                  }
                }
              ],
              combinator: "and"
            }
          }
        ];

        nodes.push({
          id: "loop-protection-switch",
          name: "Loop Protection Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.4,
          position: [nodeX, 304],
          parameters: {
            rules: { values: rules },
            options: { ignoreCase: true }
          }
        });

        // Connect previous node to loop protection switch
        connections[previousNode] = {
          main: [[{ node: "Loop Protection Switch", type: "main", index: 0 }]]
        };

        previousNode = "Loop Protection Switch";
        nodeX += 300;
      }

      // 2. Actions Generation
      actions.forEach((action: any, index: number) => {
        let nodeParams: any = {};
        let nodeType = "n8n-nodes-base.httpRequest";
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
          nodeName = `Reply to Comment ${index + 1}`;
          const userText = action.replyTemplates?.[0] || action.text || "Thanks!";
          const replyText = `@${usernamePath} ${userText}`;
          nodeParams = {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/${commentIdPath}/replies`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json",
            jsonBody: `=${JSON.stringify({ message: replyText }, null, 2)}`,
            options: {}
          };
        } else if (action.type === 'send_dm') {
          nodeName = `Send DM ${index + 1}`;
          const text = action.title || "Hello!";
          const subtitle = action.subtitle || action.messageTemplate || "";
          const imageUrl = action.imageUrl || "";
          const hasButtons = action.actionButtons && action.actionButtons.length > 0;
          const isRichMessage = hasButtons || imageUrl;
          let recipientId = senderIdPath;
          if (triggerType === 'post_comment') {
            recipientId = "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id }}";
          }
          let jsonBody = "";
          if (isRichMessage) {
            const elementsButtons: any[] = [];
            if (hasButtons) {
              action.actionButtons.forEach((b: any) => {
                const btnType = b.action || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                } else {
                  elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
                }
              });
            }
            const messagePayload = {
              recipient: { id: recipientId },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [{
                      title: text,
                      ...(imageUrl ? { image_url: imageUrl } : {}),
                      subtitle: subtitle,
                      buttons: elementsButtons
                    }]
                  }
                }
              }
            };
            jsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
          } else {
            jsonBody = `={
              "recipient": { "id": "${recipientId}" },
              "message": { "text": "${text.replace(/"/g, '\\"')}" }
            }`;
          }
          nodeParams = {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/me/messages`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json",
            jsonBody: jsonBody,
            options: {}
          };
        }

        if (Object.keys(nodeParams).length > 0) {
          nodes.push({
            id: `act-${index}`,
            name: nodeName,
            type: nodeType,
            typeVersion: 4.3,
            position: [nodeX, 300],
            parameters: nodeParams,
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect to previous node
          if (triggerType === 'post_comment') {
            // Parallel connection for Loop Protection Switch
            if (!connections[previousNode]) {
              connections[previousNode] = { main: [[], []] }; // Output 0: Continue, Output 1: Stop
            }
            connections[previousNode].main[0].push({ node: nodeName, type: "main", index: 0 });

            // Do NOT update previousNode, so all actions connect to the Switch
            nodeX += 300;
          } else {
            // Sequential connection for other triggers
            if (previousNode) {
              connections[previousNode] = {
                main: [[{ node: nodeName, type: "main", index: 0 }]]
              };
            }
            previousNode = nodeName;
            nodeX += 300;
          }
        }
      });

      // Final wiring for loop protection switch (ONLY for non-post_comment triggers or if handled differently)
      // For post_comment, we handled connections inside the loop above.
      if (triggerType !== 'post_comment' && nodes.find(n => n.name === "Loop Protection Switch")) {
        // Find the first action node
        const firstActionNode = nodes.find(n =>
          n.name !== "Worker Webhook" &&
          n.name !== "Loop Protection Switch" &&
          n.name !== "Post Filter Switch" &&
          n.name !== "Comment Switch" &&
          n.name !== "Message Switch"
        );

        if (firstActionNode) {
          // Correct connection logic:
          // Output 0: Comment from other account (notEquals) -> Continue to actions
          // Output 1: Comment from own account (dummy) -> Stop
          connections["Loop Protection Switch"] = {
            main: [
              [{ node: firstActionNode.name, type: "main", index: 0 }], // Output 0: Continue
              [] // Output 1: Stop (no connection)
            ]
          };
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