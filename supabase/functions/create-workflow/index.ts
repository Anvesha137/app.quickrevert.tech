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
      console.error("Missing Supabase config:", {
        url: !!supabaseUrl,
        anonKey: !!supabaseAnonKey,
        serviceKey: !!supabaseServiceKey
      });
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user authentication using anon key
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    
    if (authError || !user) {
      console.error("Authentication error:", {
        error: authError?.message,
        errorCode: authError?.status,
        hasUser: !!user,
        tokenLength: jwt.length
      });
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
    
    console.log("User ID:", userId);
    console.log("Template:", template);
    console.log("Variables:", variables);
    console.log("Instagram Account ID:", instagramAccountId);
    console.log("Automation ID:", automationId);
    
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
        console.log("Automation data fetched:", {
          trigger_type: automation.trigger_type,
          has_trigger_config: !!automation.trigger_config,
          actions_count: automation.actions?.length || 0
        });
      } else {
        console.warn("Could not fetch automation data:", automationError?.message);
      }
    }
    
    // Validate input and ensure userId matches authenticated user
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure the userId in the request matches the authenticated user
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized: userId does not match authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's Instagram account(s)
    let instagramAccount;
    if (instagramAccountId) {
      // Fetch specific account
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("id", instagramAccountId)
        .eq("user_id", userId)
        .eq("status", "active")
        .single();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Instagram account not found or inactive" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instagramAccount = data;
    } else {
      // Fetch first active account
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: "No active Instagram account found. Please connect an Instagram account first." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      instagramAccount = data;
    }

    console.log("Using Instagram account:", instagramAccount.username);

    // Get n8n credentials from environment variables
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY");
    
    console.log("N8N Base URL:", n8nBaseUrl ? "Set" : "Not set");
    console.log("N8N API Key:", n8nApiKey ? "Set (masked)" : "Not set");
    
    if (!n8nBaseUrl) {
      console.error("N8N_BASE_URL not configured");
      return new Response(JSON.stringify({ error: "N8N_BASE_URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!n8nApiKey) {
      console.error("X-N8N-API-KEY not configured");
      return new Response(JSON.stringify({ error: "X-N8N-API-KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create workflow name - include Instagram ID by default
    const finalWorkflowName = workflowName || `Instagram Automation - ${instagramAccount.username} (${instagramAccount.instagram_user_id}) - ${new Date().toISOString().split('T')[0]}`;
    const webhookPath = `instagram-webhook-${userId}-${automationId || Date.now()}`;
    
    // Helper function to recursively replace placeholders in workflow nodes
    const replacePlaceholders = (obj: any): any => {
      if (typeof obj === "string") {
        return obj
          .replace(/\{\{userId\}\}/g, userId)
          .replace(/\{\{automationId\}\}/g, automationId || "")
          .replace(/\{\{instagramAccessToken\}\}/g, instagramAccount.access_token)
          .replace(/\{\{instagramCredentialId\}\}/g, instagramAccount.instagram_user_id)
          .replace(/\{\{instagramUsername\}\}/g, instagramAccount.username)
          .replace(/\{\{calendarUrl\}\}/g, variables?.calendarUrl || 'https://calendar.app.google/QmsYv4Q4G5DNeham6')
          .replace(/\{\{brandName\}\}/g, variables?.brandName || 'QuickRevert');
      } else if (Array.isArray(obj)) {
        return obj.map(item => replacePlaceholders(item));
      } else if (obj !== null && typeof obj === "object") {
        const result: any = {};
        for (const key in obj) {
          result[key] = replacePlaceholders(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    // Build DM workflow function
    const buildDMWorkflow = () => {
      const triggerConfig = automationData?.trigger_config as { messageType?: 'all' | 'keywords'; keywords?: string[] } || {};
      const actions = automationData?.actions || [];
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
      
      const messageType = triggerConfig.messageType || 'all';
      const keywords = triggerConfig.keywords || [];
      const calendarUrl = variables?.calendarUrl || 'https://calendar.app.google/QmsYv4Q4G5DNeham6';
      const brandName = variables?.brandName || 'QuickRevert';
      
      const nodes: any[] = [];
      const connections: any = {};
      let nodeYPosition = 560;
      let nodeXPosition = -1568;
      
      // 1. Webhook node
      const webhookNode = {
        id: "webhook-node",
        name: "Instagram Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [nodeXPosition, nodeYPosition],
        parameters: {
          multipleMethods: true,
          path: webhookPath,
          responseMode: "responseNode",
          options: {}
        },
        webhookId: webhookPath
      };
      nodes.push(webhookNode);
      
      // 2. Webhook verification (for Instagram webhook setup)
      nodeXPosition += 224;
      const verificationNode = {
        id: "webhook-verification",
        name: "Webhook Verification",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [nodeXPosition, 80],
        parameters: {
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: "",
              typeValidation: "strict",
              version: 2
            },
            conditions: [
              {
                id: "verify-mode",
                leftValue: "={{ $json.query['hub.mode'] }}",
                rightValue: "subscribe",
                operator: {
                  type: "string",
                  operation: "equals",
                  name: "filter.operator.equals"
                }
              }
            ],
            combinator: "and"
          },
          options: {}
        }
      };
      nodes.push(verificationNode);
      
      // 3. Respond to webhook (for verification)
      nodeXPosition += 224;
      const respondNode = {
        id: "respond-to-webhook",
        name: "Respond to Webhook",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.4,
        position: [nodeXPosition, 80],
        parameters: {
          respondWith: "text",
          responseBody: "={{ $json.query['hub.challenge'] }}",
          options: {}
        }
      };
      nodes.push(respondNode);
      
      // 4. Message Switch node
      nodeXPosition = -1216;
      const switchRules: any[] = [];
      
      if (messageType === 'keywords' && keywords.length > 0) {
        // Add rules for each keyword
        keywords.forEach((keyword: string, index: number) => {
          switchRules.push({
            conditions: {
              options: {
                caseSensitive: false,
                leftValue: "",
                typeValidation: "strict",
                version: 2
              },
              conditions: [
                {
                  id: `keyword-${index}`,
                  leftValue: "={{ $('Instagram Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                  rightValue: keyword.toLowerCase(),
                  operator: {
                    type: "string",
                    operation: "contains"
                  }
                }
              ],
              combinator: "and"
            },
            renameOutput: true,
            outputKey: keyword.toLowerCase()
          });
        });
      } else if (messageType === 'all') {
        // Check if message text is empty (for "all messages")
        switchRules.push({
          conditions: {
            options: {
              caseSensitive: false,
              leftValue: "",
              typeValidation: "strict",
              version: 2
            },
            conditions: [
              {
                id: "empty-message",
                leftValue: "={{ $('Instagram Webhook').item.json.body.entry[0].messaging[0].message.text }}",
                rightValue: "",
                operator: {
                  type: "string",
                  operation: "equals",
                  name: "filter.operator.equals"
                }
              }
            ],
            combinator: "and"
          },
          renameOutput: true,
          outputKey: "all_messages"
        });
      }
      
      // Add postback handlers for buttons
      if (sendDmAction?.actionButtons) {
        sendDmAction.actionButtons.forEach((button: any, index: number) => {
          const buttonAction = button.action || (button.url ? 'url' : 'postback');
          
          if (buttonAction === 'postback' || !button.url) {
            // Button without URL = postback type
            const payload = button.text.toUpperCase().replace(/\s+/g, '_');
            switchRules.push({
              conditions: {
                options: {
                  caseSensitive: false,
                  leftValue: "",
                  typeValidation: "strict",
                  version: 2
                },
                conditions: [
                  {
                    id: `postback-${index}`,
                    leftValue: "={{ $json.body.entry[0].messaging[0].postback.payload }}",
                    rightValue: payload,
                    operator: {
                      type: "string",
                      operation: "equals",
                      name: "filter.operator.equals"
                    }
                  }
                ],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: payload
            });
          }
        });
      }
      
      const switchNode = {
        id: "message-switch",
        name: "Message Switch",
        type: "n8n-nodes-base.switch",
        typeVersion: 3.3,
        position: [nodeXPosition, nodeYPosition + 224],
        parameters: {
          rules: {
            values: switchRules
          },
          options: {
            ignoreCase: true
          }
        }
      };
      nodes.push(switchNode);
      
      // 5. Create HTTP request nodes for each keyword
      nodeXPosition += 224;
      let messageYPosition = 304;
      const switchConnections: any[] = [];
      
      if (sendDmAction) {
        const buttons: any[] = [];
        sendDmAction.actionButtons?.forEach((button: any) => {
          const buttonAction = button.action || (button.url ? 'url' : 'postback');
          
          if (buttonAction === 'url' || buttonAction === 'calendar') {
            buttons.push({
              type: "web_url",
              url: buttonAction === 'calendar' || button.url === 'calendar' ? calendarUrl : button.url,
              title: button.text
            });
          } else if (buttonAction === 'postback' || !button.url) {
            const payload = button.text.toUpperCase().replace(/\s+/g, '_');
            buttons.push({
              type: "postback",
              title: button.text,
              payload: payload
            });
          }
        });
        
        // Create HTTP request node for each keyword
        if (messageType === 'keywords' && keywords.length > 0) {
          keywords.forEach((keyword: string, index: number) => {
            const keywordUpper = keyword.toUpperCase();
            const keywordNodeId = `http-node-${keyword.toLowerCase().replace(/\s+/g, '-')}`;
            const keywordNodeName = keywordUpper;
            
            const keywordNode = {
              id: keywordNodeId,
              name: keywordNodeName,
              type: "n8n-nodes-base.httpRequest",
              typeVersion: 4.3,
              position: [nodeXPosition, messageYPosition],
              parameters: {
                method: "POST",
                url: `=https://graph.instagram.com/v24.0/{{ $('Instagram Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages`,
                authentication: "genericCredentialType",
                genericAuthType: "httpHeaderAuth",
                sendHeaders: true,
                headerParameters: {
                  parameters: [
                    {
                      name: "Content-Type",
                      value: "application/json"
                    },
                    {
                      name: "Authorization",
                      value: "Bearer {{access_token}}"
                    }
                  ]
                },
                sendBody: true,
                specifyBody: "json",
                jsonBody: `={\n  "recipient": {\n    "id": "{{ $json.body.entry[0].messaging[0].sender.id }}"\n  },\n  "message": {\n    "attachment": {\n      "type": "template",\n      "payload": {\n        "template_type": "generic",\n        "elements": [\n          {\n            "title": "Hi👋",\n            "image_url": "https://i.ibb.co/N29QzF6Z/QR-Logo.png",\n            "subtitle": "${(sendDmAction.messageTemplate || `Thank you for reaching out to ${brandName}!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing ${brandName}!`).replace(/\n/g, '\\n').replace(/"/g, '\\"')}",\n            "buttons": ${JSON.stringify(buttons)}\n          }\n        ]\n      }\n    }\n  }\n}\n`,
                options: {}
              },
              credentials: {
                httpHeaderAuth: {
                  id: instagramAccount.instagram_user_id,
                  name: "Instagram Access Token"
                }
              }
            };
            nodes.push(keywordNode);
            
            // Add connection from switch to this keyword node
            const switchOutputIndex = switchRules.findIndex((r: any) => r.outputKey === keyword.toLowerCase());
            if (switchOutputIndex >= 0) {
              switchConnections.push({
                node: keywordNodeName,
                type: "main",
                index: switchOutputIndex
              });
            }
            
            messageYPosition += 192;
          });
        } else if (messageType === 'all') {
          // Create single HTTP request node for "all messages"
          const allMessagesNode = {
            id: "send-first-message",
            name: "Send First Message",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4.3,
            position: [nodeXPosition, messageYPosition],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/{{ $('Instagram Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages`,
              authentication: "genericCredentialType",
              genericAuthType: "httpHeaderAuth",
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: "Content-Type",
                    value: "application/json"
                  },
                  {
                    name: "Authorization",
                    value: "Bearer {{access_token}}"
                  }
                ]
              },
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  "recipient": {\n    "id": "{{ $json.body.entry[0].messaging[0].sender.id }}"\n  },\n  "message": {\n    "attachment": {\n      "type": "template",\n      "payload": {\n        "template_type": "generic",\n        "elements": [\n          {\n            "title": "Hi👋",\n            "image_url": "https://i.ibb.co/N29QzF6Z/QR-Logo.png",\n            "subtitle": "${(sendDmAction.messageTemplate || `Thank you for reaching out to ${brandName}!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing ${brandName}!`).replace(/\n/g, '\\n').replace(/"/g, '\\"')}",\n            "buttons": ${JSON.stringify(buttons)}\n          }\n        ]\n      }\n    }\n  }\n}\n`,
              options: {}
            },
            credentials: {
              httpHeaderAuth: {
                id: instagramAccount.instagram_user_id,
                name: "Instagram Access Token"
              }
            }
          };
          nodes.push(allMessagesNode);
          
          // Add connection from switch to all messages node
          const switchOutputIndex = switchRules.findIndex((r: any) => r.outputKey === 'all_messages');
          if (switchOutputIndex >= 0) {
            switchConnections.push({
              node: "Send First Message",
              type: "main",
              index: switchOutputIndex
            });
          }
        }
      }
      
      // 6. Button handler nodes (for postbacks)
      if (sendDmAction?.actionButtons) {
        sendDmAction.actionButtons.forEach((button: any, index: number) => {
          const buttonAction = button.action || (button.url ? 'url' : 'postback');
          
          if (buttonAction === 'postback' || !button.url) {
            const payload = button.text.toUpperCase().replace(/\s+/g, '_');
            
            const buttonHandlerNode = {
              id: `button-handler-${index}`,
              name: `${button.text} Handler`,
              type: "n8n-nodes-base.httpRequest",
              typeVersion: 4.3,
              position: [nodeXPosition, messageYPosition],
              parameters: {
                method: "POST",
                url: `=https://graph.instagram.com/v24.0/{{ $('Instagram Webhook').item.json.body.entry[0].messaging[0].recipient.id }}/messages`,
                authentication: "genericCredentialType",
                genericAuthType: "httpHeaderAuth",
                sendHeaders: true,
                headerParameters: {
                  parameters: [
                    {
                      name: "Content-Type",
                      value: "application/json"
                    },
                    {
                      name: "Authorization",
                      value: "Bearer {{access_token}}"
                    }
                  ]
                },
                sendBody: true,
                specifyBody: "json",
                jsonBody: `={\n  "recipient": {\n    "id": "{{ $json.body.entry[0].messaging[0].sender.id }}"\n  },\n  "message": {\n    "attachment": {\n      "type": "template",\n      "payload": {\n        "template_type": "generic",\n        "elements": [\n          {\n            "title": "Great choice\\nOur ${button.text} solution helps businesses reply instantly, qualify leads, and manage all customer conversations in one place.\\n\\nOne of our experts will contact you soon to guide you further.\\n\\nYou can also book a quick demo to see how it works📅",\n            "image_url": "https://i.ibb.co/N29QzF6Z/QR-Logo.png",\n            "subtitle": "Thank you for choosing ${brandName}!",\n            "buttons": [\n              {\n                "type": "web_url",\n                "url": "${calendarUrl}",\n                "title": "Book Demo"\n              }\n            ]\n          }\n        ]\n      }\n    }\n  }\n}\n`,
                options: {}
              },
              credentials: {
                httpHeaderAuth: {
                  id: instagramAccount.instagram_user_id,
                  name: "Instagram Access Token"
                }
              }
            };
            nodes.push(buttonHandlerNode);
            
            // Add connection from switch to button handler
            const payloadIndex = switchRules.findIndex((r: any) => r.outputKey === payload);
            if (payloadIndex >= 0) {
              switchConnections.push({
                node: `${button.text} Handler`,
                type: "main",
                index: payloadIndex
              });
            }
            
            messageYPosition += 192;
          }
        });
      }
      
      // Set up connections
      connections["Instagram Webhook"] = {
        main: [
          [
            {
              node: "Webhook Verification",
              type: "main",
              index: 0
            }
          ],
          [
            {
              node: "Message Switch",
              type: "main",
              index: 0
            }
          ]
        ]
      };
      
      connections["Webhook Verification"] = {
        main: [
          [
            {
              node: "Respond to Webhook",
              type: "main",
              index: 0
            }
          ]
        ]
      };
      
      if (switchConnections.length > 0) {
        connections["Message Switch"] = {
          main: [switchConnections]
        };
      }
      
      return {
        name: finalWorkflowName,
        nodes: nodes,
        connections: connections,
        settings: {
          saveExecutionProgress: true,
          saveManualExecutions: true,
          saveDataErrorExecution: "all",
          saveDataSuccessExecution: "all",
          executionTimeout: 3600,
          timezone: "Asia/Kolkata"
        }
      };
    };

    // Build Post Comment workflow function
    const buildPostCommentWorkflow = () => {
      const triggerConfig = automationData?.trigger_config as { commentsType?: 'all' | 'keywords'; keywords?: string[] } || {};
      const actions = automationData?.actions || [];
      const replyToCommentAction = actions.find((a: any) => a.type === 'reply_to_comment');
      const askToFollowAction = actions.find((a: any) => a.type === 'ask_to_follow');
      const sendDmAction = actions.find((a: any) => a.type === 'send_dm');
      
      const commentsType = triggerConfig.commentsType || 'all';
      const keywords = triggerConfig.keywords || [];
      const calendarUrl = variables?.calendarUrl || 'https://calendar.app.google/QmsYv4Q4G5DNeham6';
      const brandName = variables?.brandName || 'QuickRevert';
      
      const nodes: any[] = [];
      const connections: any = {};
      let nodeYPosition = 560;
      let nodeXPosition = -1568;
      
      // 1. Webhook node
      const webhookNode = {
        id: "webhook-node",
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [nodeXPosition, nodeYPosition],
        parameters: {
          multipleMethods: true,
          path: webhookPath,
          responseMode: "responseNode",
          options: {}
        },
        webhookId: webhookPath
      };
      nodes.push(webhookNode);
      
      // 2. Webhook verification (for Instagram webhook setup)
      nodeXPosition += 224;
      const verificationNode = {
        id: "webhook-verification",
        name: "If",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [nodeXPosition, 80],
        parameters: {
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: "",
              typeValidation: "strict",
              version: 2
            },
            conditions: [
              {
                id: "verify-mode",
                leftValue: "={{ $json.query['hub.mode'] }}",
                rightValue: "subscribe",
                operator: {
                  type: "string",
                  operation: "equals",
                  name: "filter.operator.equals"
                }
              },
              {
                id: "verify-token",
                leftValue: "={{ $json.query['hub.verify_token'] }}",
                rightValue: "={{ $json.query['hub.verify_token'] }}",
                operator: {
                  type: "string",
                  operation: "equals",
                  name: "filter.operator.equals"
                }
              }
            ],
            combinator: "and"
          },
          options: {}
        }
      };
      nodes.push(verificationNode);
      
      // 3. Respond to webhook (for verification)
      nodeXPosition += 224;
      const respondNode = {
        id: "respond-to-webhook",
        name: "Respond to Webhook",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.4,
        position: [nodeXPosition, 80],
        parameters: {
          respondWith: "text",
          responseBody: "={{ $json.query['hub.challenge'] }}",
          options: {}
        }
      };
      nodes.push(respondNode);
      
      // 4. Comment Switch node
      nodeXPosition = -1344;
      const switchRules: any[] = [];
      
      if (commentsType === 'keywords' && keywords.length > 0) {
        // Add rules for each keyword
        keywords.forEach((keyword: string, index: number) => {
          switchRules.push({
            conditions: {
              options: {
                caseSensitive: false,
                leftValue: "",
                typeValidation: "strict",
                version: 2
              },
              conditions: [
                {
                  id: `keyword-${index}`,
                  leftValue: "={{ $json.body.entry[0].changes[0].value.text }}",
                  rightValue: keyword,
                  operator: {
                    type: "string",
                    operation: "equals"
                  }
                }
              ],
              combinator: "and"
            },
            renameOutput: true,
            outputKey: keyword.toLowerCase()
          });
        });
      } else if (commentsType === 'all') {
        // For "all comments", match any comment
        switchRules.push({
          conditions: {
            options: {
              caseSensitive: false,
              leftValue: "",
              typeValidation: "strict",
              version: 2
            },
            conditions: [
              {
                id: "all-comments",
                leftValue: "={{ $json.body.entry[0].changes[0].value.text }}",
                rightValue: "",
                operator: {
                  type: "string",
                  operation: "notEmpty"
                }
              }
            ],
            combinator: "and"
          },
          renameOutput: true,
          outputKey: "all_comments"
        });
      }
      
      const switchNode = {
        id: "comment-switch",
        name: "Switch3",
        type: "n8n-nodes-base.switch",
        typeVersion: 3.3,
        position: [nodeXPosition, nodeYPosition - 304],
        parameters: {
          rules: {
            values: switchRules
          },
          options: {
            ignoreCase: true
          }
        }
      };
      nodes.push(switchNode);
      
      // 5. Create Reply to Comment nodes for each keyword
      nodeXPosition += 224;
      let replyYPosition = nodeYPosition - 304;
      const switchConnections: any[] = [];
      const actionChains: any = {}; // Track action chains for each keyword
      const keywordYPositions: any = {}; // Track Y position for each keyword branch
      
      if (replyToCommentAction) {
        // Get random reply template (we'll use first one, but n8n can randomize)
        const replyTemplates = replyToCommentAction.replyTemplates || [];
        const replyText = replyTemplates.length > 0 
          ? replyTemplates[0] 
          : `Thank you for your comment!`;
        
        // Build buttons for reply if any
        const replyButtons: any[] = [];
        if (replyToCommentAction.actionButtons && replyToCommentAction.actionButtons.length > 0) {
          replyToCommentAction.actionButtons.forEach((button: any) => {
            if (button.url) {
              replyButtons.push({
                type: "web_url",
                url: button.url === 'calendar' ? calendarUrl : button.url,
                title: button.text
              });
            }
          });
        }
        
        if (commentsType === 'keywords' && keywords.length > 0) {
          keywords.forEach((keyword: string, index: number) => {
            const keywordUpper = keyword.toUpperCase();
            const keywordKey = keyword.toLowerCase();
            const replyNodeId = `reply-comment-${keywordKey.replace(/\s+/g, '-')}`;
            const replyNodeName = `Reply to comment${index + 1}`;
            
            const replyNode = {
              id: replyNodeId,
              name: replyNodeName,
              type: "n8n-nodes-base.httpRequest",
              typeVersion: 4,
              position: [nodeXPosition, replyYPosition],
              parameters: {
                method: "POST",
                url: `=https://graph.facebook.com/v24.0/{{ $json.body.entry[0].changes[0].value.id }}/replies`,
                authentication: "genericCredentialType",
                genericAuthType: "httpHeaderAuth",
                sendHeaders: true,
                headerParameters: {
                  parameters: [
                    {
                      name: "Content-Type",
                      value: "application/json"
                    },
                    {
                      name: "Authorization",
                      value: "Bearer {{access_token}}"
                    }
                  ]
                },
                sendBody: true,
                specifyBody: "json",
                jsonBody: `={\n  "message": "@{{ $json.body.entry[0].changes[0].value.from.username }} ${replyText.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"\n}\n`,
                options: {}
              },
              credentials: {
                httpHeaderAuth: {
                  id: instagramAccount.instagram_user_id,
                  name: "Instagram Access Token"
                }
              }
            };
            nodes.push(replyNode);
            
            // Add connection from switch to this reply node
            const switchOutputIndex = switchRules.findIndex((r: any) => r.outputKey === keyword.toLowerCase());
            if (switchOutputIndex >= 0) {
              switchConnections.push({
                node: replyNodeName,
                type: "main",
                index: switchOutputIndex
              });
            }
            
            // Track the last node for this keyword to chain actions
            actionChains[keywordKey] = replyNodeName;
            keywordYPositions[keywordKey] = replyYPosition;
            replyYPosition += 192;
          });
        } else if (commentsType === 'all') {
          // Create single reply node for "all comments"
          const replyNodeName = "Reply to comment1";
          const replyNode = {
            id: "reply-comment-all",
            name: replyNodeName,
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [nodeXPosition, replyYPosition],
            parameters: {
              method: "POST",
              url: `=https://graph.facebook.com/v24.0/{{ $json.body.entry[0].changes[0].value.id }}/replies`,
              authentication: "genericCredentialType",
              genericAuthType: "httpHeaderAuth",
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: "Content-Type",
                    value: "application/json"
                  },
                  {
                    name: "Authorization",
                    value: "Bearer {{access_token}}"
                  }
                ]
              },
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  "message": "@{{ $json.body.entry[0].changes[0].value.from.username }} ${replyText.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"\n}\n`,
              options: {}
            },
            credentials: {
              httpHeaderAuth: {
                id: instagramAccount.instagram_user_id,
                name: "Instagram Access Token"
              }
            }
          };
          nodes.push(replyNode);
          
          // Add connection from switch to reply node
          const switchOutputIndex = switchRules.findIndex((r: any) => r.outputKey === 'all_comments');
          if (switchOutputIndex >= 0) {
            switchConnections.push({
              node: replyNodeName,
              type: "main",
              index: switchOutputIndex
            });
          }
          
          actionChains['all_comments'] = replyNodeName;
          keywordYPositions['all_comments'] = replyYPosition;
        }
      }
      
      // 6. Chain additional actions (ask_to_follow, send_dm) after reply
      const actionConnections: any = {};
      
      // Helper to add action node
      const addActionNode = (actionType: 'ask_to_follow' | 'send_dm', actionData: any, previousNodeName: string, keywordKey: string) => {
        let actionNode: any;
        let actionNodeName: string = '';
        const currentYPosition = keywordYPositions[keywordKey] || replyYPosition;
        
        if (actionType === 'ask_to_follow') {
          actionNodeName = `please follow${keywords.length > 1 ? keywordKey.replace(/\s+/g, '') : '1'}`;
          const buttons = [{
            type: "postback",
            title: actionData.followButtonText || "I'm Following ✅",
            payload: "Following"
          }];
          
          actionNode = {
            id: `ask-follow-${keywordKey.replace(/\s+/g, '-')}`,
            name: actionNodeName,
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4.3,
            position: [nodeXPosition + 224, currentYPosition],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].id }}/messages`,
              authentication: "genericCredentialType",
              genericAuthType: "httpHeaderAuth",
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: "Content-Type",
                    value: "application/json"
                  },
                  {
                    name: "Authorization",
                    value: "Bearer {{access_token}}"
                  }
                ]
              },
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  "recipient": {\n    "id": "{{ $json.body.entry[0].changes[0].value.from.id }}"\n  },\n  "message": {\n    "attachment": {\n      "type": "template",\n      "payload": {\n        "template_type": "generic",\n        "elements": [\n          {\n            "title": "${(actionData.messageTemplate || `Cool 😎\\nBefore I share you the link, please hit that follow button`).replace(/\n/g, '\\n').replace(/"/g, '\\"')}",\n            "buttons": ${JSON.stringify(buttons)}\n          }\n        ]\n      }\n    }\n  }\n}\n`,
              options: {}
            },
            credentials: {
              httpHeaderAuth: {
                id: instagramAccount.instagram_user_id,
                name: "Instagram Access Token"
              }
            }
          };
        } else if (actionType === 'send_dm') {
          actionNodeName = `send-dm-${keywordKey.replace(/\s+/g, '-')}`;
          const buttons: any[] = [];
          sendDmAction.actionButtons?.forEach((button: any) => {
            const buttonAction = button.action || (button.url ? 'url' : 'postback');
            
            if (buttonAction === 'url' || buttonAction === 'calendar') {
              buttons.push({
                type: "web_url",
                url: buttonAction === 'calendar' || button.url === 'calendar' ? calendarUrl : button.url,
                title: button.text
              });
            } else if (buttonAction === 'postback' || !button.url) {
              const payload = button.text.toUpperCase().replace(/\s+/g, '_');
              buttons.push({
                type: "postback",
                title: button.text,
                payload: payload
              });
            }
          });
          
          actionNode = {
            id: `send-dm-${keywordKey.replace(/\s+/g, '-')}`,
            name: actionNodeName,
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4.3,
            position: [nodeXPosition + 224, currentYPosition],
            parameters: {
              method: "POST",
              url: `=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].id }}/messages`,
              authentication: "genericCredentialType",
              genericAuthType: "httpHeaderAuth",
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: "Content-Type",
                    value: "application/json"
                  },
                  {
                    name: "Authorization",
                    value: "Bearer {{access_token}}"
                  }
                ]
              },
              sendBody: true,
              specifyBody: "json",
              jsonBody: `={\n  "recipient": {\n    "id": "{{ $json.body.entry[0].changes[0].value.from.id }}"\n  },\n  "message": {\n    "attachment": {\n      "type": "template",\n      "payload": {\n        "template_type": "generic",\n        "elements": [\n          {\n            "title": "Hi👋",\n            "image_url": "https://i.ibb.co/N29QzF6Z/QR-Logo.png",\n            "subtitle": "${(sendDmAction.messageTemplate || `Thank you for reaching out to ${brandName}!\\nWe've received your enquiry and one of our team members will get back to you soon.\\n\\nIn the meantime, would you like to explore our automation solutions?\\n\\nThank you for choosing ${brandName}!`).replace(/\n/g, '\\n').replace(/"/g, '\\"')}",\n            "buttons": ${JSON.stringify(buttons)}\n          }\n        ]\n      }\n    }\n  }\n}\n`,
              options: {}
            },
            credentials: {
              httpHeaderAuth: {
                id: instagramAccount.instagram_user_id,
                name: "Instagram Access Token"
              }
            }
          };
        }
        
        if (actionNode && actionNodeName) {
          nodes.push(actionNode);
          
          // Chain from previous node
          if (!actionConnections[previousNodeName]) {
            actionConnections[previousNodeName] = [];
          }
          actionConnections[previousNodeName].push({
            node: actionNodeName,
            type: "main",
            index: 0
          });
          
          // Update Y position for next action in this keyword branch
          keywordYPositions[keywordKey] = currentYPosition + 192;
          return actionNodeName;
        }
        return previousNodeName;
      };
      
      // Add ask_to_follow and send_dm actions after reply nodes
      if (commentsType === 'keywords' && keywords.length > 0) {
        keywords.forEach((keyword: string) => {
          const keywordKey = keyword.toLowerCase();
          let lastNode = actionChains[keywordKey];
          
          if (askToFollowAction && lastNode) {
            lastNode = addActionNode('ask_to_follow', askToFollowAction, lastNode, keywordKey);
          }
          
          if (sendDmAction && lastNode) {
            lastNode = addActionNode('send_dm', sendDmAction, lastNode, keywordKey);
          }
        });
      } else if (commentsType === 'all') {
        let lastNode = actionChains['all_comments'];
        const keywordKey = 'all_comments';
        
        if (askToFollowAction && lastNode) {
          lastNode = addActionNode('ask_to_follow', askToFollowAction, lastNode, keywordKey);
        }
        
        if (sendDmAction && lastNode) {
          lastNode = addActionNode('send_dm', sendDmAction, lastNode, keywordKey);
        }
      }
      
      // Set up connections
      connections["Webhook"] = {
        main: [
          [
            {
              node: "If",
              type: "main",
              index: 0
            }
          ],
          [
            {
              node: "Switch3",
              type: "main",
              index: 0
            }
          ]
        ]
      };
      
      connections["If"] = {
        main: [
          [
            {
              node: "Respond to Webhook",
              type: "main",
              index: 0
            }
          ]
        ]
      };
      
      if (switchConnections.length > 0) {
        connections["Switch3"] = {
          main: [switchConnections]
        };
      }
      
      // Add action chain connections
      Object.keys(actionConnections).forEach((nodeName) => {
        connections[nodeName] = {
          main: [actionConnections[nodeName]]
        };
      });
      
      return {
        name: finalWorkflowName,
        nodes: nodes,
        connections: connections,
        settings: {
          saveExecutionProgress: true,
          saveManualExecutions: true,
          saveDataErrorExecution: "all",
          saveDataSuccessExecution: "all",
          executionTimeout: 3600,
          timezone: "Asia/Kolkata"
        }
      };
    };

    // Build workflow based on template and automation type
    let workflowTemplate: any;
    
    // If automation data exists, build appropriate workflow
    if (automationData && automationData.trigger_type === 'user_directed_messages') {
      console.log("Building DM workflow for user_directed_messages");
      workflowTemplate = buildDMWorkflow();
    } else if (automationData && automationData.trigger_type === 'post_comment') {
      console.log("Building Post Comment workflow");
      workflowTemplate = buildPostCommentWorkflow();
    } else {
      // Default workflow template (existing code)
      console.log("Building default workflow template");
      workflowTemplate = {
        name: finalWorkflowName,
      nodes: [
        {
          id: "webhook-node",
          name: "Instagram Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2.1,
          position: [100, 300],
          parameters: {
            httpMethod: "POST",
            path: webhookPath,
            responseMode: "responseNode",
            options: {}
          }
        },
        {
          id: "extract-message-data",
          name: "Extract Message Data",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [320, 300],
          parameters: {
            values: {
              string: [
                {
                  name: "instagramMessage",
                  value: "={{ ($requestBody || $input.first().json).message || $json.text || $json.message || '' }}"
                },
                {
                  name: "instagramUserId",
                  value: "={{ ($requestBody || $input.first().json).sender_id || $json.sender_id || $json.from.id || '' }}"
                },
                {
                  name: "instagramUserName",
                  value: "={{ ($requestBody || $input.first().json).sender_name || $json.sender_name || $json.from.username || '' }}"
                }
              ]
            },
            options: {}
          }
        },
        {
          id: "send-instagram-reply",
          name: "Send Instagram DM Reply",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [540, 300],
          parameters: {
            method: "POST",
            url: "https://graph.instagram.com/v20.0/me/messages",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Authorization",
                  value: `Bearer ${instagramAccount.access_token}`
                },
                {
                  name: "Content-Type",
                  value: "application/json"
                }
              ]
            },
            sendBody: true,
            bodyParameters: {
              parameters: [
                {
                  name: "recipient",
                  value: "={{ {\"id\": $json.instagramUserId} }}"
                },
                {
                  name: "message",
                  value: "={{ {\"text\": \"Hello! Thanks for your message.\"} }}"
                }
              ]
            },
            options: {}
          }
        }
      ],
      connections: {
        "Instagram Webhook": {
          main: [
            [
              {
                node: "Extract Message Data",
                type: "main",
                index: 0
              }
            ]
          ]
        },
        "Extract Message Data": {
          main: [
            [
              {
                node: "Send Instagram DM Reply",
                type: "main",
                index: 0
              }
            ]
          ]
        }
      },
      settings: {
        saveExecutionProgress: true,
        saveManualExecutions: true,
        saveDataErrorExecution: "all",
        saveDataSuccessExecution: "all",
        executionTimeout: 3600,
        timezone: "Asia/Kolkata"
      }
    };
    }

    // Replace any placeholders in the workflow
    const finalWorkflow = replacePlaceholders(workflowTemplate);

    // Call n8n API
    console.log("Calling N8N API...");
    const n8nResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey
      },
      body: JSON.stringify(finalWorkflow)
    });

    // Log the response for debugging
    const responseText = await n8nResponse.text();
    console.log("N8N Response Status:", n8nResponse.status);
    console.log("N8N Response:", responseText);

    if (!n8nResponse.ok) {
      console.error("N8N API error details:", {
        status: n8nResponse.status,
        statusText: n8nResponse.statusText,
        body: responseText
      });
      
      return new Response(JSON.stringify({ 
        error: `Failed to create workflow in n8n: ${n8nResponse.status} ${n8nResponse.statusText}`,
        details: responseText
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let n8nResult;
    try {
      n8nResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse N8N response:", parseError);
      n8nResult = { id: "unknown", name: workflowName };
    }

    console.log("Workflow created successfully:", n8nResult.id);

    // Workflows are created inactive by default in n8n
    // If autoActivate is true, activate the workflow
    if (autoActivate) {
      console.log("Activating workflow...");
      const activateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey
        }
      });

      if (activateResponse.ok) {
        console.log("Workflow activated successfully");
      } else {
        console.warn("Failed to activate workflow:", await activateResponse.text());
        // Don't fail the whole operation if activation fails
      }
    } else {
      console.log("Workflow created but not activated (inactive by default)");
    }
    if (autoActivate && n8nResult?.id) {
      console.log("Activating workflow in n8n...");
      const activateResponse = await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nResult.id}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey
        }
      });

      if (!activateResponse.ok) {
        const activateText = await activateResponse.text();
        console.error("Failed to activate workflow in n8n:", activateResponse.status, activateText);
      } else {
        console.log("Workflow activated in n8n");
      }
    }

    // Store the workflow mapping in Supabase
    try {
      await supabase
        .from("n8n_workflows")
        .insert({
          user_id: userId,
          n8n_workflow_id: n8nResult.id,
          n8n_workflow_name: n8nResult.name,
          webhook_path: webhookPath,
          instagram_account_id: instagramAccount.id,
          template: template || 'instagram_automation_v1',
          variables: variables || {},
          ...(automationId && { automation_id: automationId }),
          created_at: new Date().toISOString()
        });
      
      console.log("Workflow mapping stored in Supabase");
    } catch (dbError) {
      console.error("Failed to store workflow mapping:", dbError);
      // Continue even if database storage fails
    }

    return new Response(JSON.stringify({
      success: true,
      workflowId: n8nResult.id,
      workflowName: n8nResult.name,
      webhookPath: webhookPath,
      webhookUrl: `${n8nBaseUrl}/webhook/${webhookPath}`,
      instagramAccount: {
        id: instagramAccount.id,
        username: instagramAccount.username
      },
      message: `Workflow created successfully with Instagram account @${instagramAccount.username}`
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in create-workflow function:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});