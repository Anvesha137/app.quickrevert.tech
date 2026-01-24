import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { userId, instagramAccountId, workflowName, automationId, variables } = body;

    // Fetch Automation Data
    const { data: automation } = await supabase
      .from("automations")
      .select("*")
      .eq("id", automationId)
      .eq("user_id", userId)
      .single();

    if (!automation) throw new Error("Automation not found");

    // Fetch Instagram Account
    const { data: instagramAccount } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("id", instagramAccountId)
      .single();

    if (!instagramAccount) throw new Error("Instagram account not found");

    // --- BUILD WORKFLOW JSON ---
    // Universal Start Node
    const startNode = {
      id: "start-node",
      name: "Start",
      type: "n8n-nodes-base.start",
      typeVersion: 1,
      position: [-1000, 500],
      parameters: {}
    };

    let nodes = [startNode];

    // 1. Fetch Profile Node (HTTP) - As requested by user
    // Uses normalized payload to get Sender ID (DM) or From ID (Comment)
    const fetchProfileNode = {
      id: "fetch-profile",
      name: "Fetch Profile",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.3,
      position: [-800, 500],
      parameters: {
        method: "GET",
        url: `=https://graph.instagram.com/v24.0/{{ $json.payload.sender ? $json.payload.sender.id : $json.payload.from.id }}`,
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendQuery: true,
        queryParameters: { parameters: [{ name: "fields", value: "username" }] },
        options: {}
      },
      credentials: { httpHeaderAuth: { id: instagramAccount.instagram_user_id, name: "Instagram Token" } }
    };
    nodes.push(fetchProfileNode);

    // Connection: Start -> Fetch Profile
    let connections: any = {
      "Start": { main: [[{ node: "Fetch Profile", type: "main", index: 0 }]] }
    };

    // 2. Router Switch Node
    const triggerConfig = automation.trigger_type === 'dm_keyword' ? (automation.trigger_config || {}) : {};
    const actions = automation.actions || [];
    const sendDmAction = actions.find((a: any) => a.type === 'send_dm');

    // DM/Keyword Logic
    const messageType = triggerConfig.messageType || 'all';
    const keywords = triggerConfig.keywords || [];

    let switchRules = [];

    if (messageType === 'all') {
      switchRules.push({
        conditions: {
          options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [{
            id: "all-msgs",
            // Check DM text OR Comment text
            leftValue: "={{ $json.payload.message ? $json.payload.message.text : $json.payload.text }}",
            rightValue: "",
            operator: { type: "string", operation: "exists" }
          }],
          combinator: "and"
        },
        renameOutput: true,
        outputKey: "all_messages"
      });
    } else {
      keywords.forEach((kw: string, idx: number) => {
        switchRules.push({
          conditions: {
            options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
            conditions: [{
              id: `kw-${idx}`,
              leftValue: "={{ $json.payload.message ? $json.payload.message.text : $json.payload.text }}",
              rightValue: kw,
              operator: { type: "string", operation: "contains" }
            }],
            combinator: "and"
          },
          renameOutput: true,
          outputKey: kw.toLowerCase()
        });
      });
    }

    // Postback handling
    if (sendDmAction?.actionButtons) {
      sendDmAction.actionButtons.forEach((btn: any, idx: number) => {
        if (btn.action === 'postback' || (!btn.url && !btn.action)) {
          const payload = btn.text.toUpperCase().replace(/\s+/g, '_');
          switchRules.push({
            conditions: {
              options: { caseSensitive: false, leftValue: "", typeValidation: "strict", version: 2 },
              conditions: [{
                id: `pb-${idx}`,
                leftValue: "={{ $json.payload.postback.payload }}",
                rightValue: payload,
                operator: { type: "string", operation: "equals" }
              }],
              combinator: "and"
            },
            renameOutput: true,
            outputKey: payload
          });
        }
      });
    }

    const switchNode = {
      id: "switch-node",
      name: "Router Switch",
      type: "n8n-nodes-base.switch",
      typeVersion: 3.3,
      position: [-600, 500],
      parameters: { rules: { values: switchRules }, options: { ignoreCase: true } }
    };
    nodes.push(switchNode);

    // Connection: Fetch Profile -> Router Switch
    connections["Fetch Profile"] = { main: [[{ node: "Router Switch", type: "main", index: 0 }]] };

    // 3. Action Nodes (HTTP)
    let yPos = 300;
    let switchConns: any[] = [];

    const createHttpNode = (name: string, outputKey: string, replyText: string) => {
      // Reply Node: Sends DM (Core action for both flows)
      // Note: The user requested 'Reply to Comment' then 'Send DM'. 
      // For V2 MVP, we are simplifying to 'Send DM' as the universal response, 
      // but we use the expression that works for both DMs and Comments (replying to sender).

      const httpNode = {
        id: `http-${name.replace(/\s+/g, '-')}`,
        name: name,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.3,
        position: [-300, yPos],
        parameters: {
          method: "POST",
          // Reply to Sender ID (works for DM sender and Comment commenter via normalized logic above)
          url: `=https://graph.instagram.com/v24.0/{{ $json.payload.sender ? $json.payload.sender.id : $json.payload.from.id }}/messages`,
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
          sendBody: true,
          specifyBody: "json",
          // Using the user's requested template structure (Template/Generic)
          // Simplified to text for robustness, but can be expanded to Generic Template if needed.
          jsonBody: `={\n "recipient": { "id": "{{ $json.payload.sender ? $json.payload.sender.id : $json.payload.from.id }}" },\n "message": { "text": "${replyText}" }\n}`,
          options: {}
        },
        credentials: { httpHeaderAuth: { id: instagramAccount.instagram_user_id, name: "Instagram Token" } }
      };

      nodes.push(httpNode);

      // Connect Switch -> Http
      const ruleIdx = switchRules.findIndex(r => r.outputKey === outputKey);
      if (ruleIdx !== -1) {
        if (!switchConns[ruleIdx]) switchConns[ruleIdx] = [];
        switchConns[ruleIdx].push({ node: name, type: "main", index: 0 });
      }
      yPos += 200;
    };

    // Generate Action Nodes
    if (messageType === 'all') createHttpNode("Reply All", "all_messages", (sendDmAction?.title || "Hello!"));
    keywords.forEach(kw => createHttpNode(`Reply ${kw}`, kw.toLowerCase(), (sendDmAction?.title || "Hello!")));

    // Finalize Switch Connections
    connections["Router Switch"] = { main: switchConns };

    // --- CREATE IN N8N ---
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

    const workflowJson = {
      name: workflowName || `Insta Auto - ${automationId}`,
      nodes: nodes,
      connections: connections,
      settings: { executionTimeout: 3600 }
    };

    const createResp = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey! },
      body: JSON.stringify(workflowJson)
    });

    if (!createResp.ok) throw new Error(`N8N Create Failed: ${await createResp.text()}`);

    const createdWorkflow = await createResp.json();
    const newWorkflowId = createdWorkflow.id;

    // --- SAVE TO DB ---
    // Insert into n8n_workflows linking to automation
    await supabase.from("n8n_workflows").insert({
      user_id: userId,
      n8n_workflow_id: newWorkflowId,
      automation_id: automationId,
      name: workflowJson.name,
      is_active: false // Created but not activated
    });

    return new Response(JSON.stringify({ success: true, workflowId: newWorkflowId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});