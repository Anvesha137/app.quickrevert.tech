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
      // Frontend sends: trigger_type 'user_directed_messages' with config { messageType: 'keywords', keywords: [...] }
      const isKeywordTrigger = triggerType === 'user_directed_messages' && automationData?.trigger_config?.messageType === 'keywords';

      if (isKeywordTrigger) {
        // Frontend sends keywords as an array of strings
        // Fallback to empty array if missing
        const keywords = Array.isArray(automationData?.trigger_config?.keywords)
          ? automationData.trigger_config.keywords
          : [];

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
        if (sendDmAction) {
          const text = sendDmAction.title || "Hello!";
          const subtitle = sendDmAction.subtitle || sendDmAction.messageTemplate || "";
          const imageUrl = sendDmAction.imageUrl || "";

          // Check if we need a Generic Template (if buttons or image exist)
          const hasButtons = sendDmAction.actionButtons && sendDmAction.actionButtons.length > 0;
          const isRichMessage = hasButtons || imageUrl;

          let jsonBody = "";
          const recipientLogic = `"id": "{{ $json.body.payload.sender.id }}"`;

          if (isRichMessage) {
            // Construct Buttons Array
            const elementsButtons: any[] = [];
            if (hasButtons) {
              sendDmAction.actionButtons.forEach((b: any) => {
                const btnType = b.action || (b.url ? 'web_url' : 'postback');
                if (btnType === 'web_url') {
                  elementsButtons.push({ type: "web_url", url: b.url, title: b.text });
                } else {
                  // Postback
                  elementsButtons.push({ type: "postback", title: b.text, payload: b.text });
                }
              });
            }

            // Construct Generic Template
            const messagePayload = {
              recipient: { id: `{{ $json.body.payload.sender.id }}` },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: [
                      {
                        title: text,
                        // User provided snippet shows image_url. If no image, maybe just text+buttons? generic template usually requires image/title/subtitle.
                        // If no image, we might try "button" template but that's deprecated/limited?
                        // Let's stick to generic. If no image, providing a placeholder or omitting? 
                        // Providing valid logic: If imageUrl is empty, omit it.
                        ...(imageUrl ? { image_url: imageUrl } : {}),
                        subtitle: subtitle,
                        buttons: elementsButtons
                      }
                    ]
                  }
                }
              }
            };
            jsonBody = `=${JSON.stringify(messagePayload, null, 2)}`;
          } else {
            // Simple Text Message
            jsonBody = `={
                  "recipient": { ${recipientLogic} },
                  "message": { "text": "${text.replace(/"/g, '\\"')}" }
                }`;
          }

          nodes.push({
            id: "act-send-dm", name: "Send DM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 200], // Upper track
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

      // 1.55 Post Filter Switch (Exclusive for post_comment with specific posts)
      const isSpecificPostTrigger = triggerType === 'post_comment' && automationData?.trigger_config?.postsType === 'specific';

      if (isSpecificPostTrigger) {
        const specificPosts = Array.isArray(automationData?.trigger_config?.specificPosts)
          ? automationData.trigger_config.specificPosts
          : [];

        if (specificPosts.length > 0) {
          const rules: any[] = [];

          // We create ONE rule that matches ANY of the post IDs (OR logic)
          // But n8n Switch 'conditions' array is AND by default within a rule (combinator).
          // To do OR, we need multiple rules or use regex for 'any'.
          // Cleaner approach: One rule per post ID? 
          // If we have 50 posts, that's 50 outputs.
          // Better: Use regex matching or 'contains' if possible?
          // n8n v1 conditions are tricky.
          // Let's use multiple rules, all pointing to the SAME output?
          // No, n8n switch routes to DIFFERENT outputs.
          // Wait! n8n Switch node has 'combinator' for conditions?
          // Actually, if we want "If PostID in [A, B, C]", 
          // We can add multiple conditions to ONE rule if the combinator is OR.
          // Let's check the structure:
          /*
           rules: {
             values: [
               {
                 conditions: {
                   options: { caseSensitive: false, ... },
                   conditions: [ ... ],
                   combinator: "or"  <-- THIS IS WHAT WE WANT
                 }
               }
             ]
           }
          */

          const conditions = specificPosts.map((id: string, index: number) => ({
            id: `post-${index}`,
            leftValue: "={{ $json.body.entry[0].changes[0].value.media.id }}",
            rightValue: id,
            operator: { type: "string", operation: "equals" }
          }));

          rules.push({
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: conditions,
              combinator: "or"
            }
          });

          nodes.push({
            id: "post-switch", name: "Post Filter Switch",
            type: "n8n-nodes-base.switch", typeVersion: 3.3,
            position: [nodeX, 300],
            parameters: { rules: { values: rules }, options: { ignoreCase: true } }
          });

          // Logic to insert this into the chain
          // The previousNode was "Worker Webhook"
          // Now previousNode becomes "Post Filter Switch"
          // Unlike the Keyword DM (which is a terminal set of branches), this is a FILTER in the main line.

          previousNode = "Post Filter Switch";
          nodeX += 300;
        }
      }

      // 1.6 Switch Node Logic (Exclusive for post_comment with keywords)
      const isCommentKeywordTrigger = triggerType === 'post_comment' && automationData?.trigger_config?.commentsType === 'keywords';

      if (isCommentKeywordTrigger) {
        const keywords = Array.isArray(automationData?.trigger_config?.keywords)
          ? automationData.trigger_config.keywords
          : [];

        const rules: any[] = [];
        // Map all keywords to route to the main output
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

          // Wiring: All keyword matches connect to the next node (Action 1)
          // Since we didn't specify outputKeys, n8n switch usually routes to output 0, 1, 2...
          // User request implies: "If keyword matches, do the action".
          // So we need to connect ALL switch outputs to the next node.

          // Update: In n8n Switch, if rules don't rename outputs, they are just "0", "1", "2".
          // We need to store this node to connect it later.
          previousNode = "Comment Switch";
          nodeX += 300;
        }
      }

      // 2. Actions Generation (Iterate through all configured actions)
      // This supports multi-step workflows (e.g. Reply to Comment -> Send DM)

      actions.forEach((action: any, index: number) => {
        let nodeParams: any = {};
        let nodeType = "n8n-nodes-base.httpRequest";
        let nodeName = `Action ${index + 1}`; // Fallback name

        // --- DATA MAPPING HELPERS ---
        // Define paths based on trigger type
        let commentIdPath = "";
        let senderIdPath = "";
        let usernamePath = "";

        if (triggerType === 'post_comment') {
          // Instagram Graph API Webhook structure for Comments
          commentIdPath = "{{ $json.body.entry[0].changes[0].value.id }}";
          senderIdPath = "{{ $json.body.entry[0].changes[0].value.from.id }}";
          usernamePath = "{{ $json.body.entry[0].changes[0].value.from.username }}";
        } else {
          // Default to DM structure (user_directed_messages / keyword_dm)
          // Note: $json.body.payload.sender.id is for our custom Normalize? 
          // The raw webhook is entry[0].messaging[0].sender.id
          // If using Worker Webhook (raw), use raw paths.
          senderIdPath = "{{ $json.body.entry[0].messaging[0].sender.id }}";
        }

        // --- ACTION: REPLY TO COMMENT ---
        if (action.type === 'reply_to_comment') {
          nodeName = `Reply to Comment ${index + 1}`;
          // Fix 1: Add username mention and use user's text
          const userText = action.text || "Thanks!";
          // We use the usernamePath we defined earlier
          const replyText = `@${usernamePath} ${userText}`;

          nodeParams = {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/${commentIdPath}/replies`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json",
            jsonBody: `=${JSON.stringify({ message: replyText }, null, 2)}`,
            options: {}
          };
        }

        // --- ACTION: SEND DM ---
        else if (action.type === 'send_dm') {
          nodeName = `Send DM ${index + 1}`;
          const text = action.title || "Hello!";
          const subtitle = action.subtitle || action.messageTemplate || "";
          const imageUrl = action.imageUrl || "";
          const hasButtons = action.actionButtons && action.actionButtons.length > 0;
          const isRichMessage = hasButtons || imageUrl;

          // Fix 2: Use explicit Webhook reference for Recipient ID in post_comment triggers
          // This ensures we get the original sender ID even if previous nodes changed the input data
          let recipientId = senderIdPath;
          if (triggerType === 'post_comment') {
            recipientId = "{{ $('Worker Webhook').item.json.body.entry[0].changes[0].value.from.id }}";
          }

          let jsonBody = "";
          // ... (rest of DM logic remains similar, just ensuring recipientId is used)

          if (isRichMessage) {
            // ... (Buttons/Generic Template Logic)
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
            // Simple Text
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

        // Add Node
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
          nodeX += 300;
        }
      });

      // Wiring - Auto-chaining
      const connections: any = {};

      // Special Handling for Comment Switch Wiring (Fan-in)
      // We need to connect ALL outputs of 'Comment Switch' to the next node (which is nodes[index of Switch + 1])
      // Assuming 'Comment Switch' was added immediately before the Actions started.

      if (nodes.length > 1) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const source = nodes[i].name;
          const target = nodes[i + 1].name;

          if (source === "Comment Switch") {
            // Find how many rules we added (outputs)
            // We can infer it from the node parameters rules.values
            const switchNode = nodes[i];
            const ruleCount = switchNode.parameters.rules.values.length;

            const switchConnections = [];
            for (let j = 0; j < ruleCount; j++) {
              // Connect output index j to target input 0
              switchConnections.push([{ node: target, type: "main", index: 0 }]);
            }
            connections[source] = { main: switchConnections };
          } else {
            // Standard linear connection
            connections[source] = { main: [[{ node: target, type: "main", index: 0 }]] };
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
      const globalRoutesPayload = [];
      const trackedPostsPayload: any[] = [];

      // Logic for Specific Posts vs Global
      const isSpecificPostTrigger = automationData?.trigger_type === 'post_comment' && automationData?.trigger_config?.postsType === 'specific';

      if (isSpecificPostTrigger) {
        // A. TRACKED POSTS (Specific)
        const specificPosts = Array.isArray(automationData?.trigger_config?.specificPosts)
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
        // B. GLOBAL ROUTES (Default)
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

      // CALL RPC
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
      // Manual Insert for Inactive Workflows
      await supabase.from("n8n_workflows").insert({
        user_id: user.id, n8n_workflow_id: n8nResult.id, n8n_workflow_name: n8nResult.name,
        webhook_path: webhookPath, instagram_account_id: instagramAccount.id,
        template: template || 'instagram_automation_v1', variables: variables || {},
        ...(automationId && { automation_id: automationId })
      });
    }

    return new Response(JSON.stringify({ success: true, workflowId: n8nResult.id, webhookPath }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});