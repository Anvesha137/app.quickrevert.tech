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
    console.log("  eventData.messageText:", eventData.messageText);

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

    console.log("✅ Account found:", instagramAccount.instagram_user_id);

    // 2. Resolve Username if missing
    if (!eventData.from.username || eventData.from.username === eventData.from.id) {
      console.log('\n🔍 STEP 2: Resolving username from Instagram API...');
      try {
        // ✅ FIXED: Use Instagram Platform API
        const userProfileUrl = `https://graph.instagram.com/v21.0/${eventData.from.id}?fields=username,name,profile_picture_url&access_token=${instagramAccount.access_token}`;
        console.log(`Fetching profile for ${eventData.from.id}`);

        const userProfileRes = await fetch(userProfileUrl);
        const resText = await userProfileRes.text();
        console.log(`Profile API response (${userProfileRes.status}):`, resText);

        if (userProfileRes.ok) {
          const userProfile = JSON.parse(resText);
          eventData.from.username = userProfile.username || userProfile.name || 'Instagram User';
          if (userProfile.name) eventData.from.name = userProfile.name;
          console.log('✅ Resolved identity:', { username: eventData.from.username, name: eventData.from.name });
        } else {
          console.error('❌ Failed to fetch user profile:', resText);
          eventData.from.username = 'Unknown';
        }
      } catch (err) {
        console.error('❌ Error fetching user profile:', err);
        eventData.from.username = 'UnknownError';
      }
    } else {
      console.log('\n✅ STEP 2: Username already provided:', eventData.from.username);
    }

    // --- USAGE LIMIT CHECK START ---
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthIso = startOfMonth.toISOString();
    const USAGE_LIMIT = 1000;

    if (triggerType === 'post_comment') {
      console.log('\n🔍 CHECK: Verifying monthly comment automation limit...');
      const { count, error: countError } = await supabase
        .from('automation_activities')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('activity_type', 'incoming_comment')
        .gte('executed_at', startOfMonthIso);

      if (countError) {
        console.error('❌ Error checking usage limit:', countError);
      } else {
        console.log(`   Current monthly usage: ${count}/${USAGE_LIMIT}`);
        if ((count || 0) >= USAGE_LIMIT) {
          console.warn('⚠️ Monthly comment automation limit reached. Skipping execution.');
          return new Response(JSON.stringify({
            success: false,
            message: 'Monthly comment automation limit reached',
            limit_reached: true
          }), {
            status: 200, // Return 200 to acknowledge webhook but stop processing
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }
    // --- USAGE LIMIT CHECK END ---

    // 3. Upsert Contact
    console.log('\n🔍 STEP 3: Upserting contact...');
    try {
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
        last_interaction_at: new Date().toISOString(),
        interaction_count: newInteractionCount,
      };

      const { error: contactError } = await supabase
        .from('contacts')
        .upsert(contactData, {
          onConflict: 'user_id,instagram_account_id,instagram_user_id',
          ignoreDuplicates: false
        });

      if (contactError) {
        console.error('❌ Contact upsert error:', contactError);
      } else {
        console.log('✅ Contact upserted successfully');
      }
    } catch (contactErr) {
      console.error('❌ Unexpected error handling contact:', contactErr);
    }

    // 4. Log the incoming event
    console.log('\n🔍 STEP 4: Logging incoming event...');
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
        status: 'success',
        metadata: {
          ...eventData,
          direction: 'inbound'
        }
      });
      console.log('✅ Event logged successfully');
    } catch (logError) {
      console.error('❌ Error logging incoming event:', logError);
    }

    // 5. Fetch Automations
    console.log('\n🔍 STEP 5: Fetching automations...');
    console.log("  Query conditions:");
    console.log("    user_id =", userId);
    console.log("    trigger_type =", triggerType);
    console.log("    status = 'active'");

    const { data: automations, error: automationError } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_type', triggerType)
      .eq('status', 'active');

    if (automationError) {
      console.error('❌ Automation fetch error:', automationError);
      throw automationError;
    }

    console.log(`✅ Found ${automations?.length || 0} active automation(s)`);

    if (automations && automations.length > 0) {
      automations.forEach((auto, i) => {
        console.log(`\n  Automation ${i + 1}:`);
        console.log("    ID:", auto.id);
        console.log("    Config:", JSON.stringify(auto.trigger_config, null, 2));
        console.log("    Actions:", auto.actions?.length || 0);
      });
    }

    if (!automations || automations.length === 0) {
      console.log('⚠️  No active automations found - returning early');
      return new Response(JSON.stringify({
        success: true,
        message: 'No automations to execute',
        debug: { userId, triggerType, foundAutomations: 0 }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Filter Matching Automations
    console.log('\n🔍 STEP 6: Filtering matching automations...');

    const matchedAutomations = automations.filter((automation, index) => {
      console.log(`\n  Checking automation ${index + 1} (ID: ${automation.id})...`);
      const config = automation.trigger_config || {};
      console.log("    Config:", JSON.stringify(config, null, 2));

      if (triggerType === 'post_comment') {
        if (config.postsType === 'specific') {
          const allowedPosts = config.specificPosts || [];
          if (!eventData.postId || !allowedPosts.includes(eventData.postId)) {
            console.log("    ❌ NO MATCH: Post not in allowed list");
            return false;
          }
        }

        if (config.commentsType === 'keywords' && config.keywords && eventData.commentText) {
          const text = eventData.commentText.toLowerCase();
          const matched = config.keywords.some((keyword: string) => text.includes(keyword.toLowerCase()));
          console.log(`    ${matched ? '✅ MATCH' : '❌ NO MATCH'}: Keyword matching`);
          return matched;
        }

        const matchAll = config.commentsType === 'all';
        console.log(`    ${matchAll ? '✅ MATCH' : '❌ NO MATCH'}: Trigger on all comments`);
        return matchAll;
      }

      if (triggerType === 'user_directed_messages') {
        console.log("    Message type:", config.messageType);

        if (config.messageType === 'all') {
          console.log("    ✅ MATCH: Triggers on ALL messages");
          return true;
        }

        if (config.messageType === 'keywords') {
          console.log("    Keywords:", config.keywords);
          console.log("    Message text:", eventData.messageText);

          if (!config.keywords || !eventData.messageText) {
            console.log("    ❌ NO MATCH: Missing keywords or message text");
            return false;
          }

          const text = eventData.messageText.toLowerCase();
          const matched = config.keywords.some((keyword: string) => {
            const match = text.includes(keyword.toLowerCase());
            console.log(`      '${keyword}' in '${text}': ${match}`);
            return match;
          });

          console.log(`    ${matched ? '✅ MATCH' : '❌ NO MATCH'}: Keyword matching`);
          return matched;
        }

        console.log("    ❌ NO MATCH: Unknown messageType");
        return false;
      }

      if (triggerType === 'story_reply') {
        const matchAll = config.storiesType === 'all';
        console.log(`    ${matchAll ? '✅ MATCH' : '❌ NO MATCH'}: Story reply`);
        return matchAll;
      }

      console.log("    ❌ NO MATCH: Unknown trigger type");
      return false;
    });

    console.log(`\n✅ ${matchedAutomations.length} automation(s) matched`);

    // 7. Execute Actions
    console.log('\n🚀 STEP 7: Executing actions...');

    for (const automation of matchedAutomations) {
      console.log(`\n  Processing automation ${automation.id}...`);
      console.log("    Actions count:", automation.actions?.length || 0);

      for (const action of automation.actions || []) {
        console.log(`\n    Executing action: ${action.type}`);
        try {
          await executeAction({
            action,
            eventData,
            accessToken: instagramAccount.access_token,
            instagramUserId: instagramAccount.instagram_user_id,
            supabase,
            automationId: automation.id,
            userId,
            instagramAccountId,
          });
          console.log("      ✅ Action executed successfully");
        } catch (actionError: any) {
          console.error('      ❌ Action execution failed:', actionError.message);
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

    // 8. N8N Workflow Execution
    console.log('\n🔍 STEP 8: Triggering N8N workflows...');
    try {
      const n8nBaseUrl = Deno.env.get('N8N_BASE_URL') || 'https://n8n.quickrevert.tech';

      const { data: n8nWorkflows, error: n8nError } = await supabase
        .from('n8n_workflows')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('trigger_type', triggerType);

      if (n8nError) {
        console.error('❌ Error fetching n8n workflows:', n8nError);
      } else if (n8nWorkflows && n8nWorkflows.length > 0) {
        console.log(`✅ Found ${n8nWorkflows.length} active n8n workflows`);

        for (const workflow of n8nWorkflows) {
          let targetUrl = workflow.webhook_url;

          if (!targetUrl && workflow.webhook_path) {
            targetUrl = `${n8nBaseUrl}/webhook/${workflow.webhook_path}`;
          }

          if (!targetUrl) {
            console.warn(`⚠️  Workflow ${workflow.name} has no webhook URL`);
            continue;
          }

          console.log(`  Triggering: ${workflow.name} → ${targetUrl}`);

          let n8nPayload: any = {
            userId,
            instagramAccountId,
            triggerType,
            eventData,
            workflowId: workflow.id,
            timestamp: new Date().toISOString()
          };

          if (triggerType === 'user_directed_messages') {
            n8nPayload = {
              object: "instagram",
              entry: [
                {
                  id: instagramAccount.instagram_user_id || "unknown_ig_id",
                  messaging: [
                    {
                      sender: { id: eventData.from.id },
                      recipient: { id: instagramAccount.instagram_user_id || "unknown_ig_id" },
                      timestamp: eventData.timestamp || Date.now(),
                      message: {
                        mid: eventData.messageId,
                        text: eventData.messageText
                      }
                    }
                  ]
                }
              ]
            };
          }

          try {
            fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(n8nPayload)
            }).then(async (res) => {
              const status = res.ok ? 'success' : 'failed';
              console.log(`  N8N response: ${res.status} (${status})`);

              await supabase.from('automation_activities').insert({
                user_id: userId,
                instagram_account_id: instagramAccountId,
                activity_type: 'n8n_trigger',
                target_username: eventData.from.username,
                message: `Triggered workflow: ${workflow.name}`,
                status: status,
                metadata: {
                  workflow_id: workflow.id,
                  response_status: res.status,
                  webhook_url: workflow.webhook_url
                }
              });
            }).catch(err => {
              console.error('  ❌ N8N trigger failed:', err);
              supabase.from('automation_activities').insert({
                user_id: userId,
                instagram_account_id: instagramAccountId,
                activity_type: 'n8n_trigger',
                target_username: eventData.from.username,
                message: `Failed to trigger workflow: ${workflow.name}`,
                status: 'failed',
                metadata: { error: err.message, workflow_id: workflow.id }
              });
            });
          } catch (e) {
            console.error('  ❌ Error initiating n8n request:', e);
          }
        }
      } else {
        console.log(`ℹ️  No active n8n workflows found`);
      }
    } catch (n8nMainError) {
      console.error('❌ Unexpected error in n8n execution:', n8nMainError);
    }

    console.log("\n═══════════════════════════════════════");
    console.log("✅ EXECUTION COMPLETE");
    console.log(`   Matched: ${matchedAutomations.length} automations`);
    console.log("═══════════════════════════════════════\n");

    return new Response(JSON.stringify({
      success: true,
      executed: matchedAutomations.length,
      n8n_triggered: true
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("\n❌❌❌ FATAL ERROR ❌❌❌");
    console.error("Error:", error);
    console.error("Stack:", error.stack);
    console.error("═══════════════════════════════════════\n");

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function executeAction(params: any) {
  const { action, eventData, accessToken, instagramUserId, supabase, automationId, userId, instagramAccountId } = params;

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
      // --- DM USAGE LIMIT CHECK ---
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count, error: countError } = await supabase
        .from('automation_activities')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('activity_type', 'send_dm')
        .gte('executed_at', startOfMonth.toISOString());

      if (!countError && (count || 0) >= 1000) {
        console.warn(`⚠️ Monthly DM limit reached (${count}/1000). Skipping DM action.`);
        await logActivity(supabase, {
          userId,
          automationId,
          instagramAccountId,
          activityType: 'send_dm_skipped',
          targetUsername: eventData.from.username,
          status: 'skipped',
          message: 'Monthly DM limit reached',
          metadata: { limit: 1000, current: count }
        });
        return; // Skip this action
      }
      // -----------------------------

      messageText = action.messageTemplate || '';
      buttons = action.actionButtons || [];
      break;
  }

  messageText = messageText.replace('{{username}}', eventData.from.username);

  // ✅ FIXED: Use Instagram Platform API
  const apiUrl = `https://graph.instagram.com/v21.0/me/messages`;

  let messagePayload: any = {
    recipient: { id: eventData.from.id },
    message: {}
  };

  if (buttons.length > 0) {
    // Instagram Platform API uses quick_replies
    messagePayload.message = {
      text: messageText,
      quick_replies: buttons.slice(0, 13).map((btn: any) => ({
        content_type: 'text',
        title: btn.text.substring(0, 20), // Max 20 chars
        payload: btn.url || btn.text.toUpperCase()
      }))
    };
  } else {
    messagePayload.message = { text: messageText };
  }

  console.log('      Sending message payload:', JSON.stringify(messagePayload, null, 2));

  // ✅ FIXED: Access token in URL params
  const response = await fetch(`${apiUrl}?access_token=${accessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messagePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('      Instagram API error:', errorText);
    throw new Error(`Instagram API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('      Message sent successfully:', result);

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