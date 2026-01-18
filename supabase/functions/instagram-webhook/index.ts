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
                postId: value.media?.id,
                from: value.from,
                timestamp: value.timestamp,
              };
            } else if (field === 'messages') {
              triggerType = 'user_directed_messages';
              eventData = {
                messageId: value.id,
                messageText: value.text,
                from: value.from,
                timestamp: value.timestamp,
              };
              
              // Store incoming message in webhook_messages table
              if (value.from && value.text) {
                try {
                  await supabase
                    .from('webhook_messages')
                    .insert({
                      user_id: instagramAccount.user_id,
                      instagram_account_id: instagramAccount.id,
                      sender_id: value.from.id || '',
                      sender_username: value.from.username || 'unknown',
                      message_text: value.text,
                      message_type: 'text',
                      webhook_data: value,
                    });
                } catch (dbError) {
                  console.error('Error storing webhook message:', dbError);
                  // Continue even if storage fails
                }
              }
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