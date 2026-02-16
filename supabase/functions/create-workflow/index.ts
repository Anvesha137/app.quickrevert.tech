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
      nodeX += 300;

      let previousNode = "Worker Webhook";
      let postbackEntryNode = null; // Node to connect postback flows to
      let postbackNodeX = -300;
      let postbackNodeY = 600;

      // --- ADVANCED ASK TO FOLLOW: Event Type Switch ---
      if (hasAskToFollow) {
        console.log("--- ACTIVATING ADVANCED ASK TO FOLLOW FLOW (STRICT JSON) ---");

        nodes.push({
          id: "event-type-switch",
          name: "Event Type Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.3,
          position: [nodeX, 300],
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [
                      {
                        id: "is-comment",
                        leftValue: "={{ $json.body.sub_type }}",
                        rightValue: "comments",
                        operator: { type: "string", operation: "equals" }
                      }
                    ],
                    combinator: "and"
                  },
                  renameOutput: true,
                  outputKey: "Trigger Event"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [
                      {
                        id: "is-postback",
                        leftValue: "={{ $json.body.sub_type }}",
                        rightValue: "postback",
                        operator: { type: "string", operation: "equals" }
                      }
                    ],
                    combinator: "and"
                  },
                  renameOutput: true,
                  outputKey: "Button Click"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [
                      {
                        id: "is-message",
                        leftValue: "={{ $json.body.sub_type }}",
                        rightValue: "message",
                        operator: { type: "string", operation: "equals" }
                      }
                    ],
                    combinator: "and"
                  }
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });

        // Loop Protection Switch
        // User JSON has it separate, connected to "Trigger Event" (index 0)
        const instagramUsername = instagramAccount.username;
        nodes.push({
          id: "loop-protection-switch",
          name: "Loop Protection Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.4,
          position: [nodeX + 300, 100], // Upper branch
          parameters: {
            rules: {
              values: [
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
                    conditions: [{
                      id: "dummy-condition",
                      leftValue: "",
                      rightValue: "",
                      operator: { type: "string", operation: "equals", name: "filter.operator.equals" }
                    }],
                    combinator: "and"
                  }
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });

        // Connect Webhook to Event Type Switch
        connections["Worker Webhook"] = {
          main: [[{ node: "Event Type Switch", type: "main", index: 0 }]]
        };

        // Connect Event Type Switch to Loop Protection (Link 0 -> Loop Protection)
        connections["Event Type Switch"] = {
          main: [
            [{ node: "Loop Protection Switch", type: "main", index: 0 }], // Index 0: Trigger Event
            [], // Index 1: Button Click (Will connect later)
            []  // Index 2: Message (Unused?)
          ]
        };

        previousNode = "Loop Protection Switch"; // Use this as anchor for Trigger flow
        nodeX += 600;

        // --- POSTBACK BRANCH INFRASTRUCTURE ---
        const postbackNodeX = nodeX; // Start parallel logic visually
        const postbackNodeY = 600;   // Lower Y for separate branch

        // 1. Button Action Switch
        nodes.push({
          id: "btn-action-switch",
          name: "Button Action Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3.3,
          position: [postbackNodeX, postbackNodeY],
          parameters: {
            rules: {
              values: [
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{
                      id: "check",
                      leftValue: "={{ $json.body.entry[0].messaging[0].message.quick_reply.payload }}",
                      rightValue: "CHECK_FOLLOW",
                      operator: { type: "string", operation: "equals" }
                    }],
                    combinator: "and"
                  },
                  renameOutput: true,
                  outputKey: "Check Follow"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{
                      id: "visit",
                      leftValue: "={{ $json.body.entry[0].messaging[0].message.quick_reply.payload }}",
                      rightValue: "VISIT_PROFILE",
                      operator: { type: "string", operation: "equals" }
                    }],
                    combinator: "and"
                  },
                  renameOutput: true,
                  outputKey: "Visit Profile"
                },
                {
                  conditions: {
                    options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                    conditions: [{
                      id: "send",
                      leftValue: "={{ $json.body.entry[0].messaging[0].message.quick_reply.payload }}",
                      rightValue: "SEND_LINK",
                      operator: { type: "string", operation: "equals" }
                    }],
                    combinator: "and"
                  },
                  renameOutput: true,
                  outputKey: "Send Link"
                }
              ]
            },
            options: { ignoreCase: true }
          }
        });

        // 2. Fetch Context (for CHECK_FOLLOW and SEND_LINK)
        nodes.push({
          id: "fetch-context",
          name: "Fetch Context",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.3,
          position: [postbackNodeX + 300, postbackNodeY],
          parameters: {
            url: `=https://graph.instagram.com/v24.0/{{ $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}`,
            authentication: "predefinedCredentialType",
            nodeCredentialType: "facebookGraphApi",
            sendQuery: true,
            queryParameters: {
              parameters: [{
                name: "fields",
                value: "id,username,name,follower_count,is_user_follow_business,is_business_follow_user"
              }]
            },
            options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });

        // 3. Extract Status
        nodes.push({
          id: "extract-status",
          name: "Extract Status",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [postbackNodeX + 600, postbackNodeY],
          parameters: {
            jsCode: "const conversationData = $input.item.json;\nconst isFollowing = conversationData.is_user_follow_business || false;\nconst userId = conversationData.id;\nconst username = conversationData.username || 'user';\nreturn { json: { userId, username, isFollowing } };"
          }
        });

        // 4. Is Following Switch
        nodes.push({
          id: "is-following-switch",
          name: "Is Following?",
          type: "n8n-nodes-base.if",
          typeVersion: 2.1,
          position: [postbackNodeX + 900, postbackNodeY],
          parameters: {
            conditions: {
              options: { caseSensitive: true, leftValue: "" },
              conditions: [{
                id: "if-check",
                leftValue: "={{ $json.isFollowing }}",
                rightValue: true,
                operator: { type: "boolean", operation: "true" }
              }],
              combinator: "and"
            },
            options: {}
          }
        });

        // 5. Send Profile Link (for VISIT_PROFILE)
        nodes.push({
          id: "send-profile-link",
          name: "Send Profile Link",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.3,
          position: [postbackNodeX + 300, postbackNodeY + 200],
          parameters: {
            method: "POST",
            url: "https://graph.instagram.com/v24.0/me/messages",
            authentication: "predefinedCredentialType",
            nodeCredentialType: "facebookGraphApi",
            sendBody: true,
            specifyBody: "json",
            jsonBody: `={ "recipient": { "id": "{{ $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}" }, "message": { "text": "Visit my profile here: https://instagram.com/${instagramAccount.username}\\n\\nAfter you follow, tap 'I am following' button! 😊" } }`,
            options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });


        // CONNECT POSTBACK BRANCH
        // Connect Event Type Switch (Index 1: Button Click) to Button Action Switch
        connections["Event Type Switch"].main[1].push({ node: "Button Action Switch", type: "main", index: 0 });

        // Connect Button Action Switch outputs
        connections["Button Action Switch"] = {
          main: [
            [{ node: "Fetch Context", type: "main", index: 0 }], // Index 0: Check Follow
            [{ node: "Send Profile Link", type: "main", index: 0 }], // Index 1: Visit Profile
            [{ node: "Fetch Context", type: "main", index: 0 }]  // Index 2: Send Link
          ]
        };

        // Linear flow: Fetch -> Extract -> Is Following
        connections["Fetch Context"] = { main: [[{ node: "Extract Status", type: "main", index: 0 }]] };
        connections["Extract Status"] = { main: [[{ node: "Is Following?", type: "main", index: 0 }]] };
        // Is Following connections (True/False) will be filled by the ACTIONS generating the Reward/Ask nodes.
        connections["Is Following?"] = { main: [[], []] };
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
          connections[previousNode] = {
            main: [[{ node: "Post Filter Switch", type: "main", index: 0 }]]
          };
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
          connections[previousNode] = {
            main: [[{ node: "Comment Switch", type: "main", index: 0 }]]
          };
          previousNode = "Comment Switch";
          nodeX += 300;
        }
      }

      // 1.7 Loop Protection Switch (Username-based) - OLD LOGIC (Disabled for Ask to Follow)
      if (!hasAskToFollow && triggerType === 'post_comment') {
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
                  leftValue: "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}",
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
        if (!connections[previousNode]) connections[previousNode] = { main: [] };
        if (!connections[previousNode].main[0]) connections[previousNode].main[0] = [];
        connections[previousNode].main[0].push({ node: "Loop Protection Switch", type: "main", index: 0 });

        previousNode = "Loop Protection Switch";
        nodeX += 300;
      }

      // 2. Actions Generation
      console.log(`--- GENERATING ACTIONS for Trigger: ${triggerType} ---`);
      console.log("Actions payload:", JSON.stringify(actions, null, 2));

      const postbackActions: any[] = [];

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
          // START NEW LOGIC
          if (action.askToFollow) {
            // *** 1. TEASER DM (Trigger Branch) ***
            // Connects to Loop Protection Switch
            console.log(`--- GENERATING TEASER DM (` + index + `) ---`);
            const teaserText = action.teaserMessage || "Hey there! I'm so happy you're here, thanks so much for your interest 😊\\n\\nClick below and I'll send you the link in just a sec ✨";
            const teaserBtn = action.teaserBtnText || "Send me the link";

            const recipientId = triggerType === 'post_comment'
              ? "{{ $json.body.entry[0].changes[0].value.from.id }}"
              : "{{ $json.body.entry[0].messaging[0].sender.id }}";

            const teaserJsonBody = {
              recipient: { id: recipientId },
              message: {
                text: teaserText,
                quick_replies: [{ content_type: "text", title: teaserBtn, payload: "SEND_LINK" }]
              }
            };

            const teaserNodeName = `Send Teaser DM ${index + 1}`;
            nodes.push({
              id: `teaser-dm-${index}`, name: teaserNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
              parameters: { method: "POST", url: "https://graph.instagram.com/v24.0/me/messages", authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(teaserJsonBody, null, 2)}`, options: {} },
              credentials: { facebookGraphApi: { id: credentialId } }
            });

            // Connect Teaser to previousNode (Loop Protection)
            if (!connections[previousNode]) connections[previousNode] = { main: [] };
            if (!connections[previousNode].main[0]) connections[previousNode].main[0] = [];
            connections[previousNode].main[0].push({ node: teaserNodeName, type: "main", index: 0 });
            // Don't update previousNode significantly as this is the end of Trigger branch for now (unless we chain more)
            nodeX += 300;


            // *** 2. REWARD DM (Postback True Branch) ***
            // Connects to Is Following? (Index 0)
            const rewardNodeName = `Send Reward ${index + 1}`;
            const rewardText = action.title || "Here is your link!";
            const rewardSubtitle = action.subtitle || action.messageTemplate || "";
            const rewardImageUrl = action.imageUrl || "";
            const hasButtons = action.actionButtons && action.actionButtons.length > 0;

            let rewardJsonBody = "";
            const rewardRecipientId = "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}";

            if (hasButtons || rewardImageUrl) {
              const elementsButtons: any[] = [];
              if (hasButtons) {
                action.actionButtons.forEach((b: any) => {
                  const btnType = b.action || (b.url ? 'web_url' : 'postback');
                  if (btnType === 'web_url') elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                  else elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
                });
              }
              const messagePayload = {
                recipient: { id: rewardRecipientId },
                message: { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: rewardText, ...(rewardImageUrl ? { image_url: rewardImageUrl } : {}), subtitle: rewardSubtitle, buttons: elementsButtons }] } } }
              };
              rewardJsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
            } else {
              rewardJsonBody = `={ "recipient": { "id": "${rewardRecipientId}" }, "message": { "text": "${rewardText.replace(/"/g, '\\"')}" } }`;
            }

            nodes.push({
              id: `act-reward-${index}`, name: rewardNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
              position: [postbackNodeX + 1100, postbackNodeY - 100], // Slightly above
              parameters: {
                method: "POST",
                url: `https://graph.instagram.com/v24.0/me/messages`,
                authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
                sendBody: true, specifyBody: "json",
                jsonBody: rewardJsonBody,
                options: {}
              },
              credentials: { facebookGraphApi: { id: credentialId } }
            });

            // Connect Is Following? (Index 0) to Reward
            connections["Is Following?"].main[0].push({ node: rewardNodeName, type: "main", index: 0 });


            // *** 3. ASK TO FOLLOW DM (Postback False Branch) ***
            // Connects to Is Following? (Index 1)
            const askNodeName = `Ask to Follow ${index + 1}`;
            const askText = action.askToFollowMessage || "Please follow us to get access! 👇";
            const askBtn = action.askToFollowBtnText || "I am following";

            const askJsonBody = {
              recipient: { id: rewardRecipientId },
              message: {
                text: askText,
                quick_replies: [{ content_type: "text", title: askBtn, payload: "CHECK_FOLLOW" }]
              }
            };

            nodes.push({
              id: `act-ask-${index}`, name: askNodeName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
              position: [postbackNodeX + 1100, postbackNodeY + 100], // Slightly below
              parameters: { method: "POST", url: "https://graph.instagram.com/v24.0/me/messages", authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(askJsonBody, null, 2)}`, options: {} },
              credentials: { facebookGraphApi: { id: credentialId } }
            });

            // Connect Is Following? (Index 1) to Ask to Follow
            connections["Is Following?"].main[1].push({ node: askNodeName, type: "main", index: 0 });

            return; // Done processing this action
          } else {
            // Standard DM
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
                  if (btnType === 'web_url') elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                  else elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
                });
              }
              const messagePayload = {
                recipient: { id: recipientId },
                message: { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: text, ...(imageUrl ? { image_url: imageUrl } : {}), subtitle: subtitle, buttons: elementsButtons }] } } }
              };
              jsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
            } else {
              jsonBody = `={ "recipient": { "id": "${recipientId}" }, "message": { "text": "${text.replace(/"/g, '\\"')}" } }`;
            }

            nodeParams = { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: jsonBody, options: {} };
          }
          // END NEW LOGIC

          /* OLD LOGIC START
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
          
          // --- ASK TO FOLLOW LOGIC ---
          if (action.askToFollow) {
          console.log(`--- ADDING ASK TO FOLLOW LOGIC FOR ACTION ${index + 1} ---`);
          const senderIdForContext = triggerType === 'post_comment'
           ? "{{ $json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}"
           : "{{ $json.body.entry[0].messaging[0].sender.id }}";
          
          // 1. Fetch Conversation Context
          nodes.push({
           id: `fetch-context-${index}`,
           name: `Fetch Context ${index + 1}`,
           type: "n8n-nodes-base.httpRequest",
           typeVersion: 4.3,
           position: [nodeX, 300],
           parameters: {
             url: `=https://graph.instagram.com/v24.0/${senderIdForContext}`,
             authentication: "predefinedCredentialType",
             nodeCredentialType: "facebookGraphApi",
             sendQuery: true,
             queryParameters: {
               parameters: [
                 {
                   name: "fields",
                   value: "id,username,name,follower_count,is_user_follow_business,is_business_follow_user"
                 }
               ]
             },
             options: {}
           },
           credentials: { facebookGraphApi: { id: credentialId } }
          });
          // Connect previous node to Fetch Context
          if (previousNode) {
           if (triggerType === 'post_comment') {
             if (!connections[previousNode]) {
               connections[previousNode] = { main: [[], []] };
             }
             connections[previousNode].main[0].push({ node: `Fetch Context ${index + 1}`, type: "main", index: 0 });
           } else {
             connections[previousNode] = { main: [[{ node: `Fetch Context ${index + 1}`, type: "main", index: 0 }]] };
           }
          }
          if (triggerType !== 'post_comment') previousNode = `Fetch Context ${index + 1}`;
          nodeX += 250;
          
          
          // 2. Extract Follow Status (Code Node)
          nodes.push({
           id: `extract-status-${index}`,
           name: `Extract Status ${index + 1}`,
           type: "n8n-nodes-base.code",
           typeVersion: 2,
           position: [nodeX, 300],
           parameters: {
             jsCode: `// Extract the relationship flag from conversation context
          const conversationData = $input.item.json;
          const isFollowing = conversationData.is_user_follow_business || false;
          const userId = conversationData.id;
          const username = conversationData.username || 'user';
          return {
          json: {
          userId: userId,
          username: username,
          isFollowing: isFollowing
          }
          };`
           }
          });
          connections[`Fetch Context ${index + 1}`] = { main: [[{ node: `Extract Status ${index + 1}`, type: "main", index: 0 }]] };
          previousNode = `Extract Status ${index + 1}`;
          nodeX += 250;
          
          // 3. Is Following? (If Node)
          nodes.push({
           id: `is-following-${index}`,
           name: `Is Following? ${index + 1}`,
           type: "n8n-nodes-base.if",
           typeVersion: 2.1,
           position: [nodeX, 300],
           parameters: {
             conditions: {
               options: { caseSensitive: true, leftValue: "" },
               conditions: [
                 {
                   id: "is-following-check",
                   leftValue: "={{ $json.isFollowing }}",
                   rightValue: true,
                   operator: { type: "boolean", operation: "true" }
                 }
               ],
               combinator: "and"
             }
           }
          });
          connections[`Extract Status ${index + 1}`] = { main: [[{ node: `Is Following? ${index + 1}`, type: "main", index: 0 }]] };
          previousNode = `Is Following? ${index + 1}`;
          nodeX += 250; // Branching happens here
          
          // 4A. TRUE Branch: Send Reward (Original DM)
          // Construct the original DM payload
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
          
          nodes.push({
           id: `act-${index}`, // Reusing ID for consistency in tracking if needed, but names are unique
           name: `Send Reward ${index + 1}`,
           type: "n8n-nodes-base.httpRequest",
           typeVersion: 4.3,
           position: [nodeX, 200], // Upper branch
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
          
          // 4B. FALSE Branch: Send "Not Following" Message
          const notFollowingText = action.askToFollowMessage || "Oops! Looks like you haven't followed me yet 👀\\n\\nIt would mean a lot if you could visit my profile and hit that follow button 😊.";
          const followBtnText = action.askToFollowBtnText || "I'm following ✅";
          
          const notFollowingBody = `={
          "recipient": {
          "id": "${recipientId}"
          },
          "message": {
          "attachment": {
          "type": "template",
          "payload": {
          "template_type": "generic",
          "elements": [
          {
          "title": "${notFollowingText.replace(/"/g, '\\"')}",
          "buttons": [
           {
             "type": "postback",
             "title": "Visit Profile",
             "payload": "VISIT_PROFILE"
           },
           {
             "type": "postback",
             "title": "${followBtnText.replace(/"/g, '\\"')}",
             "payload": "CHECK_FOLLOW"
           }
          ]
          }
          ]
          }
          }
          }
          }`;
          nodes.push({
           id: `send-not-following-${index}`,
           name: `Send Not Following ${index + 1}`,
           type: "n8n-nodes-base.httpRequest",
           typeVersion: 4.3,
           position: [nodeX, 400], // Lower branch
           parameters: {
             method: "POST",
             url: `=https://graph.instagram.com/v24.0/me/messages`,
             authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
             sendBody: true, specifyBody: "json",
             jsonBody: notFollowingBody,
             options: {}
           },
           credentials: { facebookGraphApi: { id: credentialId } }
          });
          
          // Wiring Is Following?
          connections[`Is Following? ${index + 1}`] = {
           main: [
             [{ node: `Send Reward ${index + 1}`, type: "main", index: 0 }], // True
             [{ node: `Send Not Following ${index + 1}`, type: "main", index: 0 }] // False
           ]
          };
          
          nodeX += 300;
          
          // 5. Button Action Switch
          const switchRules = [
           {
             conditions: {
               options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
               conditions: [{
                 id: "check-follow-payload",
                 leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload }}",
                 rightValue: "CHECK_FOLLOW",
                 operator: { type: "string", operation: "equals" }
               }],
               combinator: "and"
             },
             renameOutput: true,
             outputKey: "Check Follow"
           },
           {
             conditions: {
               options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
               conditions: [{
                 id: "visit-profile-payload",
                 leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload }}",
                 rightValue: "VISIT_PROFILE",
                 operator: { type: "string", operation: "equals" }
               }],
               combinator: "and"
             },
             renameOutput: true,
             outputKey: "Visit Profile"
           }
          ];
          
          nodes.push({
           id: `button-switch-${index}`,
           name: `Button Action Switch ${index + 1}`,
           type: "n8n-nodes-base.switch",
           typeVersion: 3.3,
           position: [-192, 1200 + (index * 200)], // Needs to be positioned where it can be triggered by webhook. 
           // CRITICAL IMPL DETAIL: In the user's example, the Webhook connects to this switch too.
           // We need to add this switch and connect the MAIN webhook to it?
           // OR is it a separate flow? The user provided JSON shows "Worker Webhook" connects to "Button Action Switch2".
           // So yes, we need to connect the main webhook to this switch as well.
           parameters: { rules: { values: switchRules }, options: { ignoreCase: true } }
          });
          
          // Connect MAIN Webhook to this Switch
          // We need to find the webhook node or the node that branches from it.
          // "Worker Webhook" is usually the starting point.
          // We need to add this switch to the connections of "Worker Webhook".
          
          // Since this is inside a loop, we might have multiple "Ask to Follow" actions.
          // The user example shows ONE main webhook connecting to mutiple starts.
          
          // 5B. Send Profile Link (Visit Profile Action)
          nodes.push({
           id: `send-profile-link-${index}`,
           name: `Send Profile Link ${index + 1}`,
           type: "n8n-nodes-base.httpRequest",
           typeVersion: 4.3,
           position: [32, 1300 + (index * 200)],
           parameters: {
             method: "POST",
             url: `=https://graph.instagram.com/v24.0/me/messages`,
             authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
             sendBody: true, specifyBody: "json",
             jsonBody: `={
          "recipient": {
          "id": "${recipientId}"
          },
          "message": {
          "text": "Visit my profile here: https://instagram.com/${instagramAccount.username}\\n\\nAfter you follow, tap '${followBtnText.replace(/"/g, '\\"')}' button! 😊"
          }
          }`,
             options: {}
           },
           credentials: { facebookGraphApi: { id: credentialId } }
          });
          
          // Connect Button Switch
          connections[`Button Action Switch ${index + 1}`] = {
           main: [
             [{ node: `Fetch Context ${index + 1}`, type: "main", index: 0 }], // Check Follow -> Go back to Fetch Context
             [{ node: `Send Profile Link ${index + 1}`, type: "main", index: 0 }] // Visit Profile -> Send Link
           ]
          };
          
          // Update logic to connect Webhook to this Button Switch
          // We need to do this OUTSIDE the loop or handle it here by modifying the Webhook connections directly.
          // "Worker Webhook" connections are usually set at the very beginning or via `previousNode` logic.
          // But for `post_comment` trigger, `previousNode` is the switch/filter.
          // However, `Button Action Switch` should be triggered by a POSTBACK webhook event.
          // In the user's JSON, "Worker Webhook" connects to BOTH "Comment Switch" AND "Button Action Switch2".
          
          // If this is the FIRST action, we can append to Webhook connections.
          if (connections["Worker Webhook"]) {
           // Check if it already has connections
           if (!connections["Worker Webhook"].main) connections["Worker Webhook"].main = [[]];
           // Output 0 is the only one for Webhook.
           connections["Worker Webhook"].main[0].push({ node: `Button Action Switch ${index + 1}`, type: "main", index: 0 });
          } else {
           // Should exist, but if not:
           connections["Worker Webhook"] = { main: [[{ node: `Button Action Switch ${index + 1}`, type: "main", index: 0 }]] };
          }
          
          // For logic consistency:
          // The `Fetch Context` node is the entry point for the "Ask to Follow" flow. 
          // It's triggered by the main flow (e.g. comment) AND by the "Check Follow" button click.
          // We already connected the main flow to `Fetch Context` above (via `previousNode`).
          // And we just connected `Button Action Switch` -> `Fetch Context`.
          
          // RESET previousNode to null or something that indicates "end of this chain" because the chain splits?
          // Actually, subsequent actions in the configured list should probably NOT happen if we are in this flow. 
          // Or they should happen after "Send Reward".
          // If there are more actions after this one, they should attach to "Send Reward".
          
          if (triggerType !== 'post_comment') {
           previousNode = `Send Reward ${index + 1}`;
          }
          // Only updates previousNode to the "Success" branch.
          // Actions after "Ask to Follow" will only run if the user IS following (or clicks "I'm following" and passes check).
          
          } else {
          // --- STANDARD SEND DM LOGIC (EXISTING) ---
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
          nodeName = `Send DM ${index + 1}`;
          }
          */
          // END OLD LOGIC
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

      // --- 3. POSTBACK BRANCH GENERATION (Ask to Follow) ---
      if (postbackActions.length > 0) {
        console.log("--- GENERATING POSTBACK BRANCH ---");
        let postbackNodeX = 400;
        const postbackNodeY = 800; // Separate visual lane

        postbackActions.forEach((action: any, i: number) => {
          const index = action.index; // Original index
          const senderIdForContext = "{{ $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}"; // Postback always has sender
          const recipientId = "{{ $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}"; // Same

          // 3.1 Button Action Switch
          // Payloads: SEND_LINK (Teaser), CHECK_FOLLOW (AskRetry), VISIT_PROFILE (AskRetry)
          const switchRules = [
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "check", leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload }}", rightValue: "CHECK_FOLLOW", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Check Follow"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "visit", leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload }}", rightValue: "VISIT_PROFILE", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Visit Profile"
            },
            {
              conditions: {
                options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
                conditions: [{ id: "send", leftValue: "={{ $json.body.entry?.[0]?.messaging?.[0]?.postback?.payload }}", rightValue: "SEND_LINK", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true, outputKey: "Send Link"
            }
          ];

          const switchName = `Button Action Switch ${index + 1}`;
          nodes.push({
            id: `btn-switch-${index}`, name: switchName, type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [postbackNodeX, postbackNodeY],
            parameters: { rules: { values: switchRules }, options: { ignoreCase: true } }
          });

          // Connect "Event Type Switch" (Index 1: Button Click) to this.
          if (!connections["Event Type Switch"]) connections["Event Type Switch"] = { main: [[], []] };
          if (!connections["Event Type Switch"].main[1]) connections["Event Type Switch"].main[1] = [];
          connections["Event Type Switch"].main[1].push({ node: switchName, type: "main", index: 0 });

          postbackNodeX += 250;

          // 3.2 Fetch Context
          const fetchName = `Fetch Context ${index + 1}`;
          nodes.push({
            id: `fetch-context-${index}`, name: fetchName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [postbackNodeX, postbackNodeY],
            parameters: {
              url: `=https://graph.instagram.com/v24.0/${senderIdForContext}`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendQuery: true, queryParameters: { parameters: [{ name: "fields", value: "id,username,name,follower_count,is_user_follow_business,is_business_follow_user" }] },
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Switch (Check Follow) AND (Send Link) to Fetch Context
          if (!connections[switchName]) connections[switchName] = { main: [[], [], []] };
          connections[switchName].main[0].push({ node: fetchName, type: "main", index: 0 }); // Check Follow
          connections[switchName].main[2].push({ node: fetchName, type: "main", index: 0 }); // Send Link

          postbackNodeX += 250;

          // 3.3 Extract Status
          const extractName = `Extract Status ${index + 1}`;
          nodes.push({
            id: `extract-status-${index}`, name: extractName, type: "n8n-nodes-base.code", typeVersion: 2,
            position: [postbackNodeX, postbackNodeY],
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
          const ifName = `Is Following? ${index + 1}`;
          nodes.push({
            id: `is-following-${index}`, name: ifName, type: "n8n-nodes-base.if", typeVersion: 2.1,
            position: [postbackNodeX, postbackNodeY],
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

          // 3.5 REWARD (True Branch) - Reconstruct Reward DM
          const text = action.title || "Hello!";
          const subtitle = action.subtitle || action.messageTemplate || "";
          const imageUrl = action.imageUrl || "";
          const hasButtons = action.actionButtons && action.actionButtons.length > 0;
          const isRichMessage = hasButtons || imageUrl;
          let jsonBody = "";

          if (isRichMessage) {
            const elementsButtons: any[] = [];
            if (hasButtons) {
              action.actionButtons.forEach((b: any) => {
                const btnType = b.action || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                else elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
              });
            }
            const messagePayload = {
              recipient: { id: recipientId },
              message: { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: text, ...(imageUrl ? { image_url: imageUrl } : {}), subtitle: subtitle, buttons: elementsButtons }] } } }
            };
            jsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
          } else {
            jsonBody = `={ "recipient": { "id": "${recipientId}" }, "message": { "text": "${text.replace(/"/g, '\\"')}" } }`;
          }

          const rewardName = `Send Reward ${index + 1}`;
          nodes.push({
            id: `act-reward-${index}`, name: rewardName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [postbackNodeX, postbackNodeY - 100],
            parameters: { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: jsonBody, options: {} },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // 3.6 ASK (False Branch) - Reconstruct Ask Message
          const notFollowingText = action.askToFollowMessage || "Oops! Looks like you haven't followed me yet 👀\\n\\nIt would mean a lot if you could visit my profile and hit that follow button 😊.";
          const followBtnText = action.askToFollowBtnText || "I'm following ✅";
          const notFollowingBody = `={ "recipient": { "id": "${recipientId}" }, "message": { "attachment": { "type": "template", "payload": { "template_type": "generic", "elements": [ { "title": "${notFollowingText.replace(/"/g, '\\"')}", "buttons": [ { "type": "postback", "title": "Visit Profile", "payload": "VISIT_PROFILE" }, { "type": "postback", "title": "${followBtnText.replace(/"/g, '\\"')}", "payload": "CHECK_FOLLOW" } ] } ] } } } }`;

          const askName = `Ask to Follow ${index + 1}`;
          nodes.push({
            id: `act-ask-${index}`, name: askName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [postbackNodeX, postbackNodeY + 100],
            parameters: { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: notFollowingBody, options: {} },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Is Following
          connections[ifName] = { main: [[{ node: rewardName, type: "main", index: 0 }], [{ node: askName, type: "main", index: 0 }]] };

          // 3.7 Send Profile Link (Visit Profile)
          const profileLinkName = `Send Profile Link ${index + 1}`;
          nodes.push({
            id: `send-profile-${index}`, name: profileLinkName, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [postbackNodeX + 300, postbackNodeY + 200],
            parameters: { method: "POST", url: `https://graph.instagram.com/v24.0/me/messages`, authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi", sendBody: true, specifyBody: "json", jsonBody: `={ "recipient": { "id": "${recipientId}" }, "message": { "text": "Visit my profile here: https://instagram.com/${instagramAccount.username}\\n\\nAfter you follow, tap '${followBtnText.replace(/"/g, '\\"')}' button! 😊" } }`, options: {} },
            credentials: { facebookGraphApi: { id: credentialId } }
          });

          // Connect Switch (Visit Profile) to Profile Link
          connections[switchName].main[1].push({ node: profileLinkName, type: "main", index: 0 });

          postbackNodeX += 300;
        });
      }

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