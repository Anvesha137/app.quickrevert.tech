import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    // 1. Parallel Fetch all necessary data from Supabase
    const [instagramResult, allAutomationsResult, subResult, limitResult] = await Promise.all([
      supabaseClient.from('instagram_accounts').select('username, initial_followers_count, followers_count').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      supabaseClient.from('automations').select('status').eq('user_id', userId),
      supabaseClient.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('user_limits').select('*').eq('user_id', userId).maybeSingle()
    ]);

    if (instagramResult.error) console.warn("[sync-user-neon] Instagram fetch error:", instagramResult.error.message);
    const connectedHandle = instagramResult.data?.username || null;
    const initialFollowers = instagramResult.data?.initial_followers_count || 0;
    const currentFollowers = instagramResult.data?.followers_count || 0;

    const automations = allAutomationsResult.data || [];
    const activeAutomationsCount = automations.filter(a => a.status === 'active').length;
    const deactivatedAutomationsCount = automations.filter(a => a.status !== 'active').length;
    const totalAutomationsCount = automations.length;

    const subData = subResult.data;
    if (subResult.error) console.warn("[sync-user-neon] Subscription fetch error:", subResult.error.message);

    let status = 'active';
    let packageName: string | null = null;
    let billingCycle: string | null = null;
    let subscriptionEnd: string | null = null;
    let subscriptionStart: string | null = null;
    let paymentStatus = 'unpaid';
    let amountPaid = 0;
    let discountAmount = 0;
    let promoCode: string | null = null;

    if (subData && (subData.status === 'active' || subData.status === 'trialing')) {
      paymentStatus = 'paid';
      subscriptionEnd = subData.current_period_end || null;
      subscriptionStart = subData.current_period_start || subData.created_at || null;
      amountPaid = subData.amount_paid || 0;
      discountAmount = subData.discount_amount || 0;
      promoCode = subData.coupon_code || null;

      const planId = (subData.plan_id || '').toLowerCase();
      packageName = 'Premium';

      if (planId.includes('quarterly')) {
        packageName = planId.toLowerCase().includes('sampler') ? 'Monthly Sampler (Quarterly)' : 'Premium Quarterly';
        billingCycle = 'quarterly';
      } else if (planId.includes('annual')) {
        packageName = planId.toLowerCase().includes('sampler') ? 'Monthly Sampler (Annual)' : 'Premium Annual';
        billingCycle = 'annual';
      } else {
        billingCycle = 'monthly';
      }
    }

    const usernameValue = instagramHandle || fullName || email.split('@')[0];
    const cleanEmail = email.trim().toLowerCase();

    // 2. Neon Operations
    console.log(`[sync-user-neon] Connecting to Neon for email: ${cleanEmail}`);
    neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // 2.1 First, ensure user exists in Neon (Sync Supabase User to Neon Users table)
    // We use ILIKE for email matching to be extra safe
    const { rows: existingNeonUsers } = await neonClient.queryObject(`SELECT id, deleted FROM users WHERE email ILIKE $1`, [cleanEmail]);
    
    if (existingNeonUsers.length > 0 && (existingNeonUsers[0] as any).deleted) {
      await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [(existingNeonUsers[0] as any).id]);
    }

    // 1. Fetch comprehensive KPIs from Supabase
    const { data: userStats, error: statsError } = await supabaseClient
      .from('instagram_accounts')
      .select(`
        username,
        followers_count,
        initial_followers_count
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    // Aggregations
    const [dmRes, cmtRes, conRes, autoRes, subRes] = await Promise.all([
      supabaseClient.from('automation_activities').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction']),
      supabaseClient.from('automation_activities').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['comment', 'reply', 'incoming_comment', 'comment_reply']),
      supabaseClient.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseClient.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    const activeAutomationsRes = await supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active');
    const deactivatedAutomationsRes = await supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'inactive');

    const totalDMs = dmRes.count || 0;
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

    if (subData && (subData.status === 'active' || subData.status === 'trialing')) {
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

    // 2.1 Upsert into Neon
    const upsertQuery = `
      INSERT INTO users (
        id, username, email, instagram_handle, connected_instagram_handle,
        insta_followers_now, insta_followers_at_joining, insta_growth,
        no_of_automations, automations_active, automations_deactivated,
        total_dms, total_comments, total_reach,
        package, status, payment_status,
        plan_name, plan_status,
        last_active, joining_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
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
        package = EXCLUDED.package,
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status,
        plan_name = EXCLUDED.plan_name,
        plan_status = EXCLUDED.plan_status,
        last_active = NOW();
    `;

    await neonClient.queryArray(upsertQuery, [
      userId, usernameValue, cleanEmail, connectedHandle, connectedHandle,
      followers, initialFollowers, growth,
      totalAutomations, activeAutomations, deactivatedAutomations,
      totalDMs, totalComments, totalReach,
      packageName, status, (subData && (subData.status === 'active' || subData.status === 'trialing')) ? 'paid' : 'unpaid',
      packageName, planStatus
    ]);

    // 2.2 Process Banned
    const { rows: bannedRows } = await neonClient.queryObject(`SELECT id FROM banned_users WHERE email ILIKE $1`, [cleanEmail]);
    if (bannedRows.length > 0) {
      await neonClient.end();
      return new Response(JSON.stringify({ success: true, isBanned: true, email: cleanEmail }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2.3 Process Gifted
    let giftedRows: any[] = [];
    const giftedRes = await neonClient.queryObject(`
      SELECT gp.* FROM gifted_premium gp 
      JOIN users u ON u.id = gp.user_id 
      WHERE u.email ILIKE $1 OR u.id = $2
    `, [cleanEmail, userId]);
    giftedRows = giftedRes.rows;

    let isGifted = giftedRows.length > 0;
    let giftedSettings = isGifted ? (giftedRows[0] as any) : null;
    if (isGifted && new Date(giftedSettings.expiry_date) < new Date()) {
        isGifted = false;
        giftedSettings = null;
    }

    // 3. Smart Limit Sync (Update Supabase)
    const syncLimits: any = {
      user_id: userId,
      is_gifted: isGifted,
      updated_at: new Date().toISOString()
    };

    if (isGifted && giftedSettings) {
      status = 'active';
      packageName = 'Gifted Premium';
      syncLimits.dm_limit = giftedSettings.dm_limit;
      syncLimits.automation_limit = giftedSettings.automation_limit;
      syncLimits.lead_manager = giftedSettings.lead_manager === true || giftedSettings.lead_manager === 'true';
      syncLimits.carousel_enabled = giftedSettings.carousel_enabled === true || giftedSettings.carousel_enabled === 'true';
      syncLimits.carousel_count = giftedSettings.carousel_count || 10;
      syncLimits.menu_flow_enabled = giftedSettings.menu_flow_enabled === true || giftedSettings.menu_flow_enabled === 'true';
      syncLimits.menu_flow_count = giftedSettings.menu_flow_count || 10;
      syncLimits.ask_to_follow_enabled = giftedSettings.ask_to_follow_enabled === true || giftedSettings.ask_to_follow_enabled === 'true';
      syncLimits.account_limit = giftedSettings.account_limit || 1;
      syncLimits.expiry_date = giftedSettings.expiry_date;
    } else {
      const hasPaidPremium = subData && (subData.status === 'active' || subData.status === 'trialing') && subData.plan_id && subData.plan_id.toLowerCase() !== 'basic';
      syncLimits.dm_limit = hasPaidPremium ? null : 2000;
      syncLimits.automation_limit = hasPaidPremium ? null : 5;
      syncLimits.lead_manager = hasPaidPremium;
      syncLimits.carousel_enabled = hasPaidPremium;
      syncLimits.carousel_count = 10;
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
