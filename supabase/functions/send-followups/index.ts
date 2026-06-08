import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import { sendAlert } from '../_shared/alert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  let supabase: any = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 🔒 AUTH: Only accept internal calls
    const authHeader = req.headers.get('Authorization') || '';
    const isInternal = req.headers.get('x-quickrevert-internal') === 'true'
      && authHeader === `Bearer ${supabaseServiceKey}`;
    if (!isInternal) {
      console.warn('[send-followups] Rejected unauthorized call');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nowIso = new Date().toISOString();
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, user_id, instagram_account_id, instagram_user_id, metadata')
      .not('next_followup_at', 'is', null)
      .lte('next_followup_at', nowIso)
      .in('conversation_state', ['waiting_name', 'waiting_email', 'waiting_phone', 'waiting_custom', 'confirm']);

    if (error) {
      console.error('[send-followups] Error fetching contacts:', error);
      throw error;
    }

    let sentCount = 0;
    let skippedCount = 0;
    const now = new Date();

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0, message: "No pending contacts" }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Cache to avoid hitting DB multiple times for same automation or account
    const automationsCache = new Map();
    const accountsCache = new Map();

    for (const contact of contacts) {
      const metadata = contact.metadata || {};
      const conversationState = metadata.conversation_state || {};
      
      // Skip if follow-up already sent
      if (conversationState.followup_sent) continue;
      // Skip if no last_message_at
      if (!conversationState.last_message_at) continue;

      const automationId = conversationState.automation_id;
      if (!automationId) continue;

      // Fetch automation
      let automation = automationsCache.get(automationId);
      if (!automation) {
        const { data } = await supabase
          .from('automations')
          .select('actions')
          .eq('id', automationId)
          .single();
        if (data) {
          automation = data;
          automationsCache.set(automationId, automation);
        }
      }
        
      if (!automation) continue;

      const followUpAction = (automation.actions || []).find((a: any) => a.type === 'follow_up');
      if (!followUpAction || !followUpAction.enabled) {
         continue; // Follow up not configured or disabled
      }

      // We queried only for next_followup_at <= now(), so we can send immediately
      // Time to send!
      let instagramAccount = accountsCache.get(contact.instagram_account_id);
         if (!instagramAccount) {
             const { data } = await supabase
                .from('instagram_accounts')
                .select('access_token')
                .eq('id', contact.instagram_account_id)
                .single();
             if (data) {
                 instagramAccount = data;
                 accountsCache.set(contact.instagram_account_id, instagramAccount);
             }
         }
            
         if (!instagramAccount || !instagramAccount.access_token) {
             skippedCount++;
             continue;
         }

         // Send DM
         const followUpMsg = followUpAction.message || "Hey! Want to finish what you started?";
         const followUpButtons = (followUpAction.actionButtons || []).slice(0, 3).map((b: any) => {
            const isWeb = !!(b.url && b.url.trim() !== '');
            const mapped: any = {
              type: isWeb ? 'web_url' : 'postback',
              title: (b.text || b.title).substring(0, 20)
            };
            if (isWeb) mapped.url = b.url;
            else mapped.payload = b.payload || (b.text || b.title).toUpperCase();
            return mapped;
         });
         
         const recipient = { id: contact.instagram_user_id };
         let payload: any = { recipient, message: {} };

         if (followUpButtons.length > 0) {
           payload.message = {
             attachment: {
               type: 'template', payload: {
                 template_type: 'generic',
                 elements: [{
                   title: followUpMsg.substring(0, 80),
                   subtitle: "Powered by QuickRevert",
                   buttons: followUpButtons
                 }]
               }
             }
           };
         } else {
           payload.message.text = followUpMsg;
         }

         const dmRes = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${instagramAccount.access_token}`, { 
           method: 'POST', 
           headers: { 'Content-Type': 'application/json' }, 
           body: JSON.stringify(payload) 
         });

         if (dmRes.ok) {
            // Update state
            conversationState.followup_sent = true;
            await supabase.from('contacts').update({ 
              metadata: { ...metadata, conversation_state: conversationState },
              next_followup_at: conversationState.next_followup_at || null,
              conversation_state: conversationState.state || null
            }).eq('id', contact.id);
            
            // Log Activity (DM)
            await supabase.from('automation_activities').insert({
                user_id: contact.user_id,
                instagram_account_id: contact.instagram_account_id,
                contact_id: contact.id,
                automation_id: automationId,
                activity_type: 'send_dm',
                target_username: contact.username || contact.instagram_user_id,
                message: followUpMsg,
                status: 'success',
                metadata: {
                    direction: 'outbound',
                    trigger: 'follow_up'
                }
            });
            sentCount++;
         } else {
            console.error(`Failed to send follow-up to ${contact.instagram_user_id}:`, await dmRes.text());
            skippedCount++;
         }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount, skipped: skippedCount }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[send-followups] Exception:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
