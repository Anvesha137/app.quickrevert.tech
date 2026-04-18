import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { syncN8nCredential } from "../_shared/n8n.ts";

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
    const internalSecret = Deno.env.get("QUICKREVERT_INTERNAL_SECRET") || "";

    console.log("--- CONFIG DIAGNOSTICS ---");
    console.log(`SUPABASE_URL: ${supabaseUrl?.substring(0, 10)}...`);
    console.log(`SUPABASE_ANON_KEY (dots): ${(supabaseAnonKey?.match(/\./g) || []).length}`);
    console.log(`SUPABASE_SERVICE_ROLE_KEY (dots): ${(supabaseServiceKey?.match(/\./g) || []).length}`);
    console.log("------------------------");

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

    // 🔒 AUTOMATION LIMIT ENFORCEMENT — server-side check
    if (autoActivate && bodyTriggerType !== 'enable_analytics') {
      const { data: userData } = await supabase.from("user_limits").select("automation_limit, is_gifted").eq("user_id", userId).maybeSingle();
      const effectiveLimit = userData?.automation_limit; // null = unlimited

      if (effectiveLimit !== null && effectiveLimit !== undefined) {
        const { count: activeCount } = await supabase.from("automations")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("status", "active");

        if ((activeCount || 0) >= effectiveLimit) {
          console.log(`[LIMIT] User ${userId} has ${activeCount} active automations, limit is ${effectiveLimit}. BLOCKED.`);
          return new Response(JSON.stringify({
            error: `Active automation limit reached (${effectiveLimit}). ${userData?.is_gifted ? 'Your gifted premium allows ' + effectiveLimit + ' active automations.' : 'Please upgrade your plan.'}`
          }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    let instagramAccount;
    if (instagramAccountId) {
      const { data, error } = await supabase.from("instagram_accounts").select("*").eq("id", instagramAccountId).eq("status", "active").single();
      if (error || !data) throw new Error("Account not found");

      // 🔒 OWNERSHIP VERIFICATION
      if (data.user_id !== user.id) {
        console.error(`[SECURITY] User ${user.id} tried to access account ${instagramAccountId} owned by ${data.user_id}`);
        throw new Error("Unauthorized: You do not own this account");
      }

      instagramAccount = data;
    } else {
      const { data, error } = await supabase.from("instagram_accounts").select("*").eq("user_id", userId).eq("status", "active").order("connected_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !data) throw new Error("No active account");
      instagramAccount = data;
    }

    // --- CREDENTIAL MANAGEMENT ---
    const credentialId = await syncN8nCredential(supabase, instagramAccount);

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

      const actions = automationData?.actions || body.actions || [];
      const dmAction = actions.find((a: any) => a.type === 'send_dm') || {};
      const bodyCards = body.actions?.find((a: any) => a.type === 'send_dm')?.conversationCards || [];
      const dbCards = dmAction.conversationCards || [];
      const cards = bodyCards.length > 0 ? bodyCards : dbCards;

      // Detection for Hybrid: Post Comment trigger + Menu Flow message
      const isPostCommentMenuFlow = (bodyTriggerType === 'post_comment' || automationData?.trigger_type === 'post_comment') &&
        (dmAction?.dmType === 'conversation_flow' || (cards && cards.length > 0));

      const triggerType = (bodyTriggerType === 'conversation_flow' || (bodyTriggerType !== 'post_comment' && (cards && cards.length > 0)))
        ? 'conversation_flow'
        : (bodyTriggerType || automationData?.trigger_type || "user_dm");

      const hasAskToFollow = actions.some((a: any) => a.type === 'send_dm' && a.askToFollow);
      const leadAction = actions.find((a: any) => a.type === 'save_lead');
      const hasLeadManager = !!leadAction;
      const followUpAction = actions.find((a: any) => a.type === 'follow_up');
      const hasFollowUp = !!followUpAction && followUpAction.enabled;
      const dataToCollect = leadAction?.collectFields || leadAction?.dataToCollect || ['name', 'email'];
      const hasPhone = dataToCollect.includes('phone');
      const uniqueId = automationId ? automationId.replace(/-/g, '') : Date.now().toString();

      // --- COMMON VARIABLES ---
      const instagramUsername = instagramAccount.username;
      const senderExpr = "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}";
      const level0Buttons = dmAction.actionButtons || [];
      const triggerConfig = automationData?.trigger_config || {};

      // --- HELPERS ---
      const formatButtons = (btns: any[]) => (btns || []).filter(b => b.text).map(b => {
        if (b.buttonType === 'web_url') return { type: "web_url", url: b.url || '', title: b.text.substring(0, 20) };
        return { type: "postback", title: b.text.substring(0, 20), payload: b.payload || b.id };
      }).slice(0, 3);

      const getCardName = (cardId: string): string => {
        const l0Btn = level0Buttons.find((b: any) => b.payload === cardId);
        if (l0Btn?.text) return `Card: ${l0Btn.text}`;
        for (const c of cards) {
          const btn = (c.actionButtons || []).find((b: any) => b.payload === cardId);
          if (btn?.text) return `Card: ${btn.text}`;
        }
        return `Card: ${cardId}`;
      };

      const allPostbackButtons = [...(dmAction.actionButtons || [])];
      cards.forEach((c: any) => { if (c.actionButtons) allPostbackButtons.push(...c.actionButtons); });
      const uniquePayloads = Array.from(new Set(
        allPostbackButtons.filter((b: any) => b.buttonType === 'postback' && b.payload).map((b: any) => b.payload)
      ));

      // --- HYBRID POST COMMENT + MENU FLOW TEMPLATE ---
      if (isPostCommentMenuFlow) {
        console.log(`[TEMPLATE] Building Hybrid Post Comment + Menu Flow workflow`);

        const replyAction = (automationData?.actions || []).find((a: any) => a.type === 'reply_to_comment');
        const replyTemplates = replyAction?.replyTemplates && replyAction.replyTemplates.length > 0
          ? replyAction.replyTemplates
          : ["Ayyy check your DMs 👀✨", "Just dropped you a message 💌🔥", "Doneee, sent you the details 🫶📩", "You got a lil surprise in your inbox 😌💫"];

        const hybridNodes: any[] = [
          // 1. Worker Webhook
          {
            "parameters": { "httpMethod": "POST", "path": webhookPath, "options": {} },
            "id": "webhook-node", "name": "Worker Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2.1,
            "position": [-1264, -1184], "webhookId": webhookPath
          },
          // 2. Event Type Router
          {
            "parameters": {
              "rules": {
                "values": [
                  {
                    "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "leftValue": "={{ $json.body.entry[0].changes[0].field }}", "rightValue": "comments", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" },
                    "renameOutput": true, "outputKey": "comments"
                  },
                  {
                    "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "leftValue": "={{ $json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}", "rightValue": "", "operator": { "type": "string", "operation": "notEmpty", "singleValue": true } }], "combinator": "and" },
                    "renameOutput": true, "outputKey": "postback"
                  }
                ]
              }, "options": {}
            },
            "id": "event-router", "name": "Event Type Router", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [-1040, -1184]
          }
        ];

        // --- BRANCH 1: COMMENTS ---
        let commentsAnchor = "Event Type Router";
        let commentsAnchorIndex = 0;

        // 1.1 Post Filter Switch (if specific posts)
        const specificPosts = triggerConfig.postsType === 'specific' ? (triggerConfig.specificPosts || []) : [];
        if (specificPosts.length > 0) {
          hybridNodes.push({
            "parameters": {
              "rules": {
                "values": [{
                  "conditions": {
                    "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 },
                    "conditions": specificPosts.map((id: string, i: number) => ({
                      "id": `post-${i}`,
                      "leftValue": "={{ $(\'Worker Webhook\').item.json.body.entry[0].changes[0].value.media.id }}",
                      "rightValue": id,
                      "operator": { "type": "string", "operation": "equals" }
                    })),
                    "combinator": "or"
                  }
                }]
              }, "options": { "ignoreCase": true }
            },
            "id": "post-filter", "name": "Post Filter Switch", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [-816, -416]
          });
          commentsAnchor = "Post Filter Switch";
          commentsAnchorIndex = 0;
        }

        // 1.2 Loop Protection Switch
        hybridNodes.push({
          "parameters": {
            "rules": {
              "values": [{
                "conditions": {
                  "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 3 },
                  "conditions": [{ "id": "loop-check-1", "leftValue": "={{ $json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}", "rightValue": instagramUsername, "operator": { "type": "string", "operation": "notEquals" } }],
                  "combinator": "and"
                }
              }]
            }, "options": { "ignoreCase": true }
          },
          "id": "loop-protection", "name": "Loop Protection Switch", "type": "n8n-nodes-base.switch", "typeVersion": 3.4, "position": [-592, -416]
        });

        // 1.3 Round Robin Picker
        hybridNodes.push({
          "parameters": {
            "jsCode": `const replies = ${JSON.stringify(replyTemplates)};
const username = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.username;

if (typeof $getWorkflowStaticData === 'function') {
  const staticData = $getWorkflowStaticData('global');
  if (staticData.replyIndex === undefined) staticData.replyIndex = 0;
  const index = staticData.replyIndex;
  staticData.replyIndex = (index + 1) % replies.length;
  const chosenReply = replies[index].replace('{username}', username).replace('@{username}', '@' + username);
  
  // 🔒 Tag Ownership
  if (!staticData.leads) staticData.leads = {};
  const senderId = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id;
  staticData.leads[senderId] = { state: 'waiting_hybrid', owner: '${uniqueId}' };

  return [{ json: { chosenReply, index } }];
} else {
  const chosenReply = replies[0].replace('{username}', username).replace('@{username}', '@' + username);
  return [{ json: { chosenReply, index: 0 } }];
}`
          },
          "id": "picker", "name": "Round Robin Picker", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-368, -512]
        });

        // 1.4 Reply to Comment
        hybridNodes.push({
          "parameters": {
            "method": "POST",
            "url": "=https://graph.instagram.com/v24.0/{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}/replies",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "facebookGraphApi",
            "sendBody": true,
            "specifyBody": "json",
            "jsonBody": "={\n  \"message\": \"{{ $json.chosenReply }}\"\n}",
            "options": {}
          },
          "id": "reply-node", "name": "Reply to Comment", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3, "position": [-144, -512],
          "credentials": { "facebookGraphApi": { "id": credentialId } }
        });

        // 1.5 Send Welcome DM (Initial Menu)
        const welcomeBody = {
          recipient: { comment_id: "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}" },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [{
                  title: (dmAction.title || "Hi! How can I help you today? 👋").substring(0, 400),
                  subtitle: (dmAction.subtitle || "Pick one of the options below").substring(0, 400),
                  buttons: formatButtons(dmAction.actionButtons || [])
                }]
              }
            }
          }
        };
        hybridNodes.push({
          "parameters": {
            "method": "POST",
            "url": "https://graph.instagram.com/v24.0/me/messages",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "facebookGraphApi",
            "sendBody": true,
            "specifyBody": "json",
            "jsonBody": `=${JSON.stringify(welcomeBody, null, 2)}`,
            "options": {}
          },
          "id": "welcome-dm", "name": "Send Welcome DM", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3, "position": [-368, -320],
          "credentials": { "facebookGraphApi": { "id": credentialId } }
        });

        // 1.5.1 Init Hybrid State (Tag Ownership)
        hybridNodes.push({
          "parameters": { "jsCode": "const senderId = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_hybrid', owner: '" + uniqueId + "' };\nreturn [{ json: { senderId } }];" },
          "id": "init-hybrid-state", "name": "Init Hybrid State", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-368, -150]
        });

        // --- BRANCH 2: POSTBACKS ---
        // 2.1 Extract Payload
        hybridNodes.push({
          "parameters": { "jsCode": "const entry = $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0];\nconst payload = entry?.postback?.payload || entry?.message?.quick_reply?.payload || entry?.message?.text || '';\nconst senderId = entry?.sender?.id || '';\nconst staticData = $getWorkflowStaticData('global');\nconst lead = (staticData.leads || {})[senderId] || { state: 'new' };\n\n// 🔒 Ownership Guard\nif (!lead.owner || lead.owner !== '" + uniqueId + "') {\n  return []; \n}\n\nreturn [{ json: { payload, senderId } }];" },
          "id": "extract-payload", "name": "Extract Payload", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-816, -1952]
        });

        // 2.2 Payload Router
        hybridNodes.push({
          "parameters": {
            "rules": {
              "values": uniquePayloads.map((p: string) => ({
                "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": (p || '').toLowerCase().replace(/[^a-z0-9]/g, ''), "leftValue": "={{ $json.payload }}", "rightValue": p, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": p
              }))
            }, "options": { "ignoreCase": true }
          },
          "id": "payload-router", "name": "Payload Router", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [-592, -2144]
        });

        // 2.3 Card Nodes
        cards.forEach((card: any, idx: number) => {
          const cardNodeName = getCardName(card.id);
          const cardPostbacks = formatButtons(card.actionButtons);
          const hasPostbacks = cardPostbacks.some((b: any) => b.type === 'postback');

          let cardJsonBody: string;
          if (hasPostbacks) {
            const cardBody = {
              recipient: { id: senderExpr },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [{
                      title: (card.messageTemplate || "Select an option").substring(0, 400),
                      subtitle: (card.title || "Choose below").substring(0, 400),
                      buttons: cardPostbacks
                    }]
                  }
                }
              }
            };
            cardJsonBody = `=${JSON.stringify(cardBody, null, 2)}`;
          } else {
            const textBody = { recipient: { id: senderExpr }, message: { text: card.messageTemplate || "Thank you!" } };
            cardJsonBody = `=${JSON.stringify(textBody, null, 2)}`;
          }

          hybridNodes.push({
            "parameters": { "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json", "jsonBody": cardJsonBody, "options": {} },
            "id": `cf-card-${card.id}`, "name": cardNodeName, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3,
            "position": [-368, -3200 + (idx * 200)],
            "credentials": { "facebookGraphApi": { "id": credentialId } }
          });
        });

        // --- HYBRID CONNECTIONS ---
        const hybridConnections: any = {
          "Worker Webhook": { "main": [[{ "node": "Event Type Router", "type": "main", "index": 0 }]] },
          "Event Type Router": {
            "main": [
              [{ "node": specificPosts.length > 0 ? "Post Filter Switch" : "Loop Protection Switch", "type": "main", "index": 0 }],
              [{ "node": "Extract Payload", "type": "main", "index": 0 }]
            ]
          },
          "Post Filter Switch": { "main": [[{ "node": "Loop Protection Switch", "type": "main", "index": 0 }]] },
          "Loop Protection Switch": {
            "main": [[
              { "node": "Round Robin Picker", "type": "main", "index": 0 },
              { "node": "Send Welcome DM", "type": "main", "index": 0 }
            ]]
          },
          "Round Robin Picker": { "main": [[{ "node": "Reply to Comment", "type": "main", "index": 0 }]] },
          "Reply to Comment": { "main": [[{ "node": "Init Hybrid State", "type": "main", "index": 0 }]] },
          "Extract Payload": { "main": [[{ "node": "Payload Router", "type": "main", "index": 0 }]] },
          "Payload Router": {
            "main": uniquePayloads.map((p: string) => {
              const targetName = getCardName(p);
              return [{ "node": targetName, "type": "main", "index": 0 }];
            })
          }
        };

        if (hasFollowUp) {
          hybridNodes.push({
            id: "act-wait-followup", name: "Wait for Followup", type: "n8n-nodes-base.wait", typeVersion: 1, position: [0, -1000],
            parameters: { amount: followUpAction.delayValue || 30, unit: followUpAction.delayUnit || "minutes" }
          });
          const followUpButtons = (followUpAction.actionButtons || []).slice(0, 3).map((b: any) => ({
            type: "web_url",
            url: b.url,
            title: (b.text || "Open").substring(0, 20)
          }));

          const followUpPayload = followUpButtons.length > 0 ? {
            recipient: { id: "{{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id }}" },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: (followUpAction.message || "").substring(0, 80),
                    subtitle: "Powered by Quickrevert.tech",
                    buttons: followUpButtons
                  }]
                }
              }
            }
          } : {
            recipient: { id: "{{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id }}" },
            message: { text: followUpAction.message || "" }
          };

          hybridNodes.push({
            id: "act-check-followup-status", name: "Check Followup Status", type: "n8n-nodes-base.code", typeVersion: 2, position: [100, -1000],
            parameters: {
              jsCode: `const senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id;
const staticData = $getWorkflowStaticData('global');
const leads = staticData.leads || {};
const lead = leads[senderId];

// 1. Ownership Guard
if (!lead || lead.owner !== '${uniqueId}') return [];

// 2. Completion Guard: Stop if lead is already 'saved'
if (lead.state === 'saved') return [];

return [{ json: { senderId } }];`
            }
          });

          hybridNodes.push({
            id: "act-send-followup", name: "Send Followup DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [300, -1000],
            parameters: {
              method: "POST", url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `=${JSON.stringify(followUpPayload, null, 2)}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
          hybridConnections["Event Type Router"].main[0].push({ node: "Wait for Followup", type: "main", index: 0 });
          hybridConnections["Wait for Followup"] = { main: [[{ node: "Check Followup Status", type: "main", index: 0 }]] };
          hybridConnections["Check Followup Status"] = { main: [[{ node: "Send Followup DM", type: "main", index: 0 }]] };
        }

        return { name: finalWorkflowName, nodes: hybridNodes, connections: hybridConnections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      // Lead Manager Flow (Highest Priority for Lead collection)
      if (hasLeadManager) {
        console.log(`[TEMPLATE] Building Lead Manager workflow`);
        const isPostCommentLeadManager = (bodyTriggerType === 'post_comment' || automationData?.trigger_type === 'post_comment') && hasLeadManager;
        const lmCredName = `Instagram - ${instagramAccount.username} (${instagramAccount.instagram_user_id})`;
        const lmSpreadsheetUrl = leadAction.spreadsheetUrl || '';
        const lmMessages = leadAction.messages || {};
        const docMatch = lmSpreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        const documentId = docMatch ? docMatch[1] : '';

        const lmNodes: any[] = [
          {
            "id": "webhook-node",
            "webhookId": webhookPath,
            "parameters": { "httpMethod": "POST", "path": webhookPath, "responseMode": "onReceived", "options": {} },
            "name": "Worker Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2.1,
            "position": [700, 2800]
          },
          {
            "parameters": { "url": "https://graph.instagram.com/v24.0/me?fields=id,username", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "options": {} },
            "name": "Fetch Usernames1",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [950, 2800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          ...(isPostCommentLeadManager && triggerConfig?.postsType === 'specific' && (triggerConfig.specificPosts || []).length > 0 ? [{
            "parameters": {
              "rules": {
                "values": [{
                  "conditions": {
                    "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 },
                    "conditions": (triggerConfig.specificPosts || []).map((id: string, i: number) => ({
                      "id": `post-${i}`,
                      "leftValue": "={{ $(\'Worker Webhook\').item.json.body.entry[0].changes[0].value.media.id }}",
                      "rightValue": id,
                      "operator": { "type": "string", "operation": "equals" }
                    })),
                    "combinator": "or"
                  }
                }]
              }, "options": { "ignoreCase": true }
            },
            "id": "post-filter-lm", "name": "Post Filter Switch", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [1200, 3100]
          }] : []),
          {
            "parameters": {
              "rules": {
                "values": [
                  {
                    "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "is-postback", "leftValue": "={{ $('Worker Webhook').first().json.body.sub_type }}", "rightValue": "postback", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" },
                    "renameOutput": true, "outputKey": "Postback"
                  },
                  {
                    "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "is-dm", "leftValue": "={{ $('Worker Webhook').first().json.body.sub_type }}", "rightValue": "postback", "operator": { "type": "string", "operation": "notEquals" } }, { "id": "sender-not-bot", "leftValue": "={{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id }}", "rightValue": "={{ $('Fetch Usernames1').first().json.id }}", "operator": { "type": "string", "operation": "notEquals" } }, { "id": "has-text", "leftValue": "={{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.message?.text }}", "rightValue": "", "operator": { "type": "string", "operation": "exists", "singleValue": true } }], "combinator": "and" },
                    "renameOutput": true, "outputKey": "Text DM"
                  },
                  ...(isPostCommentLeadManager ? [{
                    "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "is-comment", "leftValue": "={{ $('Worker Webhook').first().json.body.sub_type }}", "rightValue": "comments", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" },
                    "renameOutput": true, "outputKey": "comments"
                  }] : [])
                ]
              },
              "options": { "ignoreCase": true }
            },
            "name": "Entry Switch",
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3.3,
            "position": [1200, 2800]
          },
          {
            "parameters": { "jsCode": "const payload = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.postback?.payload || '';\nconst senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || '';\nreturn [{ json: { payload, senderId } }];" },
            "name": "Extract Postback",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1450, 2600]
          },
          {
            "parameters": {
              "rules": {
                "values": [
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "start", "leftValue": "={{ $json.payload }}", "rightValue": "START_FLOW_" + uniqueId, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "START_FLOW" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "change-name", "leftValue": "={{ $json.payload }}", "rightValue": "CHANGE_NAME_" + uniqueId, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "CHANGE_NAME" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "change-email", "leftValue": "={{ $json.payload }}", "rightValue": "CHANGE_EMAIL_" + uniqueId, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "CHANGE_EMAIL" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "change-phone", "leftValue": "={{ $json.payload }}", "rightValue": "CHANGE_PHONE_" + uniqueId, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "CHANGE_PHONE" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "confirm", "leftValue": "={{ $json.payload }}", "rightValue": "CONFIRM_SAVE_" + uniqueId, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "CONFIRM_SAVE" }
                ]
              },
              "options": { "ignoreCase": true }
            },
            "name": "Postback Router",
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3.3,
            "position": [1700, 2600]
          },
          {
            "parameters": { "jsCode": "const msg = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.message?.text?.trim() || '';\nconst senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || '';\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nconst lead = staticData.leads[senderId] || { state: 'new', name: '', email: '', phone: '' };\n\n// 🔒 Ownership Guard: Only respond if this workflow owns the lead\nif (!lead.owner || lead.owner !== '" + uniqueId + "') {\n  return []; \n}\n\nreturn [{ json: { senderId, msg, state: lead.state, name: lead.name, email: lead.email, phone: lead.phone } }];" },
            "name": "Read State",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1450, 3000]
          },
          {
            "parameters": {
              "rules": {
                "values": [
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "waiting-name", "leftValue": "={{ $json.state }}", "rightValue": "waiting_name", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "Got Name" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "waiting-email", "leftValue": "={{ $json.state }}", "rightValue": "waiting_email", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "Got Email" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "waiting-phone", "leftValue": "={{ $json.state }}", "rightValue": "waiting_phone", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "Got Phone" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "new-or-done", "leftValue": "={{ $json.state }}", "rightValue": "new", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "New" }
                ]
              },
              "options": { "ignoreCase": true }
            },
            "name": "State Router",
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3.3,
            "position": [1700, 3000]
          },
          {
            "parameters": { "jsCode": "const senderId = $json.senderId;\nconst name = $json.msg;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_email', name: name, email: '', phone: '', owner: '" + uniqueId + "' };\nreturn [{ json: { senderId, name } }];" },
            "name": "Save Name",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 2800]
          },
          {
            "parameters": { "jsCode": `const senderId = $json.senderId;\nconst msg = $json.msg;\nconst name = $json.name;\nconst emailRegex = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/;\nconst emailMatch = msg.match(emailRegex);\nconst email = emailMatch ? emailMatch[0] : msg;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: '${hasPhone ? 'waiting_phone' : 'waiting_confirm'}', name: name, email: email, phone: '', owner: '${uniqueId}' };\nreturn [{ json: { senderId, name, email } }];` },
            "name": "Save Email",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 3000]
          },
          {
            "parameters": { "jsCode": "const senderId = $json.senderId;\nconst msg = $json.msg;\nconst name = $json.name;\nconst email = $json.email;\nconst phoneRaw = msg.replace(/[^\\d+\\-() ]/g, '').trim();\nconst phone = phoneRaw || msg;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_confirm', name: name, email: email, phone: phone, owner: '" + uniqueId + "' };\nreturn [{ json: { senderId, name, email, phone } }];" },
            "name": "Save Phone",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 3200]
          },
          {
            "parameters": { "jsCode": "const senderId = $json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_name', name: '', email: '', phone: '', owner: '" + uniqueId + "' };\nreturn [{ json: { senderId } }];" },
            "name": "Init Lead",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 3400]
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [{\n          \"title\": \"" + (lmMessages.confirmName || "Awesome, {{name}}! 😊").split('\n')[0].replace('{{name}}', '{{ $json.name }}').replace(/"/g, '\\\"') + "\",\n          \"subtitle\": \"" + ((lmMessages.confirmName || "").includes('\n') ? lmMessages.confirmName.split('\n')[1].replace('{{name}}', '{{ $json.name }}') : "If you typed your name wrong, fix it below.").replace(/"/g, '\\\"') + "\",\n          \"buttons\": [\n            { \"type\": \"postback\", \"title\": \"" + (lmMessages.btnChangeName || "✏️ Change First Name").replace(/"/g, '\\\"') + "\", \"payload\": \"CHANGE_NAME_" + uniqueId + "\" }\n          ]\n        }]\n      }\n    }\n  }\n}",
              "options": {}
            },
            "name": "Confirm Name + Ask Email",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 2800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $('Worker Webhook').first().json.body.entry[0].messaging[0].sender.id }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askEmail || "What email should we use to get in touch with you? 📧").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Email",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2450, 2800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          ...(hasPhone ? [
            {
              "parameters": {
                "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
                "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [{\n          \"title\": \"" + (lmMessages.confirmEmail || "Perfect, {{ $json.name }}! 📧").split('\n')[0].replace('{{name}}', '{{ $json.name }}').replace(/"/g, '\\\"') + "\",\n          \"subtitle\": \"" + ((lmMessages.confirmEmail || "").includes('\n') ? lmMessages.confirmEmail.split('\n')[1].replace('{{name}}', '{{ $json.name }}') : "Email saved: {{ $json.email }}").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\",\n          \"buttons\": [\n            { \"type\": \"postback\", \"title\": \"" + (lmMessages.btnChangeEmail || "✏️ Change Email").replace(/"/g, '\\\"') + "\", \"payload\": \"CHANGE_EMAIL_" + uniqueId + "\" }\n          ]\n        }]\n      }\n    }\n  }\n}",
                "options": {}
              },
              "name": "Confirm Email + Ask Phone",
              "type": "n8n-nodes-base.httpRequest",
              "typeVersion": 4.3,
              "position": [2200, 3000],
              "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
            },
            {
              "parameters": {
                "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
                "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $('Worker Webhook').first().json.body.entry[0].messaging[0].sender.id }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askPhone || "What phone number should we use to contact you? 📱").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
                "options": {}
              },
              "name": "Ask Phone",
              "type": "n8n-nodes-base.httpRequest",
              "typeVersion": 4.3,
              "position": [2450, 3000],
              "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
            }
          ] : []),
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [{\n          \"title\": \"" + (lmMessages.confirmAll ? lmMessages.confirmAll.split('\n')[0].replace('{{name}}', '{{ $json.name }}').replace('{{email}}', '{{ $json.email }}').replace('{{phone}}', '{{ $json.phone }}') : "Perfect! Just confirming ✅").replace(/"/g, '\\\"') + "\",\n          \"subtitle\": \"Powered by Quickrevert.tech\",\n          \"buttons\": [\n            { \"type\": \"postback\", \"title\": \"" + (lmMessages.btnYesLooksGood || "✅ Yes, looks good!").replace(/"/g, '\\\"') + "\", \"payload\": \"CONFIRM_SAVE_" + uniqueId + "\" },\n            { \"type\": \"postback\", \"title\": \"" + (lmMessages.btnChangeEmail || "✏️ Change Email").replace(/"/g, '\\\"') + "\", \"payload\": \"CHANGE_EMAIL_" + uniqueId + "\" },\n            " + (hasPhone ? "{ \"type\": \"postback\", \"title\": \"" + (lmMessages.btnChangePhone || "✏️ Change Phone").replace(/"/g, '\\\"') + "\", \"payload\": \"CHANGE_PHONE_" + uniqueId + "\" }" : "{ \"type\": \"postback\", \"title\": \"" + (lmMessages.btnChangeName || "✏️ Change Name").replace(/"/g, '\\\"') + "\", \"payload\": \"CHANGE_NAME_" + uniqueId + "\" }") + "\n          ]\n        }]\n      }\n    }\n  }\n}",
              "options": {}
            },
            "name": "Confirm Details",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 3200],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askName || "👋 Hey! Thanks for reaching out. What's your first name? 😊").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Name",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 3400],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": { "jsCode": "const senderId = $('Extract Postback').first().json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nconst existing = staticData.leads[senderId] || {};\nstaticData.leads[senderId] = { state: 'waiting_name', name: '', email: existing.email || '', phone: existing.phone || '' };\nreturn [{ json: { senderId } }];" },
            "name": "Reset Name State",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 2200]
          },
          {
            "parameters": { "jsCode": "const senderId = $('Extract Postback').first().json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nconst existing = staticData.leads[senderId] || {};\nstaticData.leads[senderId] = { state: 'waiting_email', name: existing.name || '', email: '', phone: existing.phone || '' };\nreturn [{ json: { senderId, name: existing.name || '' } }];" },
            "name": "Reset Email State",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 2400]
          },
          {
            "parameters": { "jsCode": "const senderId = $('Extract Postback').first().json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nconst existing = staticData.leads[senderId] || {};\nstaticData.leads[senderId] = { state: 'waiting_phone', name: existing.name || '', email: existing.email || '', phone: '' };\nreturn [{ json: { senderId, name: existing.name || '', email: existing.email || '' } }];" },
            "name": "Reset Phone State",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 2600]
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askNameAgain || "No problem! What's your correct first name? ✏️").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Name Again",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 2200],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askEmailAgain || "Sure! What's the correct email address? 📧").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Email Again",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 2400],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $json.senderId }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askPhoneAgain || "Sure! What's the correct phone number? 📱").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Phone Again",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 2600],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": { "jsCode": "const senderId = $('Extract Postback').first().json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nconst lead = staticData.leads[senderId] || {};\nstaticData.leads[senderId] = { state: 'saved', name: lead.name, email: lead.email, phone: lead.phone || '' };\nconst now = new Date();\nconst timestamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });\nreturn [{ json: { senderId, name: lead.name, email: lead.email, phone: lead.phone || '', timestamp } }];" },
            "name": "Confirm Save",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 1800]
          },
          {
            "parameters": { "url": "=https://graph.instagram.com/v24.0/{{ $json.senderId }}?fields=id,username", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "options": {} },
            "name": "Fetch IG Profile",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 1800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": { "jsCode": "const profile = $('Fetch IG Profile').first().json;\nconst confirmData = $('Confirm Save').first().json;\nreturn [{\n  json: {\n    \"Timestamp\": confirmData.timestamp,\n    \"Instagram Username\": '@' + (profile.username || 'unknown'),\n    \"Instagram ID\": profile.id || confirmData.senderId,\n    \"Name\": confirmData.name,\n    \"Email\": confirmData.email,\n    \"Phone\": confirmData.phone || '',\n    \"Type\": \"lead\",\n    \"Raw Message\": confirmData.name + ' | ' + confirmData.email + ' | ' + (confirmData.phone || '')\n  }\n}];" },
            "name": "Prepare Row",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2450, 1800]
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $('Extract Postback').first().json.senderId }}\" },\n  \"message\": {\n    \"attachment\": {\n      \"type\": \"template\",\n      \"payload\": {\n        \"template_type\": \"generic\",\n        \"elements\": [{\n          \"title\": \"👋 Hey! Ready to connect?\",\n          \"subtitle\": \"Tap below to get started!\",\n          \"buttons\": [\n            { \"type\": \"postback\", \"title\": \"🚀 Yes, let's go!\", \"payload\": \"START_FLOW\" }\n          ]\n        }]\n      }\n    }\n  }\n}",
              "options": {}
            },
            "name": "Send Start Message",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2200, 2000],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": { "jsCode": "const senderId = $('Extract Postback').first().json.senderId;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_name', name: '', email: '', phone: '', owner: '" + uniqueId + "' };\nreturn [{ json: { senderId } }];" },
            "name": "Init From Start",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1950, 2000]
          },
          {
            "parameters": {
              "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $json.senderId }}\" },\n  \"message\": { \n    \"text\": \"" + (lmMessages.finalMessage || dmAction.title || "🎉 We've got you, {{name}}!\\n\\nYour details have been saved.").replace('{{name}}', '{{ $json.name }}').replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\"\n  }\n}",
              "options": {}
            },
            "name": "Final Confirmation DM",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [3700, 1800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          },
          {
            "parameters": {
              "method": "POST",
              "url": supabaseUrl + "/functions/v1/save-lead",
              "sendHeaders": true,
              "headerParameters": {
                "parameters": [
                  { "name": "apikey", "value": supabaseAnonKey },
                  { "name": "Authorization", "value": "Bearer " + supabaseAnonKey },
                  { "name": "x-quickrevert-secret", "value": internalSecret },
                  { "name": "Content-Type", "value": "application/json" }
                ]
              },
              "sendBody": true,
              "specifyBody": "json",
              "jsonBody": "={\n  \"automation_id\": \"" + automationId + "\",\n  \"instagram_username\": \"{{ ($json.username || 'unknown') }}\",\n  \"full_name\": \"{{ $('Confirm Save').first().json.name }}\",\n  \"email\": \"{{ $('Confirm Save').first().json.email }}\",\n  \"phone\": \"{{ $('Confirm Save').first().json.phone || '' }}\",\n  \"metadata\": { \"source\": \"n8n_workflow\" }\n}",
              "options": {}
            },
            "name": "Save to Lead Manager DB",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [2450, 2000]
          }
        ];

        if (isPostCommentLeadManager) {
          lmNodes.push({
            "parameters": {
              "rules": {
                "values": [{
                  "conditions": {
                    "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 3 },
                    "conditions": [{ "id": "loop-check-1", "leftValue": "={{ $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.username }}", "rightValue": instagramAccount.username, "operator": { "type": "string", "operation": "notEquals" } }],
                    "combinator": "and"
                  }
                }]
              }, "options": { "ignoreCase": true }
            },
            "id": "loop-protection-lm", "name": "Loop Protection Switch", "type": "n8n-nodes-base.switch", "typeVersion": 3.4, "position": [1600, 3100]
          });

          const replyAction = (automationData?.actions || []).find((a: any) => a.type === 'reply_to_comment');
          const replyTemplatesForLead = replyAction?.replyTemplates && replyAction.replyTemplates.length > 0 
            ? replyAction.replyTemplates 
            : ["Ayyy check your DMs 👀✨","Just dropped you a message 💌🔥","Doneee, sent you the details 🫶📩","You got a lil surprise in your inbox 😌💫"];
          
          lmNodes.push({
            "parameters": {
              "jsCode": "// Round Robin Picker\nconst replies = " + JSON.stringify(replyTemplatesForLead) + ";\nconst username = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.username;\n\nif (typeof $getWorkflowStaticData === 'function') {\n  const staticData = $getWorkflowStaticData('global');\n  if (staticData.replyIndex === undefined) staticData.replyIndex = 0;\n  const index = staticData.replyIndex;\n  staticData.replyIndex = (index + 1) % replies.length;\n  // User asked for exact snippet logic: replace {username}\n  const chosenReply = replies[index].replace('{username}', username).replace('@{username}', '@' + username);\n  return [{ json: { chosenReply, index } }];\n} else {\n  // Fallback if static data not available\n  const chosenReply = replies[0].replace('{username}', username).replace('@{username}', '@' + username);\n  return [{ json: { chosenReply, index: 0 } }];\n}"
            },
            "id": "round-robin-picker-lm", "name": "Round Robin Picker", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1824, 3000]
          });

          lmNodes.push({
            "parameters": {
              "method": "POST", "url": "=https://graph.instagram.com/v24.0/{{ $('Worker Webhook').first().json.body.entry[0].changes[0].value.id }}/replies", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"message\": \"{{ $json.chosenReply }}\"\n}",
              "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "options": {}
            },
            "id": "reply-to-comment-lm", "name": "Reply To Comment", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3, "position": [2048, 3000],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          });

          lmNodes.push({
            "parameters": {
              "jsCode": "const senderId = $('Worker Webhook').first().json.body.entry[0].changes[0].value.from.id;\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.leads) staticData.leads = {};\nstaticData.leads[senderId] = { state: 'waiting_name', name: '', email: '', phone: '', owner: '" + uniqueId + "' };\nreturn [{ json: { senderId } }];"
            },
            "name": "Init Lead (From Comment)", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1824, 3200], "id": "init-lead-comment-lm"
          });

          lmNodes.push({
            "parameters": {
              "method": "POST", "url": "=https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json",
              "jsonBody": "={\n  \"recipient\": { \"comment_id\": \"{{ $('Worker Webhook').first().json.body.entry[0].changes[0].value.id }}\" },\n  \"message\": { \"text\": \"" + (lmMessages.askName || "👋 Hey! Thanks for reaching out. What's your first name? 😊").replace(/"/g, '\\\"').replace(/\n/g, '\\n') + "\" }\n}",
              "options": {}
            },
            "name": "Ask Name (From Comment)", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3, "position": [2048, 3200],
            "id": "ask-name-comment-lm",
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          });
        }

        // --- NEW: Hybrid Lead + DM Support ---
        const hasAutomatedDM = actions.some((a: any) => a.type === 'send_dm' && (a.title || (a.conversationCards && a.conversationCards.length > 0)));
        if (hasLeadManager && hasAutomatedDM) {
          const followUpButtons = formatButtons(dmAction.actionButtons || []);
          const hasPostbacks = followUpButtons.some((b: any) => b.type === 'postback');

          let followUpJsonBody: string;
          if (hasPostbacks) {
            const body = {
              recipient: { id: senderExpr },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [{
                      title: (dmAction.title || "Ready to explore more?").substring(0, 400),
                      subtitle: (dmAction.subtitle || "Choose an option below").substring(0, 400),
                      buttons: followUpButtons
                    }]
                  }
                }
              }
            };
            followUpJsonBody = `=${JSON.stringify(body, null, 2)}`;
          } else {
            const textBody = {
              recipient: { id: senderExpr },
              message: { text: (dmAction.title || "Thank you for connecting with us!").substring(0, 1000) }
            };
            followUpJsonBody = `=${JSON.stringify(textBody, null, 2)}`;
          }

          lmNodes.push({
            "parameters": {
              "method": "POST",
              "url": "https://graph.instagram.com/v24.0/me/messages",
              "authentication": "predefinedCredentialType",
              "nodeCredentialType": "facebookGraphApi",
              "sendBody": true,
              "specifyBody": "json",
              "jsonBody": followUpJsonBody,
              "options": {}
            },
            "name": "Lead Follow-up Message",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.3,
            "position": [3950, 1800],
            "credentials": { "facebookGraphApi": { "id": credentialId, "name": lmCredName } }
          });
        }

        const lmConnections: any = {
          "Worker Webhook": { "main": [[{ "node": "Fetch Usernames1", "type": "main", "index": 0 }]] },
          "Fetch Usernames1": { "main": [[{ "node": "Entry Switch", "type": "main", "index": 0 }]] },
          "Entry Switch": {
            "main": [
              [{ "node": "Extract Postback", "type": "main", "index": 0 }],
              [{ "node": "Read State", "type": "main", "index": 0 }],
              ...(isPostCommentLeadManager ? [
                [{ "node": (triggerConfig.postsType === 'specific' && (triggerConfig.specificPosts || []).length > 0) ? "Post Filter Switch" : "Loop Protection Switch", "type": "main", "index": 0 }]
              ] : [])
            ]
          },
          ...(isPostCommentLeadManager && (triggerConfig.postsType === 'specific' && (triggerConfig.specificPosts || []).length > 0) ? {
            "Post Filter Switch": { "main": [[{ "node": "Loop Protection Switch", "type": "main", "index": 0 }]] }
          } : {}),
          "Extract Postback": { "main": [[{ "node": "Postback Router", "type": "main", "index": 0 }]] },
          "Postback Router": { "main": [[{ "node": "Init From Start", "type": "main", "index": 0 }], [{ "node": "Reset Name State", "type": "main", "index": 0 }], [{ "node": "Reset Email State", "type": "main", "index": 0 }], [{ "node": "Reset Phone State", "type": "main", "index": 0 }], [{ "node": "Confirm Save", "type": "main", "index": 0 }]] },
          "Read State": { "main": [[{ "node": "State Router", "type": "main", "index": 0 }]] },
          "State Router": { "main": [[{ "node": "Save Name", "type": "main", "index": 0 }], [{ "node": "Save Email", "type": "main", "index": 0 }], [{ "node": "Save Phone", "type": "main", "index": 0 }], [{ "node": "Init Lead", "type": "main", "index": 0 }]] },
          "Save Name": { "main": [[{ "node": "Confirm Name + Ask Email", "type": "main", "index": 0 }]] },
          "Save Email": { "main": [[{ "node": hasPhone ? "Confirm Email + Ask Phone" : "Confirm Details", "type": "main", "index": 0 }]] },
          "Save Phone": { "main": [[{ "node": "Confirm Details", "type": "main", "index": 0 }]] },
          "Init Lead": { "main": [[{ "node": "Ask Name", "type": "main", "index": 0 }]] },
          "Confirm Name + Ask Email": { "main": [[{ "node": "Ask Email", "type": "main", "index": 0 }]] },
          "Confirm Email + Ask Phone": { "main": [[{ "node": "Ask Phone", "type": "main", "index": 0 }]] },
          "Confirm Details": { "main": [[{ "node": "Confirm Save", "type": "main", "index": 0 }]] },
          "Reset Name State": { "main": [[{ "node": "Ask Name Again", "type": "main", "index": 0 }]] },
          "Reset Email State": { "main": [[{ "node": "Ask Email Again", "type": "main", "index": 0 }]] },
          "Reset Phone State": { "main": [[{ "node": "Ask Phone Again", "type": "main", "index": 0 }]] },
          "Confirm Save": { "main": [[{ "node": "Fetch IG Profile", "type": "main", "index": 0 }]] },
          "Fetch IG Profile": { "main": [[{ "node": "Save to Lead Manager DB", "type": "main", "index": 0 }]] },
          "Save to Lead Manager DB": { "main": [[{ "node": "Prepare Row", "type": "main", "index": 0 }]] },
          "Prepare Row": { "main": [[{ "node": "Final Confirmation DM", "type": "main", "index": 0 }]] },
          "Final Confirmation DM": { "main": (hasLeadManager && hasAutomatedDM) ? [[{ "node": "Lead Follow-up Message", "type": "main", "index": 0 }]] : [] },
          "Init From Start": { "main": [[{ "node": "Send Start Message", "type": "main", "index": 0 }]] },
          "Send Start Message": { "main": [[{ "node": "Ask Name", "type": "main", "index": 0 }]] }
        };

        if (isPostCommentLeadManager) {
          lmConnections["Loop Protection Switch"] = {
            "main": [[
              { "node": "Round Robin Picker", "type": "main", "index": 0 },
              { "node": "Init Lead (From Comment)", "type": "main", "index": 0 }
            ]]
          };
          lmConnections["Round Robin Picker"] = { "main": [[{ "node": "Reply To Comment", "type": "main", "index": 0 }]] };
          lmConnections["Init Lead (From Comment)"] = { "main": [[{ "node": "Ask Name (From Comment)", "type": "main", "index": 0 }]] };
        }

        if (hasFollowUp) {
          lmNodes.push({
            id: "act-wait-followup", name: "Wait for Followup", type: "n8n-nodes-base.wait", typeVersion: 1, position: [3000, 2800],
            parameters: { amount: followUpAction.delayValue || 30, unit: followUpAction.delayUnit || "minutes" }
          });
          const followUpButtons = (followUpAction.actionButtons || []).slice(0, 3).map((b: any) => ({
            type: "web_url",
            url: b.url,
            title: (b.text || "Open").substring(0, 20)
          }));

          const followUpPayload = followUpButtons.length > 0 ? {
            recipient: { id: "{{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id }}" },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: (followUpAction.message || "").substring(0, 80),
                    subtitle: "Powered by Quickrevert.tech",
                    buttons: followUpButtons
                  }]
                }
              }
            }
          } : {
            recipient: { id: "{{ $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id }}" },
            message: { text: followUpAction.message || "" }
          };

          lmNodes.push({
            id: "act-check-followup-status", name: "Check Followup Status", type: "n8n-nodes-base.code", typeVersion: 2, position: [100, 300],
            parameters: {
              jsCode: `const senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id;
const staticData = $getWorkflowStaticData('global');
const leads = staticData.leads || {};
const lead = leads[senderId];

// 1. Ownership Guard
if (!lead || lead.owner !== '${uniqueId}') return [];

// 2. Completion Guard: Stop if lead is already 'saved'
if (lead.state === 'saved') return [];

return [{ json: { senderId } }];`
            }
          });

          lmNodes.push({
            id: "act-send-followup", name: "Send Followup DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [300, 300],
            parameters: {
              method: "POST", url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `=${JSON.stringify(followUpPayload, null, 2)}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId, name: lmCredName } }
          });
          // Connect to Init Lead as a parallel branch
          lmConnections["Fetch Usernames1"].main[0].push({ node: "Wait for Followup", type: "main", index: 0 });
          lmConnections["Wait for Followup"] = { main: [[{ node: "Check Followup Status", type: "main", index: 0 }]] };
          lmConnections["Check Followup Status"] = { main: [[{ node: "Send Followup DM", type: "main", index: 0 }]] };
        }

        return { name: finalWorkflowName, nodes: lmNodes, connections: lmConnections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      // 0. Conversation Flow (Priority)
      if (triggerType === 'conversation_flow') {
        console.log(`[TEMPLATE] Building Dynamic Conversation Flow workflow`);

        // ── NODES ────────────────────────────────────────────────────
        const cfNodes: any[] = [
          // 1. Webhook
          {
            "parameters": { "httpMethod": "POST", "path": webhookPath, "options": {} },
            "id": "webhook-node", "name": "Worker Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2.1,
            "position": [-304, 4048], "webhookId": webhookPath
          },
          // 2. Fetch Usernames
          {
            "parameters": { "url": "https://graph.instagram.com/v24.0/me?fields=id,username", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "options": {} },
            "id": "cf-fetch-user", "name": "Fetch Usernames", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3,
            "position": [-80, 4048],
            "credentials": { "facebookGraphApi": { "id": credentialId } }
          },
          // 3. Entry Switch
          {
            "parameters": {
              "rules": {
                "values": [
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "is-postback", "leftValue": "={{ $('Worker Webhook').item.json.body.sub_type }}", "rightValue": "postback", "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "Postback" },
                  { "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": "is-dm", "leftValue": "={{ $('Worker Webhook').item.json.body.sub_type }}", "rightValue": "postback", "operator": { "type": "string", "operation": "notEquals" } }, { "id": "sender-not-bot", "leftValue": "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}", "rightValue": "={{ $('Fetch Usernames').item.json.id }}", "operator": { "type": "string", "operation": "notEquals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": "New DM" }
                ]
              }, "options": { "ignoreCase": true }
            },
            "id": "cf-entry-switch", "name": "Entry Switch", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [144, 4048]
          },
          // 4. Extract Payload
          {
            "parameters": { "jsCode": "const payload = $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.postback?.payload || $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.message?.quick_reply?.payload || '';\nconst senderId = $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.sender?.id || '';\nconst staticData = $getWorkflowStaticData('global');\nconst lead = (staticData.leads || {})[senderId] || { state: 'new' };\n\n// 🔒 Ownership Guard\nif (!lead.owner || lead.owner !== '" + uniqueId + "') {\n  return []; \n}\n\nreturn [{ json: { payload, senderId } }];" },
            "id": "cf-extract-payload", "name": "Extract Payload", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [368, 3952]
          },
          // 5. Payload Router
          {
            "parameters": {
              "rules": {
                "values": uniquePayloads.map((p: string) => ({
                  "conditions": { "options": { "caseSensitive": false, "leftValue": "", "typeValidation": "strict", "version": 2 }, "conditions": [{ "id": (p || '').toLowerCase().replace(/[^a-z0-9]/g, ''), "leftValue": "={{ $json.payload }}", "rightValue": p, "operator": { "type": "string", "operation": "equals" } }], "combinator": "and" }, "renameOutput": true, "outputKey": p
                }))
              }, "options": { "ignoreCase": true }
            },
            "id": "cf-payload-router", "name": "Payload Router", "type": "n8n-nodes-base.switch", "typeVersion": 3.3, "position": [592, 3360]
          }
        ];

        // 6. Send Level 0 Menu (opening message)
        const level0Body = {
          recipient: { id: senderExpr },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [{
                  title: (dmAction.title || "Welcome!").substring(0, 1500),
                  subtitle: (dmAction.subtitle || "Powered by QuickRevert").substring(0, 1500),
                  buttons: formatButtons(level0Buttons)
                }]
              }
            }
          }
        };
        cfNodes.push({
          "parameters": { "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json", "jsonBody": `=${JSON.stringify(level0Body, null, 2)}`, "options": {} },
          "id": "cf-level-0", "name": "Send Level 0 Menu", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3, "position": [368, 4144],
          "credentials": { "facebookGraphApi": { "id": credentialId } }
        });

        // 7. Card Nodes — one per conversationCard
        const cardNameMap: Record<string, string> = {}; // payload → node name
        cards.forEach((card: any, idx: number) => {
          const cardNodeName = getCardName(card.id);
          cardNameMap[card.id] = cardNodeName;

          const cardPostbacks = formatButtons(card.actionButtons);
          const hasPostbacks = cardPostbacks.some((b: any) => b.type === 'postback');

          // If card has postback buttons → send as template; otherwise send as plain text
          let cardJsonBody: string;
          if (hasPostbacks) {
            const cardBody = {
              recipient: { id: senderExpr },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [{
                      title: (card.messageTemplate || "Select an option").substring(0, 1500),
                      subtitle: (card.title || "Choose below").substring(0, 1500),
                      buttons: cardPostbacks
                    }]
                  }
                }
              }
            };
            cardJsonBody = `=${JSON.stringify(cardBody, null, 2)}`;
          } else {
            // Leaf card — plain text message
            const textBody = {
              recipient: { id: senderExpr },
              message: { text: card.messageTemplate || "Thank you!" }
            };
            cardJsonBody = `=${JSON.stringify(textBody, null, 2)}`;
          }

          cfNodes.push({
            "parameters": { "method": "POST", "url": "https://graph.instagram.com/v24.0/me/messages", "authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi", "sendBody": true, "specifyBody": "json", "jsonBody": cardJsonBody, "options": {} },
            "id": `cf-card-${card.id}`, "name": cardNodeName, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.3,
            "position": [816, 1648 + (idx * 384)],
            "credentials": { "facebookGraphApi": { "id": credentialId } }
          });
        });

        // ── CONNECTIONS (Using NODE NAMES — this is what n8n requires) ──
        const cfConnections: any = {
          "Worker Webhook": { "main": [[{ "node": "Fetch Usernames", "type": "main", "index": 0 }]] },
          "Fetch Usernames": { "main": [[{ "node": "Entry Switch", "type": "main", "index": 0 }]] },
          "Entry Switch": {
            "main": [
              [{ "node": "Extract Payload", "type": "main", "index": 0 }],
              [{ "node": "Send Level 0 Menu", "type": "main", "index": 0 }]
            ]
          },
          "Extract Payload": { "main": [[{ "node": "Payload Router", "type": "main", "index": 0 }]] },
          "Payload Router": {
            "main": uniquePayloads.map((p: string) => {
              const targetName = cardNameMap[p] || `Card: ${p}`;
              return [{ "node": targetName, "type": "main", "index": 0 }];
            })
          }
        };

        if (hasFollowUp) {
          const waitMinutes = followUpAction.delayUnit === 'minutes' ? followUpAction.delayValue : followUpAction.delayUnit === 'hours' ? followUpAction.delayValue * 60 : followUpAction.delayValue * 1440;
          cfNodes.push({
            id: "act-wait-followup", name: "Wait for Followup", type: "n8n-nodes-base.wait", typeVersion: 1, position: [nodeX + 800, 200],
            parameters: { amount: followUpAction.delayValue || 30, unit: followUpAction.delayUnit || "minutes" }
          });
          cfNodes.push({
            id: "act-check-followup-status", name: "Check Followup Status", type: "n8n-nodes-base.code", typeVersion: 2, position: [nodeX + 900, 200],
            parameters: {
              jsCode: `const senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id;
const staticData = $getWorkflowStaticData('global');
const leads = staticData.leads || {};
const lead = leads[senderId];

// 1. Ownership Guard
if (!lead || lead.owner !== '${uniqueId}') return [];

// 2. Completion Guard: Stop if lead is already 'saved'
if (lead.state === 'saved') return [];

return [{ json: { senderId } }];`
            }
          });
          cfNodes.push({
            id: "act-send-followup", name: "Send Followup DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX + 1100, 200],
            parameters: {
              method: "POST", url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `={\n  \"recipient\": { \"id\": \"{{ $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').item.json.body.payload?.sender?.id }}\" },\n  \"message\": { \"text\": \"${(followUpAction.message || "").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\" }\n}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
          cfConnections["Send Level 0 Menu"] = { main: [[{ node: "Wait for Followup", type: "main", index: 0 }]] };
          cfConnections["Wait for Followup"] = { main: [[{ node: "Check Followup Status", type: "main", index: 0 }]] };
          cfConnections["Check Followup Status"] = { main: [[{ node: "Send Followup DM", type: "main", index: 0 }]] };
        }

        return { name: finalWorkflowName, nodes: cfNodes, connections: cfConnections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      // 1. Analytics Workflow (Special Case)
      if (triggerType === 'enable_analytics') {
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
              "url": supabaseUrl + "/functions/v1/update-followers",
              "sendHeaders": true,
              "headerParameters": {
                "parameters": [
                  { "name": "apikey", "value": supabaseAnonKey },
                  { "name": "x-quickrevert-secret", "value": internalSecret },
                  { "name": "Content-Type", "value": "application/json" }
                ]
              },
              "sendBody": true,
              "specifyBody": "json",
              "jsonBody": "={\n  \"id\": \"{{ $json.id }}\",\n  \"username\": \"{{ $json.username }}\",\n  \"followers_count\": {{ $json.followers_count }}\n}",
              "options": {}
            },
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.1,
            "position": [288, 464],
            "id": "update-followers-webhook",
            "name": "Update Followers"
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

        // 🔒 Button Ownership Guard
        nodes.push({
          id: "button-guard", name: "Ownership Guard", type: "n8n-nodes-base.code", typeVersion: 2, position: [-112, -700],
          parameters: {
            jsCode: "const entry = $('Worker Webhook').item.json.body.entry?.[0]?.messaging?.[0];\nconst senderId = entry?.sender?.id || '';\nconst staticData = $getWorkflowStaticData('global');\nconst lead = (staticData.leads || {})[senderId] || { state: 'new' };\n\nif (!lead.owner || lead.owner !== '" + uniqueId + "') {\n  return []; \n}\n\nreturn [{ json: { senderId } }];"
          }
        });
        connections["Event Type Switch"] = { main: [ [], [{ node: "Ownership Guard", type: "main", index: 0 }] ] };

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

      const cooldownEnabled = (triggerType === 'user_directed_messages' || triggerType === 'user_dm');
      const cooldownDuration = automationData?.trigger_config?.cooldownDuration || 3600000;

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

        if (cooldownEnabled) {
          nodes.push({
            id: "cooldown-check", name: "Cooldown Check", type: "n8n-nodes-base.code", typeVersion: 2, position: [nodeX - 400, 300],
            parameters: {
              jsCode: `// ── COOLDOWN CONFIG ──────────────────────────────
const COOLDOWN_MS = ${cooldownDuration};

const senderId = $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id;
const staticData = $getWorkflowStaticData('global');

if (!staticData.cooldowns) {
  staticData.cooldowns = {};
}

const now = Date.now();
const lastReplied = staticData.cooldowns[senderId] || 0;
const diff = now - lastReplied;

if (diff > COOLDOWN_MS) {
  staticData.cooldowns[senderId] = now;
  return [{ json: { allow: true, senderId } }];
} else {
  return [{ json: { allow: false, senderId } }];
}`
            }
          });

          nodes.push({
            id: "cooldown-gate", name: "Cooldown Gate", type: "n8n-nodes-base.switch", typeVersion: 3.4, position: [nodeX - 200, 300],
            parameters: {
              rules: {
                values: [
                  {
                    conditions: {
                      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 3 },
                      conditions: [
                        { id: "cooldown-passed", leftValue: "={{ $json.allow }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }
                      ],
                      combinator: "and"
                    }
                  }
                ]
              },
              options: {}
            }
          });

          connections[previousNode] = { main: [[{ node: "Cooldown Check", type: "main", index: 0 }]] };
          connections["Cooldown Check"] = { main: [[{ node: "Cooldown Gate", type: "main", index: 0 }]] };
          connections["Cooldown Gate"] = { main: [[{ node: "Message Switch", type: "main", index: 0 }]] };
        } else {
          connections[previousNode] = { main: [[{ node: "Message Switch", type: "main", index: 0 }]] };
        }

        nodeX += 400;
        previousNode = "Message Switch";

        if (sendDmAction) {
          const text = (sendDmAction.title || "Hello!").substring(0, 400);
          const subtitle = (sendDmAction.subtitle || sendDmAction.messageTemplate || "").substring(0, 400);
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
            const bodyText = (linkedAction.subtitle || linkedAction.messageTemplate || linkedAction.title || "").substring(0, 400);
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

        if (hasFollowUp) {
          const waitMinutes = followUpAction.delayUnit === 'minutes' ? followUpAction.delayValue : followUpAction.delayUnit === 'hours' ? followUpAction.delayValue * 60 : followUpAction.delayValue * 1440;
          nodes.push({
            id: "act-wait-followup", name: "Wait for Followup", type: "n8n-nodes-base.wait", typeVersion: 1, position: [nodeX + 400, 200],
            parameters: { amount: followUpAction.delayValue || 30, unit: followUpAction.delayUnit || "minutes" }
          });
          nodes.push({
            id: "act-check-followup-status", name: "Check Followup Status", type: "n8n-nodes-base.code", typeVersion: 2, position: [nodeX + 500, 200],
            parameters: {
              jsCode: `const senderId = $('Worker Webhook').first().json.body.entry?.[0]?.messaging?.[0]?.sender?.id || $('Worker Webhook').first().json.body.entry?.[0]?.changes?.[0]?.value?.from?.id || $('Worker Webhook').first().json.body.payload?.sender?.id;
const staticData = $getWorkflowStaticData('global');
const leads = staticData.leads || {};
const lead = leads[senderId];

// 1. Ownership Guard
if (!lead || lead.owner !== '${uniqueId}') return [];

// 2. Completion Guard: Stop if lead is already 'saved'
if (lead.state === 'saved') return [];

return [{ json: { senderId } }];`
            }
          });
          nodes.push({
            id: "act-send-followup", name: "Send Followup DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX + 700, 200],
            parameters: {
              method: "POST", url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `={\n  \"recipient\": { \"id\": \"{{ $('Worker Webhook').item.json.body.payload.sender.id }}\" },\n  \"message\": { \"text\": \"${(followUpAction.message || "").replace(/"/g, '\\"').replace(/\n/g, '\\n')}\" }\n}`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
          connections["act-send-dm"] = { main: [[{ node: "Wait for Followup", type: "main", index: 0 }]] };
          connections["Wait for Followup"] = { main: [[{ node: "Check Followup Status", type: "main", index: 0 }]] };
          connections["Check Followup Status"] = { main: [[{ node: "Send Followup DM", type: "main", index: 0 }]] };
        }

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
                    options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 3 },
                    conditions: [
                      {
                        id: "sender-not-bot",
                        leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}",
                        rightValue: "={{ $('Fetch Usernames').item.json.id }}",
                        operator: { type: "string", operation: "notEquals" }
                      },
                      {
                        id: triggerType === 'story_reply' ? "is-a-story-reply" : "not-a-story-reply",
                        leftValue: "={{ $('Worker Webhook').item.json.body.entry[0].messaging[0].message.reply_to }}",
                        rightValue: "",
                        operator: { type: "string", operation: triggerType === 'story_reply' ? "exists" : "notExists", singleValue: true }
                      },
                      ...(triggerType === 'user_directed_messages' || triggerType === 'user_dm' ? [{
                        id: "not-a-postback",
                        leftValue: "={{ $('Worker Webhook').item.json.body.sub_type }}",
                        rightValue: "postback",
                        operator: { type: "string", operation: "notEquals" }
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

        const cooldownEnabled = (triggerType === 'user_directed_messages' || triggerType === 'user_dm');
        const cooldownDuration = automationData?.trigger_config?.cooldownDuration || 3600000;

        if (cooldownEnabled) {
          nodes.push({
            id: "cooldown-check", name: "Cooldown Check", type: "n8n-nodes-base.code", typeVersion: 2, position: [nodeX, 300],
            parameters: {
              jsCode: `// ── COOLDOWN CONFIG ──────────────────────────────
const COOLDOWN_MS = ${cooldownDuration};

const senderId = $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id;
const staticData = $getWorkflowStaticData('global');

if (!staticData.cooldowns) {
  staticData.cooldowns = {};
}

const now = Date.now();
const lastReplied = staticData.cooldowns[senderId] || 0;
const diff = now - lastReplied;

if (diff > COOLDOWN_MS) {
  staticData.cooldowns[senderId] = now;
  return [{ json: { allow: true, senderId } }];
} else {
  return [{ json: { allow: false, senderId } }];
}`
            }
          });

          nodes.push({
            id: "cooldown-gate", name: "Cooldown Gate", type: "n8n-nodes-base.switch", typeVersion: 3.4, position: [nodeX + 250, 300],
            parameters: {
              rules: {
                values: [
                  {
                    conditions: {
                      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 3 },
                      conditions: [
                        { id: "cooldown-passed", leftValue: "={{ $json.allow }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }
                      ],
                      combinator: "and"
                    }
                  }
                ]
              },
              options: {}
            }
          });

          connections[previousNode] = { main: [[{ node: "Cooldown Check", type: "main", index: 0 }]] };
          connections["Cooldown Check"] = { main: [[{ node: "Cooldown Gate", type: "main", index: 0 }]] };
          previousNode = "Cooldown Gate";
          nodeX += 500;
        }

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

  // 🔒 Tag Ownership
  if (!staticData.leads) staticData.leads = {};
  const senderId = $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id;
  staticData.leads[senderId] = { state: 'waiting_standard', owner: '${uniqueId}' };

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
          const recipient = triggerType === 'post_comment'
            ? { comment_id: "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.id }}" }
            : { id: "{{ $('Worker Webhook').item.json.body.entry[0].messaging[0].sender.id }}" };
          const hasButtons = action.actionButtons && action.actionButtons.length > 0;
          const isCarousel = action.dmType === 'carousel';
          const hasImage = !!action.imageUrl;

          let messagePayload: any;

          if (isCarousel && action.carouselCards && action.carouselCards.length > 0) {
            // Build elements for carousel
            const elements = action.carouselCards.map((card: any) => {
              const element: any = {
                title: (card.title || "Hi 👋").substring(0, 400),
                subtitle: (card.subtitle || "Powered by Quickrevert.tech").substring(0, 400),
              };
              if (card.imageUrl) element.image_url = card.imageUrl;

              if (card.buttons && card.buttons.length > 0) {
                element.buttons = card.buttons.slice(0, 3).map((b: any) => {
                  const btnType = b.buttonType || (b.url ? 'web_url' : 'postback');
                  if (btnType === 'web_url') {
                    return { type: "web_url", url: b.url, title: (b.text || "Open").substring(0, 20) };
                  } else {
                    return { type: "postback", title: (b.text || "Click").substring(0, 20), payload: `${b.text || "Click"}_${uniqueId}` };
                  }
                });
              }
              return element;
            });

            messagePayload = {
              recipient,
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: elements
                  }
                }
              }
            };
          } else if (hasButtons || hasImage) {
            // Build generic template with buttons
            const templateButtons: any[] = [];
            if (hasButtons) {
              action.actionButtons.slice(0, 3).forEach((b: any) => {
                const btnType = b.buttonType || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  templateButtons.push({ type: "web_url", url: b.url, title: (b.text || "Open").substring(0, 20) });
                } else {
                  templateButtons.push({ type: "postback", title: (b.text || "Click").substring(0, 20), payload: `${b.text || "Click"}_${uniqueId}` });
                }
              });
            }
            const element: any = {
              title: (action.title || "Hi 👋").substring(0, 400),
              subtitle: (action.subtitle || "Powered by Quickrevert.tech").substring(0, 400),
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

          // 3.5 REWARD (True Branch) - Use Generic Template or Carousel
          let rewardPayload: any;

          if (action.dmType === 'carousel' && action.carouselCards && action.carouselCards.length > 0) {
            const elements = action.carouselCards.map((card: any) => {
              const element: any = {
                title: (card.title || "Hi 👋").substring(0, 1500),
                subtitle: (card.subtitle || "Powered by Quickrevert.tech").substring(0, 1500),
              };
              if (card.imageUrl) element.image_url = card.imageUrl;

              if (card.buttons && card.buttons.length > 0) {
                element.buttons = card.buttons.slice(0, 3).map((b: any) => {
                  const bType = b.buttonType || (b.url ? 'web_url' : 'postback');
                  if (bType === 'web_url') {
                    return { type: "web_url", url: b.url, title: (b.text || "Open").substring(0, 20) };
                  } else {
                    return { type: "postback", title: (b.text || "Click").substring(0, 20), payload: `${b.text || "Click"}_${uniqueId}` };
                  }
                });
              }
              return element;
            });

            rewardPayload = {
              recipient: { id: recipientId },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: elements
                  }
                }
              }
            };
          } else {
            const rewardButtons: any[] = [];
            if (action.actionButtons && action.actionButtons.length > 0) {
              action.actionButtons.slice(0, 3).forEach((b: any) => {
                if (b.url) {
                  rewardButtons.push({
                    type: "web_url",
                    url: b.url,
                    title: (b.text || "link").substring(0, 20)
                  });
                } else {
                  rewardButtons.push({
                    type: "postback",
                    title: (b.text || "Click").substring(0, 20),
                    payload: `${b.text || "Click"}_${uniqueId}`
                  });
                }
              });
            }

            const rewardElement: any = {
              title: (action.title || "hey, heres your link").substring(0, 1500),
              subtitle: (action.subtitle || "Powered By Quickrevert.tech").substring(0, 1500)
            };
            if (action.imageUrl) rewardElement.image_url = action.imageUrl;
            if (rewardButtons.length > 0) rewardElement.buttons = rewardButtons;

            rewardPayload = {
              recipient: { id: recipientId },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [rewardElement]
                  }
                }
              }
            };
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
              jsonBody: `=${JSON.stringify(rewardPayload, null, 2)}`,
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
    let n8nResult;

    if (existingWorkflowId) {
      // 🔄 UPDATE IN-PLACE
      console.log(`[UPDATE] Updating existing n8n workflow: ${existingWorkflowId}`);
      const baseUrl = n8nBaseUrl.endsWith('/') ? n8nBaseUrl.slice(0, -1) : n8nBaseUrl;
      const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${existingWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
        body: JSON.stringify(n8nWorkflowJSON)
      });
      if (!updateRes.ok) throw new Error(`n8n Update Failed: ${updateRes.statusText}`);
      n8nResult = await updateRes.json();
    } else {
      // 🆕 CREATE NEW
      console.log(`[CREATE] Creating new n8n workflow`);
      const baseUrl = n8nBaseUrl.endsWith('/') ? n8nBaseUrl.slice(0, -1) : n8nBaseUrl;
      const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
        body: JSON.stringify(n8nWorkflowJSON)
      });
      if (!createRes.ok) throw new Error(`n8n Create Failed: ${createRes.statusText}`);
      n8nResult = await createRes.json();
    }

    // 🔥 PERFORMANCE: Return response as soon as we have the workflow ID
    // Activation and Routes can happen in the background
    const finalizationTask = (async () => {
      try {
        const action = autoActivate ? 'activate' : 'deactivate';
        const baseUrl = n8nBaseUrl.endsWith('/') ? n8nBaseUrl.slice(0, -1) : n8nBaseUrl;
        const finalUrl = `${baseUrl}/api/v1/workflows/${n8nResult.id}/${action}`;

        console.log(`[BACKGROUND] Sending ${action} request to n8n: ${finalUrl}`);
        const n8nActRes = await fetch(finalUrl, {
          method: "POST",
          headers: { 
            "X-N8N-API-KEY": n8nApiKey,
            "Content-Type": "application/json"
          }
        });

        if (!n8nActRes.ok) {
          console.error(`[BACKGROUND] n8n ${action} failed:`, await n8nActRes.text());
        }

        // ALWAYS CREATE ROUTES (Inactive by default if autoActivate is false)
        const userAccounts = instagramAccountId ? [{ id: instagramAccountId }] : [{ id: instagramAccount.id }];
        if (userAccounts && userAccounts.length > 0) {
          const newRoutes: any[] = [];
          const finalTriggerType = bodyTriggerType || automationData?.trigger_type || 'user_dm';

          for (const account of userAccounts) {
            if (finalTriggerType === 'post_comment') {
              newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'changes', sub_type: 'comments', is_active: autoActivate });
              newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'messaging', sub_type: 'postback', is_active: autoActivate });
              const actions = automationData?.actions || body.actions || [];
              if (actions.some((a: any) => a.type === 'save_lead')) {
                newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'messaging', sub_type: null, is_active: autoActivate });
              }
            } else if (finalTriggerType === 'story_reply') {
              newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'messaging', sub_type: null, is_active: autoActivate });
            } else {
              newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'messaging', sub_type: null, is_active: autoActivate });
              newRoutes.push({ account_id: account.id, user_id: user.id, n8n_workflow_id: n8nResult.id, event_type: 'messaging', sub_type: 'postback', is_active: autoActivate });
            }
          }
          const { error: routeError } = await supabase.from('automation_routes').insert(newRoutes);
          if (routeError) console.error("[BACKGROUND] Failed to create routes:", routeError);
        }
      } catch (err) {
        console.error("[BACKGROUND] Finalization error:", err.message);
      }
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(finalizationTask);
    }

    // ATOMIC DATABASE REGISTRATION & CLEANUP
    if (automationId) {
      console.log(`Checking for additional workflows for Automation ID: ${automationId}`);

      // Find OTHER existing workflows for this automation to cleanup (excluding the one we just updated)
      const { data: otherWorkflows } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id')
        .eq('automation_id', automationId)
        .neq('n8n_workflow_id', n8nResult.id); // Protect the current workflow

      if (otherWorkflows && otherWorkflows.length > 0) {
        const oldWorkflowIds = otherWorkflows.map((w: any) => w.n8n_workflow_id);
        console.log(`Found ${oldWorkflowIds.length} old workflows to cleanup (excluding ${n8nResult.id}):`, oldWorkflowIds);

        // 🔥 PERFORMANCE FIX: Run cleanup in background so user doesn't wait
        const cleanupTask = (async () => {
          // 2. Delete Routes for old workflows
          await supabase.from('automation_routes').delete().in('n8n_workflow_id', oldWorkflowIds);

          // 3. Delete from n8n_workflows table
          await supabase.from('n8n_workflows').delete().in('n8n_workflow_id', oldWorkflowIds);

          // 4. Request n8n to delete old workflows in PARALLEL
          await Promise.all(oldWorkflowIds.map(async (oldId) => {
            try {
              const delRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${oldId}`, {
                method: "DELETE",
                headers: { "X-N8N-API-KEY": n8nApiKey }
              });
              console.log(`[CLEANUP] Deleted old workflow ${oldId}: ${delRes.status}`);
            } catch (e) {
              console.error(`[CLEANUP] Failed to delete ${oldId}:`, e.message);
            }
          }));
        })();

        // Fire and forget (or use waitUntil)
        // @ts-ignore
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(cleanupTask);
        }
      }
    }

    // UPSERT NEW WORKFLOW RECORD (Using upsert to handle updates gracefully)
    const { error: insertError } = await supabase.from("n8n_workflows").upsert({
      n8n_workflow_id: n8nResult.id,
      user_id: user.id,
      n8n_workflow_name: n8nResult.name,
      webhook_path: webhookPath,
      instagram_account_id: instagramAccount.id,
      template: template || 'instagram_automation_v1',
      variables: variables || {},
      automation_id: automationId || null,
      is_active: autoActivate
    }, { onConflict: 'n8n_workflow_id' });

    if (insertError) {
      console.error("Failed to upsert n8n_workflow record:", insertError);
      throw new Error("Database Upsert Failed: " + insertError.message);
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