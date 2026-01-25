import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("Creating workflow...");

    // Get authentication token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Get Supabase configuration
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user authentication using anon key
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized: Invalid or expired token",
        details: authError?.message
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    // Create Supabase client with service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { userId, template, variables, instagramAccountId, workflowName, automationId, autoActivate = false } = body;

    // Fetch automation data if automationId is provided
    let automationData: any = null;
    if (automationId) {
      const { data: automation, error: automationError } = await supabase
        .from("automations")
        .select("trigger_type, trigger_config, actions")
        .eq("id", automationId)
        .eq("user_id", userId)
        .single();

      if (!automationError && automation) {
        automationData = automation;
      } else {
        console.warn("Could not fetch automation data:", automationError?.message);
      }
    }

    // Validate input and ensure userId matches authenticated user
    if (!userId) throw new Error("Missing userId");
    if (userId !== user.id) throw new Error("Unauthorized: userId does not match authenticated user");

    // Fetch user's Instagram account
    let instagramAccount;
    if (instagramAccountId) {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("id", instagramAccountId)
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      if (error || !data) throw new Error("Instagram account not found or inactive");
      instagramAccount = data;
    } else {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) throw new Error("No active Instagram account found. Please connect an Instagram account first.");
      instagramAccount = data;
    }

    // Get n8n credentials
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    if (!n8nBaseUrl || !n8nApiKey) throw new Error("N8N configuration missing");

    // Create workflow name and path
    const finalWorkflowName = workflowName || `Instagram Automation - ${instagramAccount.username} (${instagramAccount.instagram_user_id}) - ${new Date().toISOString().split('T')[0]}`;
    const webhookPath = `instagram-webhook-${userId}-${automationId || Date.now()}`;

    // --- WORKFLOW BUILDERS (WORKER PATTERN) ---

    // 1. DM WORKFLOW
    const buildDMWorkflow = () => {
      const triggerConfig = automationData?.trigger_config as { messageType?: 'all' | 'keywords'; keywords?: string[] } || {};
      const actions = automationData?.actions || [];
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');

      const messageType = triggerConfig.messageType || 'all';
      const keywords = triggerConfig.keywords || [];
      const calendarUrl = variables?.calendarUrl || 'https://calendar.app.google/QmsYv4Q4G5DNeham6';

      const nodes: any[] = [];
      const connections: any = {};
      let nodeYPosition = 560;
      let nodeXPosition = -1568;

      // 1. Webhook
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [nodeXPosition, nodeYPosition],
        parameters: { multipleMethods: true, path: webhookPath, responseMode: "responseNode", options: {} },
        webhookId: webhookPath
      });

      // 2. Adapter
      nodeXPosition += 224;
      nodes.push({
        id: "safely-extract-data", name: "Safely Extract Data", type: "n8n-nodes-base.functionStr", typeVersion: 1,
        position: [nodeXPosition, nodeYPosition],
        parameters: {
          operation: "executeQuery",
          query: "const payload = $json.payload || {};\nconst messageType = payload.sub_type || 'unknown';\nconst text = payload.message?.text || '(Media/Sticker/Other)';\n\nreturn {\n  sender_id: payload.sender?.id,\n  recipient_id: payload.recipient?.id,\n  text: text,\n  type: messageType,\n  payload: payload\n};"
        }
      });

      // 3. Switch
      nodeXPosition += 224;
      const switchRules: any[] = [];
      if (messageType === 'keywords' && keywords.length > 0) {
        keywords.forEach((keyword: string, index: number) => {
          switchRules.push({
            conditions: { options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: `k-${index}`, leftValue: "={{ $json.text }}", rightValue: keyword, operator: { type: "string", operation: "contains" } }], combinator: "and" },
            renameOutput: true, outputKey: keyword.toLowerCase()
          });
        });
      } else {
        switchRules.push({ conditions: { options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: "all", leftValue: "={{ $json.text }}", rightValue: "", operator: { type: "string", operation: "isNotEmpty" } }], combinator: "and" }, renameOutput: true, outputKey: "all_messages" });
      }

      if (sendDmAction?.actionButtons) {
        sendDmAction.actionButtons.forEach((button: any, index: number) => {
          if (!button.url) {
            const p = button.text.toUpperCase().replace(/\s+/g, '_');
            switchRules.push({ conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: "={{ $json.payload.postback?.payload }}", rightValue: p, operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: p });
          }
        });
      }

      const switchNode = { id: "message-switch", name: "Message Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3, position: [nodeXPosition, nodeYPosition], parameters: { rules: { values: switchRules }, options: { ignoreCase: true } } };
      nodes.push(switchNode);

      // 4. Replies
      nodeXPosition += 224;
      let messageYPosition = 304;
      const switchConnections: any[] = [];
      const buttons: any[] = [];
      if (sendDmAction?.actionButtons) {
        sendDmAction.actionButtons.forEach((b: any) => {
          if (b.url) buttons.push({ type: "web_url", url: b.url === 'calendar' ? calendarUrl : b.url, title: b.text });
          else buttons.push({ title: b.text, payload: b.text.toUpperCase().replace(/\s+/g, '_') });
        });
      }
      const title = (sendDmAction as any)?.title || "Hi👋";
      const imageUrl = (sendDmAction as any)?.imageUrl;
      const buildElem = () => { const e: any = { title }; if (imageUrl) e.image_url = imageUrl; if (buttons.length) e.buttons = buttons; return [e]; }
      const payloadObj = { recipient: { id: "{{ $json.sender_id }}" }, message: { attachment: { type: "template", payload: { template_type: "generic", elements: buildElem() } } } };

      const addReply = (name: string, key: string) => {
        nodes.push({
          id: `reply-${key}`, name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeXPosition, messageYPosition],
          parameters: { method: "POST", url: `=https://graph.instagram.com/v24.0/{{ $json.sender_id }}/messages`, sendHeaders: true, headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }, { name: "Authorization", value: `Bearer ${instagramAccount.access_token}` }] }, sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify(payloadObj, null, 2)}`, options: {} }
        });
        const idx = switchRules.findIndex(r => r.outputKey === key);
        if (idx >= 0) switchConnections.push({ node: name, type: "main", index: idx });
        messageYPosition += 200;
      };

      if (messageType === 'keywords' && keywords.length > 0) keywords.forEach(k => addReply(k.toUpperCase(), k.toLowerCase()));
      else addReply("Send First Message", "all_messages");

      if (sendDmAction?.actionButtons) sendDmAction.actionButtons.forEach((b: any) => { if (!b.url) addReply(`Reply ${b.text}`, b.text.toUpperCase().replace(/\s+/g, '_')); });

      // Connections
      connections["Worker Webhook"] = { main: [[{ node: "Safely Extract Data", type: "main", index: 0 }]] };
      connections["Safely Extract Data"] = { main: [[{ node: "Message Switch", type: "main", index: 0 }]] };

      const grouped: any[] = [];
      switchConnections.forEach(c => { if (!grouped[c.index]) grouped[c.index] = []; grouped[c.index].push({ node: c.node, type: c.type, index: 0 }); });
      const main: any[] = [];
      const max = Math.max(...switchConnections.map(c => c.index), -1);
      for (let i = 0; i <= max; i++) main.push(grouped[i] || []);
      connections["Message Switch"] = { main: main };

      return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
    };

    // 2. COMMENT WORKFLOW
    const buildPostCommentWorkflow = () => {
      const triggerConfig = automationData?.trigger_config as { commentsType?: 'all' | 'keywords'; keywords?: string[] } || {};
      const actions = automationData?.actions || [];
      const replyToCommentAction = actions.find((a: any) => a.type === 'reply_to_comment');
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');

      const commentsType = triggerConfig.commentsType || 'all';
      const keywords = triggerConfig.keywords || [];

      const nodes: any[] = [];
      const connections: any = {};
      let nodeYPosition = 560;
      let nodeXPosition = -1568;

      // 1. Webhook
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [nodeXPosition, nodeYPosition],
        parameters: { multipleMethods: true, path: webhookPath, responseMode: "responseNode", options: {} },
        webhookId: webhookPath
      });

      // 2. Adapter
      nodeXPosition += 224;
      nodes.push({
        id: "safely-extract-data", name: "Safely Extract Data", type: "n8n-nodes-base.functionStr", typeVersion: 1,
        position: [nodeXPosition, nodeYPosition],
        parameters: {
          operation: "executeQuery",
          query: "const payload = $json.payload || {};\nconst raw = payload.payload || {};\nconst text = raw.text || raw.message || '';\n\nreturn {\n  comment_id: raw.id,\n  media_id: raw.media?.id,\n  sender_id: raw.from?.id,\n  text: text,\n  type: 'comment',\n  payload: payload\n};"
        }
      });

      // 3. Switch
      nodeXPosition += 224;
      const switchRules: any[] = [];
      if (commentsType === 'keywords' && keywords.length > 0) {
        keywords.forEach((keyword: string, index: number) => {
          switchRules.push({
            conditions: { options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: `k-${index}`, leftValue: "={{ $json.text }}", rightValue: keyword, operator: { type: "string", operation: "contains" } }], combinator: "and" },
            renameOutput: true, outputKey: keyword.toLowerCase()
          });
        });
      } else {
        switchRules.push({ conditions: { options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: "all", leftValue: "={{ $json.text }}", rightValue: "", operator: { type: "string", operation: "isNotEmpty" } }], combinator: "and" }, renameOutput: true, outputKey: "all_comments" });
      }
      nodes.push({ id: "comment-switch", name: "Comment Switch", type: "n8n-nodes-base.switch", typeVersion: 3.3, position: [nodeXPosition, nodeYPosition], parameters: { rules: { values: switchRules }, options: { ignoreCase: true } } });

      // 4. Actions
      nodeXPosition += 224;
      let actionYPosition = 304;
      const switchConnections: any[] = [];
      const replyText = (replyToCommentAction as any)?.text || "Thanks! 🙏";
      const dmText = (sendDmAction as any)?.title || "Thanks for commenting!";

      const addActions = (key: string) => {
        let currentX = nodeXPosition;
        let firstNodeName = "";
        let previousNodeName = "";

        if (replyToCommentAction) {
          const name = `Reply Public ${key}`;
          if (!firstNodeName) firstNodeName = name;
          nodes.push({
            id: `rep-${key}`, name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [currentX, actionYPosition],
            parameters: { method: "POST", url: `=https://graph.instagram.com/v24.0/{{ $json.comment_id }}/replies`, sendHeaders: true, headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }, { name: "Authorization", value: `Bearer ${instagramAccount.access_token}` }] }, sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify({ message: replyText }, null, 2)}`, options: {} }
          });
          previousNodeName = name;
          currentX += 220;
        }

        if (sendDmAction) {
          const name = `DM ${key}`;
          if (!firstNodeName) firstNodeName = name;
          nodes.push({
            id: `dm-${key}`, name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [currentX, actionYPosition],
            parameters: { method: "POST", url: `=https://graph.instagram.com/v24.0/me/messages`, sendHeaders: true, headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }, { name: "Authorization", value: `Bearer ${instagramAccount.access_token}` }] }, sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify({ recipient: { comment_id: "{{ $json.comment_id }}" }, message: { text: dmText } }, null, 2)}`, options: {} }
          });
          if (previousNodeName) connections[previousNodeName] = { main: [[{ node: name, type: "main", index: 0 }]] };
        }

        if (firstNodeName) {
          const idx = switchRules.findIndex(r => r.outputKey === key);
          if (idx >= 0) switchConnections.push({ node: firstNodeName, type: "main", index: idx });
        }
        actionYPosition += 250;
      };

      if (commentsType === 'keywords' && keywords.length > 0) keywords.forEach(k => addActions(k.toLowerCase()));
      else addActions("all_comments");

      connections["Worker Webhook"] = { main: [[{ node: "Safely Extract Data", type: "main", index: 0 }]] };
      connections["Safely Extract Data"] = { main: [[{ node: "Comment Switch", type: "main", index: 0 }]] };

      const grouped: any[] = [];
      switchConnections.forEach(c => { if (!grouped[c.index]) grouped[c.index] = []; grouped[c.index].push({ node: c.node, type: c.type, index: 0 }); });
      const main: any[] = [];
      const max = Math.max(...switchConnections.map(c => c.index), -1);
      for (let i = 0; i <= max; i++) main.push(grouped[i] || []);
      connections["Comment Switch"] = { main: main };

      return { name: finalWorkflowName, nodes, connections, settings: { saveExecutionProgress: true, timezone: "Asia/Kolkata" } };
    };

    // --- MAIN LOGIC ---
    let n8nWorkflowJSON = null;
    const triggerType = automationData?.trigger_type || "user_dm"; // Default

    if (triggerType === 'user_dm' || triggerType === 'user_directed_messages' || triggerType === 'story_reply' || triggerType === 'dm_keyword' || triggerType === 'dm') {
      n8nWorkflowJSON = buildDMWorkflow();
    } else if (triggerType === 'comments') {
      n8nWorkflowJSON = buildPostCommentWorkflow();
    } else {
      // Fallback for verification/other
      n8nWorkflowJSON = buildDMWorkflow();
    }

    // Send to n8n
    const createRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
      body: JSON.stringify(n8nWorkflowJSON)
    });

    if (!createRes.ok) throw new Error(`n8n Error: ${createRes.status} ${await createRes.text()}`);
    const n8nResult = await createRes.json();

    console.log("Workflow created in n8n:", n8nResult.id);

    // Auto Activate if requested
    if (autoActivate) {
      await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, { method: "POST", headers: { "X-N8N-API-KEY": n8nApiKey } });
    }

    // Store in DB
    await supabase.from("n8n_workflows").insert({
      user_id: user.id, n8n_workflow_id: n8nResult.id, n8n_workflow_name: n8nResult.name,
      webhook_path: webhookPath, instagram_account_id: instagramAccount.id,
      template: template || 'instagram_automation_v1', variables: variables || {},
      ...(automationId && { automation_id: automationId })
    });

    return new Response(JSON.stringify({
      success: true, workflowId: n8nResult.id, workflowName: n8nResult.name,
      webhookPath: webhookPath, webhookUrl: `${n8nBaseUrl}/webhook/${webhookPath}`,
      instagramAccount: { id: instagramAccount.id, username: instagramAccount.username },
      message: `Workflow created successfully`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});