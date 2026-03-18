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
    name?: string;
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
  console.log("═══════════════════════════════════════");
  console.log("🎯 EXECUTE-AUTOMATION CALLED");
  console.log("Time:", new Date().toISOString());
  console.log("═══════════════════════════════════════");

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

    const requestBody = await req.json();
    console.log("📦 Full request body:");
    console.log(JSON.stringify(requestBody, null, 2));

    const { userId, instagramAccountId, triggerType, eventData }: ExecuteRequest = requestBody;

    console.log("📋 Parsed values:");
    console.log("  userId:", userId);
    console.log("  instagramAccountId:", instagramAccountId);
    console.log("  triggerType:", triggerType);
    console.log("  eventData.from.id:", eventData.from.id);

    // 1. Fetch Instagram Account
    console.log("\n🔍 STEP 1: Fetching Instagram account...");
    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('access_token, instagram_user_id')
      .eq('id', instagramAccountId)
      .single();

    if (accountError || !instagramAccount) {
      console.error('❌ Instagram account error:', accountError);
      throw new Error('Instagram account not found');
    }

    // Resolve Profile & Follow Status
    console.log('\n🔍 STEP 2: Fetching user profile...');
    try {
      const apiVersion = 'v21.0';
      const userProfileUrl = `https://graph.facebook.com/${apiVersion}/${eventData.from.id}?fields=name,profile_pic,is_user_follow_business&access_token=${instagramAccount.access_token}`;
      const userProfileRes = await fetch(userProfileUrl);
      if (userProfileRes.ok) {
        const userProfile = await userProfileRes.json();
        if (userProfile.name) eventData.from.name = userProfile.name;
        if (!eventData.from.username || eventData.from.username === 'Unknown') {
          eventData.from.username = userProfile.name || eventData.from.id;
        }
        (eventData as any).isFollowing = userProfile.is_user_follow_business || false;
        (eventData as any).profilePic = userProfile.profile_pic || null;
      }
    } catch (err) {
      console.error('❌ Error fetching user profile:', err);
    }

    // 3. Upsert Contact
    console.log('\n🔍 STEP 3: Upserting contact...');
    let newInteractionCount = 1;
    try {
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('interaction_count, interacted_automations')
        .eq('user_id', userId)
        .eq('instagram_account_id', instagramAccountId)
        .eq('instagram_user_id', eventData.from.id)
        .maybeSingle();

      newInteractionCount = (existingContact?.interaction_count || 0) + 1;

      const contactData: any = {
        user_id: userId,
        instagram_account_id: instagramAccountId,
        instagram_user_id: eventData.from.id,
        username: eventData.from.username || eventData.from.id,
        full_name: eventData.from.name || null,
        avatar_url: (eventData as any).profilePic || null,
        last_interaction_at: new Date().toISOString(),
        interaction_count: newInteractionCount,
        follows_us: (eventData as any).isFollowing || false,
      };

      await supabase.from('contacts').upsert(contactData, {
        onConflict: 'user_id,instagram_account_id,instagram_user_id',
        ignoreDuplicates: false
      });
    } catch (contactErr) {
      console.error('❌ Contact upsert error:', contactErr);
    }

    // 4. Fetch and Match Automations
    console.log('\n🔍 STEP 4: Matching automations...');
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_type', triggerType)
      .eq('status', 'active');

    const matchedAutomations = (automations || []).filter(automation => {
      const config = automation.trigger_config || {};
      if (triggerType === 'post_comment') {
        if (config.postsType === 'specific') {
          const allowedPosts = config.specificPosts || [];
          if (!eventData.postId || !allowedPosts.includes(eventData.postId)) return false;
        }
        if (config.commentsType === 'keywords' && config.keywords && eventData.commentText) {
          const text = eventData.commentText.toLowerCase();
          return config.keywords.some((keyword: string) => text.includes(keyword.toLowerCase()));
        }
        return config.commentsType === 'all';
      }
      if (triggerType === 'user_directed_messages') {
        if (config.messageType === 'all') return true;
        if (config.messageType === 'keywords' && config.keywords && eventData.messageText) {
          const text = eventData.messageText.toLowerCase();
          return config.keywords.some((k: string) => text.includes(k.toLowerCase()));
        }
      }
      if (triggerType === 'story_reply') return config.storiesType === 'all';
      return false;
    });

    console.log(`✅ Matches found: ${matchedAutomations.length}`);

    // 5. Log Inbound Event
    const primaryAutomationId = matchedAutomations.length > 0 ? matchedAutomations[0].id : null;
    try {
      const activityType = triggerType === 'post_comment' ? 'incoming_comment' :
        triggerType === 'user_directed_messages' ? 'incoming_message' : 'incoming_event';

      await supabase.from('automation_activities').insert({
        user_id: userId,
        automation_id: primaryAutomationId,
        instagram_account_id: instagramAccountId,
        activity_type: activityType,
        target_username: eventData.from.username || eventData.from.id,
        message: eventData.commentText || eventData.messageText || '',
        status: 'success',
        metadata: { ...eventData, direction: 'inbound', matchedCount: matchedAutomations.length }
      });
    } catch (err) {
      console.error('❌ Error logging event:', err);
    }

    // 6. Execute Actions
    for (const automation of matchedAutomations) {
      const automationName = automation.name || 'Unnamed Automation';

      // Update contact's interacted_automations
      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('interacted_automations')
          .eq('user_id', userId)
          .eq('instagram_account_id', instagramAccountId)
          .eq('instagram_user_id', eventData.from.id)
          .single();

        const current = contact?.interacted_automations || [];
        if (!current.includes(automationName)) {
          await supabase.from('contacts').update({
            interacted_automations: [...current, automationName]
          }).eq('user_id', userId).eq('instagram_account_id', instagramAccountId).eq('instagram_user_id', eventData.from.id);
        }
      } catch (err) { console.error('❌ Contact list update error:', err); }

      for (const action of automation.actions || []) {
        try {
          await executeAction({
            action, eventData, accessToken: instagramAccount.access_token,
            instagramUserId: instagramAccount.instagram_user_id, supabase,
            automationId: automation.id, userId, instagramAccountId, triggerType
          });
        } catch (err: any) {
          console.error('❌ Action failed:', err.message);
          await logActivity(supabase, {
            userId, automationId: automation.id, instagramAccountId,
            activityType: action.type, targetUsername: eventData.from.username,
            status: 'failed', metadata: { error: err.message }
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, executed: matchedAutomations.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("❌ FATAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function executeAction(params: any) {
  const { action, eventData, accessToken, instagramUserId, supabase, automationId, userId, instagramAccountId, triggerType } = params;
  let messageText = '';
  let buttons: any[] = [];

  if (action.type === 'reply_to_comment') {
    messageText = action.replyTemplates?.[Math.floor(Math.random() * action.replyTemplates.length)] || '';
    buttons = action.actionButtons || [];
  } else if (action.type === 'send_dm') {
    messageText = action.messageTemplate || '';
    buttons = action.actionButtons || [];
  }

  messageText = messageText.replace('{{username}}', eventData.from.username);
  const isPublicReply = action.type === 'reply_to_comment';
  const apiUrl = isPublicReply ? `https://graph.instagram.com/v21.0/${eventData.commentId}/replies` : `https://graph.instagram.com/v21.0/me/messages`;

  const recipient = (triggerType === 'post_comment' && eventData.commentId && !isPublicReply) ? { comment_id: eventData.commentId } : { id: eventData.from.id };
  let messagePayload: any = isPublicReply ? { message: messageText } : { recipient, message: {} };

  if (!isPublicReply && buttons.length > 0) {
    messagePayload.message = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: messageText.substring(0, 80),
            subtitle: "Powered By Quickrevert.tech",
            buttons: buttons.slice(0, 3).map((btn: any) => ({
              type: btn.url?.startsWith('http') ? 'web_url' : 'postback',
              url: btn.url, title: btn.text.substring(0, 20),
              payload: btn.url?.startsWith('http') ? undefined : btn.text.toUpperCase()
            }))
          }]
        }
      }
    };
  } else if (!isPublicReply) {
    messagePayload.message = { text: messageText };
  }

  const response = await fetch(`${apiUrl}?access_token=${accessToken}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messagePayload)
  });

  if (!response.ok) throw new Error(`Instagram API error: ${response.status} - ${await response.text()}`);
  const result = await response.json();

  await logActivity(supabase, {
    userId, automationId, instagramAccountId, activityType: action.type,
    targetUsername: eventData.from.username, message: messageText,
    status: 'success', metadata: { messageId: result.message_id, recipientId: result.recipient_id }
  });
}

async function logActivity(supabase: any, data: any) {
  await supabase.from('automation_activities').insert({
    user_id: data.userId, automation_id: data.automationId,
    instagram_account_id: data.instagramAccountId, activity_type: data.activityType,
    target_username: data.targetUsername, message: data.message,
    status: data.status, metadata: data.metadata || {}
  });
}