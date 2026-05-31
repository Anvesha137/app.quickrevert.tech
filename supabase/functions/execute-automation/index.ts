import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import { sendAlert } from '../_shared/alert.ts';

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

// ─── Execution Logger ──────────────────────────────────────────────────
interface ExecStep {
  step: string;
  ok: boolean;
  duration_ms?: number;
  detail?: string;
  error?: string;
}

class ExecutionTracker {
  steps: ExecStep[] = [];
  startTime = Date.now();

  track(step: string, ok: boolean, detail?: string, error?: string, startMs?: number) {
    this.steps.push({
      step,
      ok,
      duration_ms: startMs ? Date.now() - startMs : undefined,
      detail: detail?.substring(0, 200),
      error: error?.substring(0, 500)
    });
  }

  get duration() { return Date.now() - this.startTime; }
  get hasFailure() { return this.steps.some(s => !s.ok); }
  get status(): 'success' | 'partial' | 'failed' {
    if (this.steps.length === 0) return 'success';
    const failures = this.steps.filter(s => !s.ok).length;
    if (failures === 0) return 'success';
    if (failures === this.steps.length) return 'failed';
    return 'partial';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  let supabaseUrl = '';
  let supabaseServiceKey = '';
  let supabase: any = null;
  let requestBody: any = null;
  let userId = '';
  let instagramAccountId = '';
  let triggerType = '';
  let eventData: any = null;
  let matchedAutomations: any[] = [];
  const tracker = new ExecutionTracker();

  try {
    supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    requestBody = await req.json();
    userId = requestBody.userId;
    instagramAccountId = requestBody.instagramAccountId;
    triggerType = requestBody.triggerType;
    eventData = requestBody.eventData;

    // 1. Fetch Instagram Account
    const tAccount = Date.now();
    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('access_token, instagram_user_id, username')
      .eq('id', instagramAccountId)
      .single();

    tracker.track(
      'fetch_account',
      !accountError && !!instagramAccount,
      instagramAccount?.username ? `username=@${instagramAccount.username}` : undefined,
      accountError?.message || (!instagramAccount ? 'Instagram account not found' : undefined),
      tAccount
    );

    if (accountError || !instagramAccount) throw new Error('Instagram account not found');

    // 2. Fetch User Profile & Follow Status (Critical for "Follow to Unlock")
    // Uses Instagram Graph API (graph.instagram.com) — the access token stored is an Instagram token,
    // NOT a Facebook Page token. graph.facebook.com requires a Page token and will return code 190.
    const tProfile = Date.now();
    let profileFetched = false;
    let profileError = '';
    try {
      // Try Instagram Graph API first (correct for Instagram tokens)
      const igRes = await fetch(`https://graph.instagram.com/v21.0/${eventData.from.id}?fields=name,username&access_token=${instagramAccount.access_token}`);
      if (igRes.ok) {
        const igData = await igRes.json();
        eventData.from.name = igData.name || igData.username || eventData.from.name;
        // is_user_follow_business is only available via Facebook Graph API with a Page token.
        // Default to false if not already set — "Follow to Unlock" will re-check via postback.
        if (eventData.isFollowing === undefined) eventData.isFollowing = false;
        profileFetched = true;
      } else {
        const errText = await igRes.text();
        profileError = `IG API Status ${igRes.status}: ${errText}`;
        console.warn('[fetch_profile] Instagram API failed:', profileError);
      }
    } catch (e: any) {
      console.warn('[fetch_profile] Exception:', e.message);
      profileError = e.message;
    }
    tracker.track(
      'fetch_profile',
      profileFetched,
      `isFollowing=${eventData.isFollowing}`,
      profileError || undefined,
      tProfile
    );

    // 3. Resolve Contact & State
    const tContact = Date.now();
    const { data: contact, error: contactDbError } = await supabase
      .from('contacts')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('instagram_account_id', instagramAccountId)
      .eq('instagram_user_id', eventData.from.id)
      .maybeSingle();

    tracker.track(
      'fetch_contact',
      !contactDbError,
      contact ? `contactId=${contact.id}` : 'No contact found',
      contactDbError?.message || undefined,
      tContact
    );

    const metadata = contact?.metadata || {};
    const conversationState = metadata.conversation_state || { state: 'new' };
    const contactId = contact?.id;

    // 🎯 4. STATE-MACHINE (Lead Manager)
    if (conversationState.state && !['new', 'done', 'error'].includes(conversationState.state)) {
      const tState = Date.now();
      const stateResult = await handleConversationState({
        state: conversationState,
        eventData,
        supabase,
        userId,
        instagramAccount,
        contactId,
        metadata
      });

      tracker.track(
        'state_machine',
        true,
        `processed=${stateResult.processed}, state=${conversationState.state}`,
        undefined,
        tState
      );

      if (stateResult.processed) {
        await writeExecutionLog({
          supabase,
          userId,
          instagramAccountId,
          triggerType,
          eventData,
          requestBody,
          tracker,
          status: 'success',
          matchedAutomation: null
        });

        return new Response(JSON.stringify({ success: true, mode: 'state_machine' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 🔍 5. TRIGGER MATCHING
    const tMatch = Date.now();
    const { data: automations, error: automationsError } = await supabase
      .from('automations')
      .select('id, name, trigger_type, trigger_config, actions')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (automationsError) {
      tracker.track('fetch_automations', false, undefined, automationsError.message, tMatch);
      throw automationsError;
    }

    matchedAutomations = (automations || []).filter(automation => {
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

    tracker.track(
      'trigger_match',
      matchedAutomations.length > 0,
      `matched=${matchedAutomations.length} automation(s)`,
      matchedAutomations.length === 0 ? 'No active automations matched the trigger' : undefined,
      tMatch
    );

    if (matchedAutomations.length === 0) {
      await writeExecutionLog({
        supabase,
        userId,
        instagramAccountId,
        triggerType,
        eventData,
        requestBody,
        tracker,
        status: 'no_match',
        matchedAutomation: null
      });

      return new Response(JSON.stringify({ success: true, executed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 🚀 6. EXECUTION
    for (const automation of matchedAutomations) {
      // Logic for "Ask to Follow" enforcement
      const askToFollow = automation.actions?.some((a: any) => a.type === 'send_dm' && a.askToFollow);
      if (askToFollow && !eventData.isFollowing) {
          const tFollow = Date.now();
          const followRes = await sendDirectMessage(instagramAccount.access_token, eventData.from.id, "Please follow us to unlock this automation! 🔒", [
              { text: "I've Followed! ✅", payload: `CHECK_FOLLOW_${automation.id.replace(/-/g, '')}` }
          ]);
          tracker.track(
            'ask_to_follow',
            followRes.ok,
            'Sent check-follow prompt',
            !followRes.ok ? `Failed to send follow prompt` : undefined,
            tFollow
          );
          continue; 
      }

      // Init Lead State if needed
      const leadAction = automation.actions?.find((a: any) => a.type === 'save_lead');
      if (leadAction) {
        const tLead = Date.now();
        await updateContactMetadata(supabase, contactId, {
          ...metadata,
          conversation_state: { state: 'waiting_name', automation_id: automation.id, data: {}, last_message_at: new Date().toISOString() }
        });
        tracker.track(
          'save_lead_init',
          true,
          'Initialized conversation state waiting_name',
          undefined,
          tLead
        );
      }

      for (const action of automation.actions || []) {
        const tAction = Date.now();
        const actionResult = await executeAction({
          action,
          eventData,
          accessToken: instagramAccount.access_token,
          supabase,
          automationId: automation.id,
          userId,
          instagramAccountId,
          triggerType
        });
        tracker.track(
          action.type,
          actionResult.ok,
          actionResult.detail || undefined,
          actionResult.error || undefined,
          tAction
        );
      }
    }

    const finalStatus = tracker.status;

    await writeExecutionLog({
      supabase,
      userId,
      instagramAccountId,
      triggerType,
      eventData,
      requestBody,
      tracker,
      status: finalStatus,
      matchedAutomation: matchedAutomations[0]
    });

    if (finalStatus === 'failed') {
      sendAlert({
        level: 'error',
        subject: `Code Engine Execution Failed`,
        context: 'execute-automation',
        details: `Automation "${matchedAutomations[0]?.name || 'unknown'}" failed for user ${userId}.\n${tracker.steps.filter(s => !s.ok).map(s => `${s.step}: ${s.error}`).join('\n')}`,
        data: { userId, triggerType, steps: tracker.steps }
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, executed: matchedAutomations.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[execute-automation] Exception:', error.message);
    tracker.track('execution_crash', false, undefined, error.message);

    if (supabase && userId) {
      await writeExecutionLog({
        supabase,
        userId,
        instagramAccountId,
        triggerType,
        eventData,
        requestBody,
        tracker,
        status: 'failed',
        matchedAutomation: matchedAutomations[0] || null,
        topLevelError: error.message
      });

      sendAlert({
        level: 'error',
        subject: `Code Engine Execution Crashed`,
        context: 'execute-automation',
        details: `Automation execution crashed for user ${userId}.\nError: ${error.message}`,
        data: { userId, triggerType, error: error.message, steps: tracker.steps }
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

interface WriteLogParams {
  supabase: any;
  userId: string;
  instagramAccountId: string;
  triggerType: string;
  eventData: any;
  requestBody: any;
  tracker: ExecutionTracker;
  status: string;
  matchedAutomation: any;
  topLevelError?: string;
}

async function writeExecutionLog(params: WriteLogParams) {
  const {
    supabase,
    userId,
    instagramAccountId,
    triggerType,
    eventData,
    requestBody,
    tracker,
    status,
    matchedAutomation,
    topLevelError
  } = params;

  try {
    const errorMsg = topLevelError || (tracker.hasFailure
      ? tracker.steps.filter(s => !s.ok).map(s => `${s.step}: ${s.error}`).join('; ')
      : null);

    const logRow = {
      user_id: userId || '00000000-0000-0000-0000-000000000000',
      automation_id: matchedAutomation?.id || null,
      automation_name: matchedAutomation?.name || null,
      instagram_account_id: instagramAccountId || null,
      trigger_type: triggerType || 'unknown',
      event_id: requestBody?.eventId || null,
      status: status,
      steps: tracker.steps,
      duration_ms: tracker.duration,
      error_message: errorMsg,
      event_data: eventData,
      request_body: requestBody,
    };

    const { error } = await supabase.from('automation_execution_logs').insert(logRow);
    if (error) {
      console.error('[writeExecutionLog] Failed to insert log row:', error.message);
    } else {
      console.log('[writeExecutionLog] ✅ Successfully wrote execution log');
    }
  } catch (e: any) {
    console.error('[writeExecutionLog] Exception caught:', e.message);
  }
}

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
      return { ok: false, error: err.error?.message || replyRes.statusText || 'Failed to reply to comment' };
    } else {
      console.log(`[reply_to_comment] ✅ Replied to comment ${eventData.commentId}`);
      return { ok: true, detail: `Replied commentId=${eventData.commentId}` };
    }
  }

  if (action.type === 'send_dm') {
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
    const dmRes = await sendDirectMessage(accessToken, recipient, dmText, action.actionButtons || []);
    if (!dmRes.ok) {
      const err = await dmRes.json().catch(() => ({}));
      return { ok: false, error: err.error?.message || dmRes.statusText || 'Failed to send DM' };
    } else {
      return { ok: true, detail: `DM sent to ${eventData.from.username || 'recipient'}` };
    }
  }

  return { ok: true, detail: `Unsupported action type: ${action.type}` };
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
  const res = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${accessToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[send_dm] ❌ Failed:', JSON.stringify(errBody));
  }
  return res;
}

async function updateContactMetadata(supabase: any, contactId: string, metadata: any) {
  if (contactId) await supabase.from('contacts').update({ metadata }).eq('id', contactId);
}

async function logActivity(supabase: any, data: any) {
  await supabase.from('automation_activities').insert({ user_id: data.userId, automation_id: data.automationId, instagram_account_id: data.instagramAccountId, activity_type: data.activityType, target_username: data.targetUsername, message: data.message, status: data.status, metadata: data.metadata || {} });
}
