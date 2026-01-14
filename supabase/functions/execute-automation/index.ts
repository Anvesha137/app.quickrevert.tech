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

    console.log('Executing automation for:', { userId, triggerType, from: eventData.from.username });

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

    const { data: instagramAccount } = await supabase
      .from('instagram_accounts')
      .select('access_token, page_id')
      .eq('id', instagramAccountId)
      .single();

    if (!instagramAccount) {
      throw new Error('Instagram account not found');
    }

    const matchedAutomations = automations.filter(automation => {
      const config = automation.trigger_config || {};
      
      if (triggerType === 'post_comment') {
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