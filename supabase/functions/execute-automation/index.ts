import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EventData {
  commentId?: string;
  commentText?: string;
  messageId?: string;
  messageText?: string;
  postId?: string;
  storyId?: string;
  from: {
    id: string;
    username: string;
    name?: string; // Add name if available
  };
  timestamp: string;
}

interface ExecuteRequest {
  userId: string;
  instagramAccountId: string;
  triggerType: string;
  eventData: EventData;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, instagramAccountId, triggerType, eventData }: ExecuteRequest = await req.json();

    console.log('Processing automation request for:', { userId, triggerType, senderId: eventData.from.id });

    // 1. Fetch Instagram Account FIRST to get the access token
    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('access_token, page_id')
      .eq('id', instagramAccountId)
      .single();

    if (accountError || !instagramAccount) {
      console.error('Instagram account not found or error:', accountError);
      throw new Error('Instagram account not found');
    }

    // 2. Resolve Username if missing (Common in DMs)
    if (!eventData.from.username) {
      console.log('Username missing in payload. Fetching from Instagram API...');
      try {
        const userProfileUrl = `https://graph.instagram.com/v21.0/${eventData.from.id}?fields=username,name,profile_picture_url&access_token=${instagramAccount.access_token}`;
        const userProfileRes = await fetch(userProfileUrl);

        if (userProfileRes.ok) {
          const userProfile = await userProfileRes.json();
          eventData.from.username = userProfile.username;
          if (userProfile.name) eventData.from.name = userProfile.name;
          console.log('Resolved username:', eventData.from.username);
        } else {
          console.error('Failed to fetch user profile:', await userProfileRes.text());
          // Fallback if needed, or just leave it as undefined/unknown
          eventData.from.username = 'unknown_user';
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
        eventData.from.username = 'unknown_user';
      }
    }

    // 3. Upsert Contact
    try {
      // Check if contact exists to get current interaction count
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('interaction_count, first_interaction_at')
        .eq('user_id', userId)
        .eq('instagram_account_id', instagramAccountId)
        .eq('instagram_user_id', eventData.from.id)
        .maybeSingle();

      const newInteractionCount = (existingContact?.interaction_count || 0) + 1;

      const contactData = {
        user_id: userId,
        instagram_account_id: instagramAccountId,
        instagram_user_id: eventData.from.id,
        username: eventData.from.username,
        full_name: eventData.from.name || null,
        // We might not get avatar unless we specifically fetched it or it was in payload (rarely in webhook)
        // If we fetched it in step 2, we could add it here.
        last_interaction_at: new Date().toISOString(),
        interaction_count: newInteractionCount,
        // preserve first_interaction_at if exists, else it uses default NOW() from DB or we can set it
      };

      const { error: contactError } = await supabase
        .from('contacts')
        .upsert(contactData, {
          onConflict: 'user_id,instagram_account_id,instagram_user_id',
          ignoreDuplicates: false
        });

      if (contactError) {
        console.error('Error upserting contact:', contactError);
      } else {
        console.log('Contact upserted successfully');
      }

    } catch (contactErr) {
      console.error('Unexpected error handling contact:', contactErr);
    }

    // 4. Log the incoming event
    try {
      const activityType = triggerType === 'post_comment' ? 'incoming_comment' :
        triggerType === 'user_directed_messages' ? 'incoming_message' :
          'incoming_event';

      const messageContent = eventData.commentText || eventData.messageText || '';

      await supabase.from('automation_activities').insert({
        user_id: userId,
        instagram_account_id: instagramAccountId,
        activity_type: activityType,
        target_username: eventData.from.username || eventData.from.id,
        message: messageContent,
        status: 'success', // It's a received event
        metadata: {
          ...eventData,
          direction: 'inbound'
        }
      });
    } catch (logError) {
      console.error('Error logging incoming event:', logError);
    }

    // 5. Fetch and Execute Automations
    const { data: automations, error: automationError } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_type', triggerType)
      .eq('status', 'active');

    if (automationError) {
      throw automationError;
    }

    if (!automations || automations.length === 0) {
      console.log('No active automations found');
      return new Response(JSON.stringify({ success: true, message: 'No automations to execute' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Matching logic (copied from original)
    const matchedAutomations = automations.filter(automation => {
      const config = automation.trigger_config || {};

      if (triggerType === 'post_comment') {
        // 1. Post Filter
        if (config.postsType === 'specific') {
          const allowedPosts = config.specificPosts || [];
          if (!eventData.postId || !allowedPosts.includes(eventData.postId)) {
            return false;
          }
        }

        // 2. Comment Content Filter
        if (config.commentsType === 'keywords' && config.keywords && eventData.commentText) {
          const text = eventData.commentText.toLowerCase();
          return config.keywords.some((keyword: string) => text.includes(keyword.toLowerCase()));
        }
        return config.commentsType === 'all';
      }

      if (triggerType === 'user_directed_messages') {
        if (config.messageType === 'keywords' && config.keywords && eventData.messageText) {
          const text = eventData.messageText.toLowerCase();
          return config.keywords.some((keyword: string) => text.includes(keyword.toLowerCase()));
        }
        return config.messageType === 'all';
      }

      if (triggerType === 'story_reply') {
        return config.storiesType === 'all';
      }

      return false;
    });

    console.log(`Found ${matchedAutomations.length} matching automations`);

    for (const automation of matchedAutomations) {
      for (const action of automation.actions || []) {
        try {
          await executeAction({
            action,
            eventData,
            accessToken: instagramAccount.access_token,
            pageId: instagramAccount.page_id,
            supabase,
            automationId: automation.id,
            userId,
            instagramAccountId,
          });
        } catch (actionError) {
          console.error('Error executing action:', actionError);
          await logActivity(supabase, {
            userId,
            automationId: automation.id,
            instagramAccountId,
            activityType: action.type,
            targetUsername: eventData.from.username,
            status: 'failed',
            metadata: { error: actionError.message },
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, executed: matchedAutomations.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in execute-automation:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function executeAction(params: any) {
  const { action, eventData, accessToken, pageId, supabase, automationId, userId, instagramAccountId } = params;

  let messageText = '';
  let buttons: any[] = [];

  switch (action.type) {
    case 'reply_to_comment':
      if (action.replyTemplates && action.replyTemplates.length > 0) {
        messageText = action.replyTemplates[Math.floor(Math.random() * action.replyTemplates.length)];
        buttons = action.actionButtons || [];
      }
      break;

    case 'send_dm':
      messageText = action.messageTemplate || '';
      buttons = action.actionButtons || [];
      break;

  }

  messageText = messageText.replace('{{username}}', eventData.from.username);

  const apiUrl = `https://graph.instagram.com/v21.0/${pageId || eventData.from.id}/messages`;

  let messagePayload: any = {
    recipient: { id: eventData.from.id },
    messaging_type: 'RESPONSE',
  };

  if (buttons.length > 0) {
    messagePayload.message = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: messageText,
          buttons: buttons.slice(0, 3).map((btn: any) => {
            if (btn.url) {
              return { type: 'web_url', url: btn.url, title: btn.text };
            }
            return { type: 'postback', title: btn.text, payload: btn.text.toUpperCase() };
          }),
        },
      },
    };
  } else {
    messagePayload.message = { text: messageText };
  }

  console.log('Sending message:', JSON.stringify(messagePayload));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messagePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Instagram API error:', errorText);
    throw new Error(`Instagram API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Message sent successfully:', result);

  await logActivity(supabase, {
    userId,
    automationId,
    instagramAccountId,
    activityType: action.type,
    targetUsername: eventData.from.username,
    message: messageText,
    status: 'success',
    metadata: {
      messageId: result.message_id,
      recipientId: result.recipient_id,
    },
  });
}

async function logActivity(supabase: any, data: any) {
  const { error } = await supabase
    .from('automation_activities')
    .insert({
      user_id: data.userId,
      automation_id: data.automationId,
      instagram_account_id: data.instagramAccountId,
      activity_type: data.activityType,
      target_username: data.targetUsername,
      message: data.message,
      status: data.status,
      metadata: data.metadata || {},
    });

  if (error) {
    console.error('Error logging activity:', error);
  }
}