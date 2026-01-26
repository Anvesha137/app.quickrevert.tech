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
    const { userId, template, variables, instagramAccountId, workflowName, automationId, autoActivate = false } = body;

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
    const webhookPath = `instagram-webhook-${userId}-${automationId || Date.now()}`;

    // --- BUILDERS ---
    const buildWorkflow = () => {
      const triggerType = automationData?.trigger_type || "user_dm";
      const actions = automationData?.actions || [];

      const nodes: any[] = [];
      let nodeX = -300; // Start closer to center

      // 1. Webhook (Standard Worker)
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [nodeX, 300],
        parameters: { httpMethod: "POST", path: webhookPath, responseMode: "onReceived", options: {} },
        webhookId: webhookPath
      });
      nodeX += 300;

      let previousNode = "Worker Webhook"; // Connect directly to Webhook

      // 1.5 Switch Node Logic (Exclusive for keyword_dm)
      if (triggerType === 'keyword_dm') {
        const keywordString = automationData?.trigger_config?.keyword || "";
        const keywords = keywordString.split(',').map((k: string) => k.trim()).filter((k: string) => k);
        const postbackButtons: any[] = [];

        // Check for buttons in the Main DM Action (Frontend uses 'actionButtons')
        const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
        if (sendDmAction && sendDmAction.actionButtons) {
          sendDmAction.actionButtons.forEach((b: any) => {
            // Frontend: { text, url, action? }
            // We default to 'postback' if action is 'postback' OR if no URL is provided
            const btnType = b.action || (b.url ? 'web_url' : 'postback');

            if (btnType === 'postback') {
              postbackButtons.push({
                type: 'postback',
                title: b.text,
                payload: b.text // Use text as payload since frontend doesn't have specific payload field
              });
            }
          });
        }

        // Build Switch Rules & Output Mapping
        const rules: any[] = [];
        const outputTargets: string[] = []; // Tracks which Node ID each rule points to

        // A. Keywords -> Main Action
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
          outputTargets.push("act-send-dm"); // Main Action
        });

        // B. Postbacks -> Specific Button Actions
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
          outputTargets.push(`act-btn-${index}`); // New Button Node
        });

        // Add Switch Node
        nodes.push({
          id: "message-switch", name: "Message Switch",
          type: "n8n-nodes-base.switch", typeVersion: 3.3,
          position: [nodeX, 300],
          parameters: { rules: { values: rules }, options: { ignoreCase: true } }
        });
        nodeX += 400; // Move right significantly

        // Create Main Action Node (Configured by User)
        // Note: Reusing the standard DM creation logic but manually placing it
        if (sendDmAction) {
          const text = sendDmAction.title || "Hello!";
          // Recipient Logic for DM
          const recipientLogic = `"id": "{{ $json.body.payload.sender.id }}"`;

          nodes.push({
            id: "act-send-dm", name: "Send DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 200], // Upper track
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/me/messages`,
              authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
              sendBody: true, specifyBody: "json",
              jsonBody: `={
                  "recipient": { ${recipientLogic} },
                  "message": { "text": "${text.replace(/"/g, '\\"')}" }
                }`,
              options: {}
            },
            credentials: { facebookGraphApi: { id: credentialId } }
          });
        }

        // Create Button Action Nodes (Linked to User-Configured Actions)
        postbackButtons.forEach((b: any, index: number) => {
          // Find if there is a specific action defined for this button (matching title)
          // We skip the *first* action (index 0) as it's the main DM trigger
          const linkedAction = actions.find((a: any, i: number) => a.type === 'send_dm' && a.title === b.title && i > 0);

          let btnText = `You selected: ${b.title}`; // Default placeholder
          let btnImage = "";
          let btnSubtitle = "";

          if (linkedAction) {
            btnText = linkedAction.title; // Use the title (e.g. "Explore Now") or msg content
            // Actually, title is the header. Message text is usually subtitle/template.
            // Let's use subtitle/template for the text body if available, else title.
            const bodyText = linkedAction.subtitle || linkedAction.messageTemplate || linkedAction.title;
            btnText = bodyText;
            btnImage = linkedAction.imageUrl || "";
            // If the linked action has its OWN buttons, we should ideally handle them too (Recursion?)
            // For V1, we just handle the text/image response.
          }

          const recipientLogic = `"id": "{{ $json.body.payload.sender.id }}"`;

          const jsonBodyObj: any = {
            recipient: { id: `{{ $json.body.payload.sender.id }}` },
            message: { text: btnText.replace(/"/g, '\\"') }
          };

          // Add Image/Generic Template if image exists
          if (btnImage) {
            // Complex structure needed for Image + Text (Generic Template)
            // Start simple: If image, send as Generic Template
            jsonBodyObj.message = {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [
                    {
                      title: linkedAction?.title || b.title,
                      image_url: btnImage,
                      subtitle: btnText,
                      buttons: [] // Could map next-level buttons here if we wanted
                    }
                  ]
                }
              }
            };
          }

          nodes.push({
            id: `act-btn-${index}`, name: `Send DM - ${b.title}`, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3,
            position: [nodeX, 400 + (index * 150)], // Lower tracks, stacked
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

        // Manual Connections for Branching
        const connections: any = {
          "Worker Webhook": { main: [[{ node: "Message Switch", type: "main", index: 0 }]] },
          "Message Switch": { main: [] }
        };

        // Map Switch Outputs -> Target Nodes
        // switchOutputs order corresponds to 'rules' array order
        rules.forEach((_, i) => {
          const targetId = outputTargets[i];
          const targetNode = nodes.find(n => n.id === targetId);
          if (targetNode) {
            connections["Message Switch"].main.push([
              { node: targetNode.name, type: "main", index: 0 }
            ]);
          } else {
            connections["Message Switch"].main.push([]); // Empty branch if targets missing
          }
        });

        return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
      }

      // 2. Actions (Directly connected) - For non-keyword_dm triggers
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
      const replyCommentAction = actions.find((a: any) => a.type === 'reply_to_comment');

      if (triggerType === 'comments' && replyCommentAction) {
        const text = replyCommentAction.text || "Thanks!";
        const name = "Reply to Comment";
        nodes.push({
          id: "act-reply-comment", name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
          parameters: {
            method: "POST",
            // Comment ID is usually at payload.value.id or payload.id depending on Meta structure. 
            // Router sends 'change' object as payload. change.value.id is the comment ID.
            url: `=https://graph.instagram.com/v24.0/{{ $json.body.payload.value.id }}/replies`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify({ message: text }, null, 2)}`, options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });
        nodeX += 300;
      }

      if (sendDmAction) {
        const text = sendDmAction.title || "Hello!";
        const name = "Send DM";
        // Recipient ID navigation:
        // DM: payload.sender.id (Router normalizes this? Router normalization: payload contains 'sender'. Yes.)
        // Comment: payload.value.from.id ?? No, usually we rely on Private Replies which use comment_id via /messages endpoint?
        // Wait, for Private Reply to comment, we use { recipient: { comment_id: "..." } }.
        // For standard DM, we use { recipient: { id: "..." } }.

        let recipientLogic = `"id": "{{ $json.body.payload.sender.id }}"`; // Default DM

        if (triggerType === 'comments') {
          // For Private Reply
          recipientLogic = `"comment_id": "{{ $json.body.payload.value.id }}"`;
        }

        nodes.push({
          id: "act-send-dm", name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
          parameters: {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/me/messages`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json",
            jsonBody: `={
  "recipient": {
    ${recipientLogic}
  },
  "message": { "text": "${text.replace(/"/g, '\\"')}" }
}`,
            options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });
      }

      // Wiring - Auto-chaining
      const connections: any = {};
      if (nodes.length > 1) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const source = nodes[i].name;
          const target = nodes[i + 1].name;
          connections[source] = { main: [[{ node: target, type: "main", index: 0 }]] };
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

    // Store in DB
    await supabase.from("n8n_workflows").insert({
      user_id: user.id, n8n_workflow_id: n8nResult.id, n8n_workflow_name: n8nResult.name,
      webhook_path: webhookPath, instagram_account_id: instagramAccount.id,
      template: template || 'instagram_automation_v1', variables: variables || {},
      ...(automationId && { automation_id: automationId })
    });

    // AUTO-CREATE ROUTE (Fix for "Ghost" Workflows)
    if (autoActivate) {
      // Force Wildcard to match 'activate-workflow' behavior
      const eventType = 'messaging';
      const subType = null; // WILDCARD

      // 1. Concurrent Mode: Do NOT delete other routes.
      // Allow multiple automations to run for this account.

      // 2. Insert New Route
      // 2. Insert New Routes (Messaging + Comments)
      const { error: routeError } = await supabase.from('automation_routes').insert([
        {
          user_id: user.id,
          account_id: instagramAccount.instagram_user_id, // Meta ID
          event_type: 'messaging',
          sub_type: null, // WILDCARD
          n8n_workflow_id: n8nResult.id, // Correct Column
          is_active: true
        },
        {
          user_id: user.id,
          account_id: instagramAccount.instagram_user_id, // Meta ID
          event_type: 'changes',
          sub_type: null, // WILDCARD
          n8n_workflow_id: n8nResult.id,
          is_active: true
        }
      ]);

      if (routeError) console.error("Auto-Route Error:", routeError);
    }

    return new Response(JSON.stringify({ success: true, workflowId: n8nResult.id, webhookPath }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});