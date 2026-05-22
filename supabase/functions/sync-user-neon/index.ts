import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { sendAlert } from "../_shared/alert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let neonClient: Client | null = null;

  try {
    const body = await req.json();
    const { userId, instagramHandle, email, fullName } = body;

    console.log(`[sync-user-neon] Called with userId=${userId}, email=${email}`);

    if (!userId || !email) {
      throw new Error("Missing required fields: userId, email");
    }

    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      console.error("[sync-user-neon] NEON_DB_URL environment variable is not set!");
      return new Response(
        JSON.stringify({ error: "NEON_DB_URL not configured. Please set the secret in Supabase dashboard." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Initialize Supabase Client to fetch additional data
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch comprehensive KPIs from Supabase (single parallel fetch)
    const { data: userStats } = await supabaseClient
      .from('instagram_accounts')
      .select('username, followers_count, initial_followers_count')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const [dmRes, cmtRes, conRes, autoRes, subRes] = await Promise.all([
      // 🚀 OPTIMIZED: Read pre-computed counter from user_limits instead of scanning automation_activities
      supabaseClient.from('user_limits').select('total_dms').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('automation_activities').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['comment', 'reply', 'incoming_comment', 'comment_reply']),
      supabaseClient.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseClient.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    const activeAutomationsRes = await supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active');
    const deactivatedAutomationsRes = await supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'inactive');

    const totalDMs = dmRes.data?.total_dms || 0;  // from counter
    const totalComments = cmtRes.count || 0;
    const totalReach = conRes.count || 0;
    const totalAutomations = autoRes.count || 0;
    const activeAutomations = activeAutomationsRes.count || 0;
    const deactivatedAutomations = deactivatedAutomationsRes.count || 0;
    const followers = userStats?.followers_count || 0;
    const initialFollowers = userStats?.initial_followers_count || 0;
    const growth = Math.max(0, followers - initialFollowers);
    const connectedHandle = userStats?.username || null;
    
    // Plan & Status Info
    const subData = subRes.data;
    let status = 'active';
    let packageName = 'Free';
    let planStatus = subData?.status || 'active';
    let billingCycle = 'monthly';
    let amountPaid = subData?.amount_paid || 0;
    let discountAmount = subData?.discount_amount || 0;
    let promoCode = subData?.coupon_code || null;
    let paymentStatus = 'unpaid';

    if (subData && (subData.status === 'active' || subData.status === 'trialing')) {
      paymentStatus = 'paid';
      const planId = (subData.plan_id || '').toLowerCase();
      if (planId.includes('try_me_out')) packageName = 'Monthly Sampler';
      else if (planId.includes('premium')) packageName = 'Premium';
      else if (planId.includes('professional')) packageName = 'Professional';
      
      if (planId.includes('quarterly')) {
        packageName += ' (Quarterly)';
        billingCycle = 'quarterly';
      } else if (planId.includes('annual')) {
        packageName += ' (Annual)';
        billingCycle = 'annual';
      }
    }

    const usernameValue = instagramHandle || fullName || email.split('@')[0];
    const cleanEmail = email.trim().toLowerCase();

    // 2. Neon Operations
    console.log(`[sync-user-neon] Connecting to Neon for email: ${cleanEmail}`);
    neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // 2.1 First, ensure user exists in Neon (clean up deleted users)
    const { rows: existingNeonUsers } = await neonClient.queryObject(`SELECT id, deleted, assisted_by FROM users WHERE email ILIKE $1`, [cleanEmail]);
    
    if (existingNeonUsers.length > 0 && (existingNeonUsers[0] as any).deleted) {
      await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [(existingNeonUsers[0] as any).id]);
    }

    const isNewUser = existingNeonUsers.length === 0;
    const existingAssistedBy = existingNeonUsers.length > 0 ? (existingNeonUsers[0] as any).assisted_by : null;

    // 2.2 Check Banned FIRST (early exit)
    const { rows: bannedRows } = await neonClient.queryObject(`SELECT id FROM banned_users WHERE email ILIKE $1`, [cleanEmail]);
    if (bannedRows.length > 0) {
      await neonClient.end();
      return new Response(JSON.stringify({ success: true, isBanned: true, email: cleanEmail }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2.3 Check Gifted Premium directly from Neon (no fragile JOIN)
    let giftedRows: any[] = [];
    const giftedRes = await neonClient.queryObject(`
      SELECT gp.* FROM gifted_premium gp 
      WHERE gp.user_id IN (SELECT id FROM users WHERE email ILIKE $1)
         OR gp.user_id = $2
    `, [cleanEmail, userId]);
    giftedRows = giftedRes.rows;

    let isGifted = giftedRows.length > 0;
    let giftedSettings = isGifted ? (giftedRows[0] as any) : null;
    if (isGifted && new Date(giftedSettings.expiry_date) < new Date()) {
        isGifted = false;
        giftedSettings = null;
    }

    // Update packageName if gifted (so the Neon upsert has the correct value)
    if (isGifted && giftedSettings) {
      status = 'active';
      packageName = 'Gifted Premium';
      paymentStatus = 'paid';
    }

    // 2.4 Upsert into Neon with correct packageName
    const upsertQuery = `
      INSERT INTO users (
        id, username, email, instagram_handle, connected_instagram_handle,
        insta_followers_now, insta_followers_at_joining, insta_growth,
        no_of_automations, automations_active, automations_deactivated,
        total_dms, total_comments, total_reach,
        plan_name, plan_status, status,
        last_active, joining_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        instagram_handle = EXCLUDED.instagram_handle,
        connected_instagram_handle = EXCLUDED.connected_instagram_handle,
        insta_followers_now = EXCLUDED.insta_followers_now,
        insta_followers_at_joining = EXCLUDED.insta_followers_at_joining,
        insta_growth = EXCLUDED.insta_growth,
        no_of_automations = EXCLUDED.no_of_automations,
        automations_active = EXCLUDED.automations_active,
        automations_deactivated = EXCLUDED.automations_deactivated,
        total_dms = EXCLUDED.total_dms,
        total_comments = EXCLUDED.total_comments,
        total_reach = EXCLUDED.total_reach,
        plan_name = EXCLUDED.plan_name,
        plan_status = EXCLUDED.plan_status,
        status = EXCLUDED.status,
        last_active = NOW();
    `;

    await neonClient.queryArray(upsertQuery, [
      userId, usernameValue, cleanEmail, connectedHandle, connectedHandle,
      followers, initialFollowers, growth,
      totalAutomations, activeAutomations, deactivatedAutomations,
      totalDMs, totalComments, totalReach,
      packageName, planStatus, status
    ]);

    // 2.5 Notify Admin of New User
    if (isNewUser) {
      console.log(`[sync-user-neon] Sending notification for new user: ${cleanEmail}`);
      const assistedByDisplay = existingAssistedBy || 'Unassigned';
      sendAlert({
        level: "info",
        subject: "New User Registered! 🚀",
        context: "Account Sync",
        details: `A new user has joined QuickRevert.\n\n**Email:** ${cleanEmail}\n**Name:** ${usernameValue}\n**Instagram:** ${connectedHandle || 'Not connected'}\n**Followers:** ${followers}\n**Assisted By:** ${assistedByDisplay}`,
        data: {
          userId,
          email: cleanEmail,
          name: usernameValue,
          instagram: connectedHandle,
          followers,
          assistedBy: existingAssistedBy || null
        }
      }).catch(err => console.error("[ALERT] Failed to send new user notification:", err));
    }

    // 3. Smart Limit Sync (Update Supabase user_limits)
    const syncLimits: any = {
      user_id: userId,
      is_gifted: isGifted,
      updated_at: new Date().toISOString()
    };

    if (isGifted && giftedSettings) {
      syncLimits.dm_limit = giftedSettings.dm_limit;
      syncLimits.automation_limit = giftedSettings.automation_limit;
      syncLimits.lead_manager = giftedSettings.lead_manager === true || giftedSettings.lead_manager === 'true';
      syncLimits.carousel_enabled = giftedSettings.carousel_enabled === true || giftedSettings.carousel_enabled === 'true';
      syncLimits.carousel_count = giftedSettings.carousel_count ? Math.min(giftedSettings.carousel_count, 6) : 6;
      syncLimits.menu_flow_enabled = giftedSettings.menu_flow_enabled === true || giftedSettings.menu_flow_enabled === 'true';
      syncLimits.menu_flow_count = giftedSettings.menu_flow_count ? Math.min(giftedSettings.menu_flow_count, 10) : 10;
      syncLimits.ask_to_follow_enabled = giftedSettings.ask_to_follow_enabled === true || giftedSettings.ask_to_follow_enabled === 'true';
      syncLimits.account_limit = giftedSettings.account_limit || 1;
      syncLimits.expiry_date = giftedSettings.expiry_date;
    } else {
      const hasPaidPremium = subData && (subData.status === 'active' || subData.status === 'trialing') && subData.plan_id && subData.plan_id.toLowerCase() !== 'basic';
      syncLimits.dm_limit = hasPaidPremium ? null : 2000;
      syncLimits.automation_limit = hasPaidPremium ? null : 5;
      syncLimits.lead_manager = hasPaidPremium;
      syncLimits.carousel_enabled = hasPaidPremium;
      syncLimits.carousel_count = 6;
      syncLimits.menu_flow_enabled = hasPaidPremium;
      syncLimits.menu_flow_count = 10;
      syncLimits.ask_to_follow_enabled = hasPaidPremium;
      syncLimits.account_limit = hasPaidPremium ? 2 : 1;
      syncLimits.expiry_date = null;
    }

    // ALWAYS update Supabase for now to confirm the sync is working
    console.log(`[sync-user-neon] FORCING update for user_limits: ${userId}`);
    await supabaseClient.from('user_limits').upsert(syncLimits, { onConflict: 'user_id' });




    await neonClient.end();
    neonClient = null;
    console.log("[sync-user-neon] ✅ Neon DB Sync Successful for", email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        email, 
        isGifted, 
        giftedSettings,
        packageName 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err as Error;
    console.error("[sync-user-neon] ❌ Error:", error.message, error.stack);
    if (neonClient) {
      try { await neonClient.end(); } catch (_) { }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
