import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const VERIFY_TOKEN = Deno.env.get('INSTAGRAM_VERIFY_TOKEN') || 'instagram_webhook_verify_token_12345';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified');
        return new Response(challenge, {
          status: 200,
          headers: corsHeaders,
        });
      } else {
        return new Response('Forbidden', {
          status: 403,
          headers: corsHeaders,
        });
      }
    }

    if (req.method === 'POST') {
      const payload = await req.json();
      console.log('Webhook received:', JSON.stringify(payload, null, 2));

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // DEBUG: Log raw payload to failed_events
      try {
        await supabase.from('failed_events').insert({
          event_id: 'debug-' + Date.now(),
          payload: payload,
          error_message: 'DEBUG: Webhook Received - ' + (payload.entry?.[0]?.id || 'unknown_id'),
        });
      } catch (e) {
        console.error('Debug log failed', e);
      }

      if (payload.object === 'instagram') {
        for (const entry of payload.entry) {
          const instagramUserId = entry.id;

          const { data: instagramAccount, error: accountError } = await supabase
            .from('instagram_accounts')
            .select('id, user_id')
            .eq('instagram_user_id', instagramUserId)
            .eq('status', 'active')
            .maybeSingle();

          if (accountError || !instagramAccount) {
            console.error('Instagram account not found:', instagramUserId);
            // DEBUG: Log specific failure
            try {
              await supabase.from('failed_events').insert({
                event_id: 'error-' + instagramUserId,
                payload: payload,
                error_message: `Instagram account not found for ID: ${instagramUserId}. Error: ${accountError?.message}`,
              });
            } catch (e) { }
            continue;
          }

          for (const change of entry.changes || []) {
            const field = change.field;
            const value = change.value;

            let triggerType = '';
            let eventData: any = {};

            if (field === 'comments') {
              triggerType = 'post_comment';
              eventData = {
                commentId: value.id,
                commentText: value.text,
                postId: value.media?.id || (payload as any).payload?.value?.media?.id,
                from: value.from,
                timestamp: value.timestamp,
              };
            } else if (field === 'messages') {
              // This might appear in 'changes' in some API versions, but usually it's in 'messaging' array
              triggerType = 'user_directed_messages';
              eventData = {
                messageId: value.id,
                messageText: value.text,
                from: value.from,
                timestamp: value.timestamp,
              };
            } else if (field === 'story_insights' || field === 'story_mentions') {
              triggerType = 'story_reply';
              eventData = {
                storyId: value.media_id,
                from: value.from,
                timestamp: value.timestamp,
              };
            }

            if (triggerType) {
              const supabaseExecutorUrl = `${supabaseUrl}/functions/v1/execute-automation`;

              await fetch(supabaseExecutorUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  userId: instagramAccount.user_id,
                  instagramAccountId: instagramAccount.id,
                  triggerType,
                  eventData,
                }),
              });
            } else if (field === 'messaging_postbacks') {
              // Handle postbacks sent via 'changes' array (e.g. from developer console test valid payload)
              const postbackPayload = value.postback?.payload;
              const postbackTitle = value.postback?.title;
              const senderId = value.sender?.id;
              const timestamp = value.timestamp;

              if (postbackPayload) {
                console.log(`📍 Postback (changes) received: payload="${postbackPayload}", title="${postbackTitle}"`);

                // Trigger n8n workflow directly with postback event
                const { data: n8nWorkflows, error: n8nError } = await supabase
                  .from('n8n_workflows')
                  .select('*')
                  .eq('user_id', instagramAccount.user_id)
                  .eq('is_active', true);

                if (!n8nError && n8nWorkflows && n8nWorkflows.length > 0) {
                  const n8nBaseUrl = Deno.env.get('N8N_BASE_URL') || 'https://n8n.quickrevert.tech';

                  for (const workflow of n8nWorkflows) {
                    let targetUrl = workflow.webhook_url;
                    if (!targetUrl && workflow.webhook_path) {
                      targetUrl = `${n8nBaseUrl}/webhook/${workflow.webhook_path}`;
                    }

                    if (!targetUrl) continue;

                    console.log(`  Triggering n8n workflow: ${workflow.name} → ${targetUrl}`);

                    // Use same payload structure as standard messaging event for consistency
                    const n8nPayload = {
                      body: {
                        platform: "instagram",
                        account_id: instagramAccount.id,
                        event_type: "messaging",
                        sub_type: "postback",
                        entry: [{
                          id: instagramAccount.instagram_user_id,
                          messaging: [{
                            sender: { id: senderId },
                            recipient: { id: instagramAccount.instagram_user_id },
                            timestamp: timestamp,
                            postback: {
                              payload: postbackPayload,
                              title: postbackTitle
                            }
                          }]
                        }]
                      }
                    };

                    console.log('📤 Sending to n8n (from changes):', JSON.stringify(n8nPayload, null, 2));

                    try {
                      const n8nResponse = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(n8nPayload)
                      });

                      const responseText = await n8nResponse.text();
                      console.log(`  N8N response: ${n8nResponse.status} - ${responseText}`);

                      await supabase.from('automation_activities').insert({
                        user_id: instagramAccount.user_id,
                        instagram_account_id: instagramAccount.id,
                        activity_type: 'postback_trigger',
                        target_username: senderId,
                        message: `Postback: ${postbackPayload}`,
                        status: n8nResponse.ok ? 'success' : 'failed',
                        metadata: {
                          workflow_id: workflow.id,
                          postback_payload: postbackPayload,
                          postback_title: postbackTitle,
                          response_status: n8nResponse.status,
                          n8n_response: responseText,
                          source: 'changes_array'
                        }
                      });
                    } catch (n8nErr: any) {
                      console.error(`  ❌ N8N trigger failed:`, n8nErr);
                    }
                  }
                }
              }
            }
          }

          // NEW: Handle 'messaging' array for DMs (standard Webhook structure for messages)
          if (entry.messaging) {
            for (const messageEvent of entry.messaging) {
              const senderId = messageEvent.sender?.id;
              const timestamp = messageEvent.timestamp;

              // Handle regular text messages
              if (messageEvent.message?.text) {
                const messageText = messageEvent.message.text;
                const messageId = messageEvent.message.mid;

                const triggerType = 'user_directed_messages';
                const eventData = {
                  messageId,
                  messageText,
                  from: {
                    id: senderId,
                    // proper username will be resolved in execute-automation
                  },
                  timestamp,
                };

                const supabaseExecutorUrl = `${supabaseUrl}/functions/v1/execute-automation`;
                console.log(`Calling execute-automation: ${supabaseExecutorUrl}`, { triggerType, eventData });

                try {
                  const execResponse = await fetch(supabaseExecutorUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                      userId: instagramAccount.user_id,
                      instagramAccountId: instagramAccount.id,
                      triggerType,
                      eventData,
                    }),
                  });

                  if (!execResponse.ok) {
                    const err = await execResponse.text();
                    console.error(`Execute-automation failed (${execResponse.status}):`, err);
                    await supabase.from('failed_events').insert({
                      event_id: 'exec-fail-' + Date.now(),
                      payload: { status: execResponse.status, error: err, body: eventData },
                      error_message: `Execute Automation Failed: ${execResponse.status}`
                    });
                  } else {
                    console.log('Execute-automation called successfully');
                  }
                } catch (fetchErr) {
                  console.error('Failed to call execute-automation:', fetchErr);
                  await supabase.from('failed_events').insert({
                    event_id: 'fetch-fail-' + Date.now(),
                    payload: { error: fetchErr.message },
                    error_message: `Fetch Failed: ${fetchErr.message}`
                  });
                }
              }

              // Handle quick_reply (treat as postback for workflow compatibility)
              if (messageEvent.message?.quick_reply) {
                const postbackPayload = messageEvent.message.quick_reply.payload;
                const postbackTitle = messageEvent.message.text;

                console.log(`📍 Quick Reply received: payload="${postbackPayload}", title="${postbackTitle}"`);

                const { data: n8nWorkflows, error: n8nError } = await supabase
                  .from('n8n_workflows')
                  .select('*')
                  .eq('user_id', instagramAccount.user_id)
                  .eq('is_active', true);

                if (!n8nError && n8nWorkflows && n8nWorkflows.length > 0) {
                  const n8nBaseUrl = Deno.env.get('N8N_BASE_URL') || 'https://n8n.quickrevert.tech';

                  for (const workflow of n8nWorkflows) {
                    let targetUrl = workflow.webhook_url;
                    if (!targetUrl && workflow.webhook_path) {
                      targetUrl = `${n8nBaseUrl}/webhook/${workflow.webhook_path}`;
                    }

                    if (!targetUrl) continue;

                    console.log(`  Triggering n8n workflow (via quick_reply): ${workflow.name} → ${targetUrl}`);

                    const n8nPayload = {
                      body: {
                        platform: "instagram",
                        account_id: instagramAccount.id,
                        event_type: "messaging",
                        sub_type: "message", // Preserve message type for QR
                        entry: [{
                          id: instagramUserId,
                          messaging: [{
                            sender: messageEvent.sender,
                            recipient: messageEvent.recipient,
                            timestamp: messageEvent.timestamp,
                            message: messageEvent.message // Include original message object
                          }]
                        }]
                      }
                    };

                    try {
                      const n8nResponse = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(n8nPayload)
                      });

                      const responseText = await n8nResponse.text();
                      console.log(`  N8N response: ${n8nResponse.status} - ${responseText}`);
                    } catch (n8nErr: any) {
                      console.error(`  ❌ N8N trigger failed for quick_reply:`, n8nErr);
                    }
                  }
                }
              }

              // Handle postback events (button clicks)
              if (messageEvent.postback) {
                const postbackPayload = messageEvent.postback.payload;
                const postbackTitle = messageEvent.postback.title;

                // DEBUG: Log the raw message event
                console.log('🔍 RAW MESSAGE EVENT:', JSON.stringify(messageEvent, null, 2));
                console.log(`📍 Postback received: payload="${postbackPayload}", title="${postbackTitle}"`);

                // Trigger n8n workflow directly with postback event
                const { data: n8nWorkflows, error: n8nError } = await supabase
                  .from('n8n_workflows')
                  .select('*')
                  .eq('user_id', instagramAccount.user_id)
                  .eq('is_active', true);

                if (!n8nError && n8nWorkflows && n8nWorkflows.length > 0) {
                  const n8nBaseUrl = Deno.env.get('N8N_BASE_URL') || 'https://n8n.quickrevert.tech';

                  for (const workflow of n8nWorkflows) {
                    let targetUrl = workflow.webhook_url;
                    if (!targetUrl && workflow.webhook_path) {
                      targetUrl = `${n8nBaseUrl}/webhook/${workflow.webhook_path}`;
                    }

                    if (!targetUrl) continue;

                    console.log(`  Triggering n8n workflow: ${workflow.name} → ${targetUrl}`);

                    // CORRECTED PAYLOAD STRUCTURE - Match quick_reply structure for n8n rules
                    const n8nPayload = {
                      body: {
                        platform: "instagram",
                        account_id: instagramAccount.id,
                        event_type: "messaging",
                        sub_type: "postback",
                        entry: [{
                          id: instagramUserId,
                          messaging: [{
                            sender: messageEvent.sender,
                            recipient: messageEvent.recipient,
                            timestamp: messageEvent.timestamp,
                            postback: {
                              payload: postbackPayload,
                              title: postbackTitle
                            }
                          }]
                        }]
                      }
                    };

                    console.log('📤 Sending to n8n:', JSON.stringify(n8nPayload, null, 2));

                    try {
                      const n8nResponse = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(n8nPayload)
                      });

                      const responseText = await n8nResponse.text();
                      console.log(`  N8N response: ${n8nResponse.status} - ${responseText}`);

                      await supabase.from('automation_activities').insert({
                        user_id: instagramAccount.user_id,
                        instagram_account_id: instagramAccount.id,
                        activity_type: 'postback_trigger',
                        target_username: senderId,
                        message: `Postback: ${postbackPayload}`,
                        status: n8nResponse.ok ? 'success' : 'failed',
                        metadata: {
                          workflow_id: workflow.id,
                          postback_payload: postbackPayload,
                          postback_title: postbackTitle,
                          response_status: n8nResponse.status,
                          n8n_response: responseText
                        }
                      });
                    } catch (n8nErr: any) {
                      console.error(`  ❌ N8N trigger failed:`, n8nErr);
                      await supabase.from('failed_events').insert({
                        event_id: 'n8n-fail-' + Date.now(),
                        payload: { error: n8nErr.message, workflow: workflow.name },
                        error_message: `N8N trigger failed: ${n8nErr.message}`
                      });
                    }
                  }
                } else {
                  console.log('  No active n8n workflows found for postback');
                }
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});