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
            }
          }

          // NEW: Handle 'messaging' array for DMs (standard Webhook structure for messages)
          if (entry.messaging) {
            for (const messageEvent of entry.messaging) {
              const senderId = messageEvent.sender?.id;
              const messageText = messageEvent.message?.text;
              const messageId = messageEvent.message?.mid;
              const timestamp = messageEvent.timestamp;

              if (senderId && messageText) {
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
                    // Log specific failure
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