import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EventData {
  commentId?: string;
  commentText?: string;
  messageId?: string;
  messageText?: string;
  postbackPayload?: string; 
  postId?: string;
  storyId?: string;
  isFollowing?: boolean;
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 🔒 AUTH: Only accept internal calls from webhook-meta (service role key + internal header)
    const authHeader = req.headers.get('Authorization') || '';
    const isInternal = req.headers.get('x-quickrevert-internal') === 'true'
      && authHeader === `Bearer ${supabaseServiceKey}`;
    if (!isInternal) {
      console.warn('[execute-automation] Rejected unauthorized call');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { userId, instagramAccountId, triggerType, eventData }: ExecuteRequest = requestBody;

    // 1. Fetch Instagram Account
    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('access_token, instagram_user_id, username')
      .eq('id', instagramAccountId)
      .single();

    if (accountError || !instagramAccount) throw new Error('Instagram account not found');

    // 2. Fetch User Profile & Follow Status (Critical for "Follow to Unlock")
    try {
      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${eventData.from.id}?fields=name,username,is_user_follow_business&access_token=${instagramAccount.access_token}`);
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        eventData.from.name = fbData.name || eventData.from.name;
        eventData.isFollowing = fbData.is_user_follow_business || false;
      }
    } catch (e) { console.warn("Profile fetch failed", e.message); }

    // 3. Resolve Contact & State
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('instagram_account_id', instagramAccountId)
      .eq('instagram_user_id', eventData.from.id)
      .maybeSingle();

    const metadata = contact?.metadata || {};
    const conversationState = metadata.conversation_state || { state: 'new' };
    const contactId = contact?.id;

    // 🎯 4. STATE-MACHINE (Lead Manager)
    if (conversationState.state && !['new', 'done', 'error'].includes(conversationState.state)) {
      const stateResult = await handleConversationState({
        state: conversationState,
        eventData,
        supabase,
        userId,
        instagramAccount,
        contactId,
        metadata
      });

      if (stateResult.processed) {
        return new Response(JSON.stringify({ success: true, mode: 'state_machine' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 🔍 5. TRIGGER MATCHING
    // 🚀 OPTIMIZED: Only fetch needed columns (trigger_config + actions can be large JSONB)
    const { data: automations } = await supabase
      .from('automations')
      .select('id, name, trigger_type, trigger_config, actions')
      .eq('user_id', userId)
      .eq('status', 'active');

    const matchedAutomations = (automations || []).filter(automation => {
      const config = automation.trigger_config || {};
      const actualTriggerType = automation.trigger_type;
      const payload = eventData.postbackPayload;

      // Postback Matching
      if (payload) {
        const cid = automation.id.replace(/-/g, '');
        if (payload === `START_FLOW_${cid}` || payload === `CHECK_FOLLOW_${cid}`) return true;
        if (config.keywords?.some((k: string) => payload.toLowerCase() === k.toLowerCase())) return true;
        return false;
      }

      // Type Check
      if (triggerType !== actualTriggerType && !(triggerType === 'user_directed_messages' && actualTriggerType === 'user_dm')) return false;

      // Keyword/Specific Post Matching
      if (triggerType === 'post_comment') {
        if (config.postsType === 'specific' && !config.specificPosts?.includes(eventData.postId)) return false;
        if (config.commentsType === 'keywords') {
            const text = (eventData.commentText || '').toLowerCase();
            return config.keywords?.some((k: string) => text.includes(k.toLowerCase()));
        }
        return config.commentsType === 'all';
      }

      if (triggerType === 'user_directed_messages' || triggerType === 'user_dm') {
        if (config.messageType === 'keywords') {
            const text = (eventData.messageText || '').toLowerCase();
            return config.keywords?.some((k: string) => text.includes(k.toLowerCase()));
        }
        return config.messageType === 'all';
      }

      return actualTriggerType === 'story_reply';
    });

    // 🚀 6. EXECUTION
    for (const automation of matchedAutomations) {
      // Logic for "Ask to Follow" enforcement
      const askToFollow = automation.actions?.some((a: any) => a.type === 'send_dm' && a.askToFollow);
      if (askToFollow && !eventData.isFollowing) {
          await sendDirectMessage(instagramAccount.access_token, eventData.from.id, "Please follow us to unlock this automation! 🔒", [
              { text: "I've Followed! ✅", payload: `CHECK_FOLLOW_${automation.id.replace(/-/g, '')}` }
          ]);
          continue; 
      }

      // Init Lead State if needed
      const leadAction = automation.actions?.find((a: any) => a.type === 'save_lead');
      if (leadAction) {
        await updateContactMetadata(supabase, contactId, {
          ...metadata,
          conversation_state: { state: 'waiting_name', automation_id: automation.id, data: {}, last_message_at: new Date().toISOString() }
        });
      }

      for (const action of automation.actions || []) {
        await executeAction({ action, eventData, accessToken: instagramAccount.access_token, supabase, automationId: automation.id, userId, instagramAccountId, triggerType });
      }
    }

    return new Response(JSON.stringify({ success: true, executed: matchedAutomations.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function handleConversationState(params: any) {
  const { state, eventData, supabase, userId, instagramAccount, contactId, metadata } = params;
  const msg = (eventData.messageText || '').trim();
  const payload = eventData.postbackPayload;
  const automationId = state.automation_id;

  const { data: automation } = await supabase.from('automations').select('actions, id').eq('id', automationId).single();
  if (!automation) return { processed: false };

  const leadAction = automation.actions.find((a: any) => a.type === 'save_lead');
  if (!leadAction) return { processed: false };

  const dataToCollect = leadAction.collectFields || ['name', 'email'];
  const currentData = state.data || {};
  let nextState = state.state;

  // Handle Postbacks
  const cid = automation.id.replace(/-/g, '');
  if (payload === `CHANGE_NAME_${cid}`) nextState = 'waiting_name';
  else if (payload === `CHANGE_EMAIL_${cid}`) nextState = 'waiting_email';
  else if (payload === `CONFIRM_SAVE_${cid}`) nextState = 'saving';

  if (nextState === 'saving') {
    await supabase.from('leads').insert({ user_id: userId, automation_id: automationId, contact_id: contactId, name: currentData.name, email: currentData.email, phone: currentData.phone, custom_data: currentData.custom });
    await sendDirectMessage(instagramAccount.access_token, eventData.from.id, leadAction.messages?.success || "Saved! ✅");
    await updateContactMetadata(supabase, contactId, { ...metadata, conversation_state: { state: 'done' } });
    return { processed: true };
  }

  // Process Input
  if (!payload && msg) {
    if (state.state === 'waiting_name') {
      currentData.name = msg;
      nextState = dataToCollect.includes('email') ? 'waiting_email' : (dataToCollect.includes('phone') ? 'waiting_phone' : (dataToCollect.includes('custom') ? 'waiting_custom' : 'confirm'));
    } 
    else if (state.state === 'waiting_email') {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg)) {
        currentData.email = msg;
        nextState = dataToCollect.includes('phone') ? 'waiting_phone' : (dataToCollect.includes('custom') ? 'waiting_custom' : 'confirm');
      } else {
        await sendDirectMessage(instagramAccount.access_token, eventData.from.id, leadAction.messages?.invalidEmail || "Invalid email! 📧");
        return { processed: true };
      }
    }
    else if (state.state === 'waiting_phone') {
        currentData.phone = msg;
        nextState = dataToCollect.includes('custom') ? 'waiting_custom' : 'confirm';
    }
    else if (state.state === 'waiting_custom') {
        currentData.custom = msg;
        nextState = 'confirm';
    }
  }

  // Next Message
  let nextMessage = "";
  let buttons = [];

  if (nextState === 'waiting_email') nextMessage = leadAction.messages?.askEmail || "What's your email? 📧";
  else if (nextState === 'waiting_phone') nextMessage = leadAction.messages?.askPhone || "What's your phone? 📱";
  else if (nextState === 'waiting_custom') nextMessage = leadAction.customField?.label || "Tell us more:";
  else if (nextState === 'confirm') {
    nextMessage = (leadAction.messages?.confirmAll || "Confirm details:\n👤 Name: {{name}}\n📧 Email: {{email}}")
        .replace('{{name}}', currentData.name || 'N/A')
        .replace('{{email}}', currentData.email || 'N/A')
        .replace('{{phone}}', currentData.phone || 'N/A')
        .replace('{{custom}}', currentData.custom || 'N/A');
    buttons = [{ text: "Confirm ✅", payload: `CONFIRM_SAVE_${cid}` }, { text: "Edit Name 👤", payload: `CHANGE_NAME_${cid}` }];
  }

  if (nextMessage) await sendDirectMessage(instagramAccount.access_token, eventData.from.id, nextMessage, buttons);

  await updateContactMetadata(supabase, contactId, { ...metadata, conversation_state: { ...state, state: nextState, data: currentData } });
  return { processed: true };
}

async function executeAction(params: any) {
  const { action, eventData, accessToken, supabase, automationId, userId, instagramAccountId, triggerType } = params;
  
  if (action.type === 'reply_to_comment' && eventData.commentId) {
    const templates = action.replyTemplates;
    let text = "Check your DMs!";

    if (templates && templates.length > 0) {
      // 🔄 TRUE ROUND-ROBIN: use execution count modulo template count
      // This ensures sequential cycling (0,1,2,3,0,1,2...) instead of random repeats
      const { count } = await supabase
        .from('automation_activities')
        .select('*', { count: 'exact', head: true })
        .eq('automation_id', automationId)
        .eq('activity_type', 'comment');

      const index = (count || 0) % templates.length;
      text = templates[index];
      console.log(`[ROUND-ROBIN] automation=${automationId} count=${count} index=${index} template="${text.substring(0, 30)}"`);
    }

    text = text.replace('{{username}}', eventData.from.username || '');
    const replyRes = await fetch(`https://graph.instagram.com/v21.0/${eventData.commentId}/replies?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    if (!replyRes.ok) {
      const err = await replyRes.json().catch(() => ({}));
      console.error(`[reply_to_comment] Failed:`, JSON.stringify(err));
    } else {
      console.log(`[reply_to_comment] ✅ Replied to comment ${eventData.commentId}`);
    }
  }

  if (action.type === 'send_dm') {
    // 🔧 FIX: Try all field names the UI uses for the message
    // Simple Message → messageTemplate
    // Carousel / older format → title
    // Teaser → teaserMessage
    const dmText = (
      action.messageTemplate ||
      action.title ||
      action.teaserMessage ||
      "Hi!"
    ).replace('{{username}}', eventData.from.username || '');

    const recipient = (triggerType === 'post_comment' && eventData.commentId)
      ? { comment_id: eventData.commentId }
      : { id: eventData.from.id };

    console.log(`[send_dm] Sending to ${JSON.stringify(recipient)}: "${dmText.substring(0, 50)}"`);
    await sendDirectMessage(accessToken, recipient, dmText, action.actionButtons || []);
  }
}

async function sendDirectMessage(accessToken: string, recipient: any, text: string, buttons: any[] = []) {
  const recipientObj = typeof recipient === 'string' ? { id: recipient } : recipient;
  let payload: any = { recipient: recipientObj, message: { text } };
  if (buttons.length > 0) {
    payload.message = {
      attachment: { type: 'template', payload: {
          template_type: 'generic',
          elements: [{ title: text.substring(0, 80), subtitle: "Powered by QuickRevert", buttons: buttons.slice(0, 3).map(btn => ({
              type: btn.url ? 'web_url' : 'postback', title: (btn.text || btn.title).substring(0, 20), url: btn.url, payload: btn.payload || (btn.text || btn.title).toUpperCase()
          })) }]
      } }
    };
  }
  await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${accessToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function updateContactMetadata(supabase: any, contactId: string, metadata: any) {
  if (contactId) await supabase.from('contacts').update({ metadata }).eq('id', contactId);
}

async function logActivity(supabase: any, data: any) {
  await supabase.from('automation_activities').insert({ user_id: data.userId, automation_id: data.automationId, instagram_account_id: data.instagramAccountId, activity_type: data.activityType, target_username: data.targetUsername, message: data.message, status: data.status, metadata: data.metadata || {} });
}
