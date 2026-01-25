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

    const finalWorkflowName = workflowName || `Instagram Automation - ${instagramAccount.username} (${instagramAccount.instagram_user_id}) - ${new Date().toISOString().split('T')[0]}`;
    const webhookPath = `instagram-webhook-${userId}-${automationId || Date.now()}`;

    // --- BUILDERS ---
    const buildWorkflow = () => {
      const triggerType = automationData?.trigger_type || "user_dm";
      const actions = automationData?.actions || [];
      const triggerConfig = automationData?.trigger_config || {};

      const nodes: any[] = [];
      let nodeX = -1000;

      // 1. Webhook (Standard Worker)
      nodes.push({
        id: "webhook-node", name: "Worker Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [nodeX, 300],
        parameters: { multipleMethods: true, path: webhookPath, responseMode: "onReceived", options: {} },
        webhookId: webhookPath
      });
      nodeX += 250;

      // 2. Code Node (Robust Parsing)
      // Handles: Router payload (payload.*) OR Direct payload (body.entry[0]...)
      const jsCode = `
const items = $input.all();
const results = [];

for (const item of items) {
  const json = item.json;
  // 1. Router Payload?
  let data = json.payload;
  let type = json.sub_type || 'unknown';
  
  // 2. Direct Meta Payload?
  if (!data && json.body?.entry?.[0]) {
     const entry = json.body.entry[0];
     if (entry.messaging?.[0]) {
         data = entry.messaging[0];
         type = data.message ? 'message' : (data.postback ? 'postback' : 'unknown');
     } else if (entry.changes?.[0]?.value) {
         data = entry.changes[0].value;
         type = 'comment'; // simplified
     }
  }
  
  // Fallback
  if (!data) data = {};

  const text = data.message?.text || data.text || '(Media/Other)';
  const senderId = data.sender?.id || data.from?.id;
  const recipientId = data.recipient?.id;
  const commentId = data.id; // for comments
  const mediaId = data.media?.id;

  results.push({
    json: {
       sender_id: senderId,
       recipient_id: recipientId,
       comment_id: commentId,
       text: text,
       type: type,
       raw: data
    }
  });
}

return results;
`;
      nodes.push({
        id: "extract-data", name: "Extract Data", type: "n8n-nodes-base.code", typeVersion: 2, position: [nodeX, 300],
        parameters: { jsCode: jsCode.trim() }
      });
      nodeX += 250;

      // 3. Actions (No Switch - Direct wiring)
      // Determine action based on automation
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
      const replyCommentAction = actions.find((a: any) => a.type === 'reply_to_comment');

      let previousNode = "Extract Data";

      if (triggerType === 'comments' && replyCommentAction) {
        const text = replyCommentAction.text || "Thanks!";
        const name = "Reply to Comment";
        nodes.push({
          id: "act-reply-comment", name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
          parameters: {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/{{ $json.comment_id }}/replies`,
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json", jsonBody: `=${JSON.stringify({ message: text }, null, 2)}`, options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });
        previousNode = name; // Update chain
        nodeX += 250;
      }

      if (sendDmAction) {
        // For DM trigger or DM action after comment
        const text = sendDmAction.title || "Hello!";
        const name = "Send DM";
        nodes.push({
          id: "act-send-dm", name: name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.3, position: [nodeX, 300],
          parameters: {
            method: "POST",
            url: `=https://graph.instagram.com/v24.0/me/messages`, // User requested graph.facebook.com/v19.0/me/messages
            authentication: "predefinedCredentialType", nodeCredentialType: "facebookGraphApi",
            sendBody: true, specifyBody: "json",
            // If coming from Comment, use recipient.comment_id. If DM, use recipient.id
            jsonBody: `={
  "recipient": {
    "id": "{{ $json.type === 'comment' ? undefined : $json.sender_id }}",
    "comment_id": "{{ $json.type === 'comment' ? $json.comment_id : undefined }}"
  },
  "message": { "text": "${text.replace(/"/g, '\\"')}" }
}`,
            options: {}
          },
          credentials: { facebookGraphApi: { id: credentialId } }
        });
        // Note: graph.facebook.com/v19.0/me/messages works for both DM replies and Private Replies to comments? 
        // Yes, if `recipient.comment_id` is used.
      }

      // Wiring
      const connections: any = { "Worker Webhook": { main: [[{ node: "Extract Data", type: "main", index: 0 }]] } };

      // Linear chain
      if (nodes.length > 2) {
        for (let i = 1; i < nodes.length - 1; i++) {
          connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: "main", index: 0 }]] };
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
      const trigger = automationData?.trigger_type || 'user_dm';
      let eventType = 'messaging';
      let subType: string | null = 'message';

      if (trigger === 'comments') {
        eventType = 'changes';
        subType = 'comments'; // broadly catch comments
      } else {
        // DMs, Story Replies, etc.
        eventType = 'messaging';
        subType = 'message';
      }

      // Upsert Route
      const { error: routeError } = await supabase.from('automation_routes').insert({
        user_id: user.id,
        account_id: instagramAccount.instagram_user_id, // Meta ID
        event_type: eventType,
        sub_type: subType,
        n8n_workflow_id: n8nResult.id, // Correct Column
        is_active: true
      });

      if (routeError) console.error("Auto-Route Error:", routeError);
    }

    return new Response(JSON.stringify({ success: true, workflowId: n8nResult.id, webhookPath }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});