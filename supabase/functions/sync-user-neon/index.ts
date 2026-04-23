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
    const [instagramResult, automationsResult, subResult, limitResult] = await Promise.all([
      supabaseClient.from('instagram_accounts').select('username, initial_followers_count, followers_count').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      supabaseClient.from('automations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      supabaseClient.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('user_limits').select('*').eq('user_id', userId).maybeSingle()
    ]);

    if (instagramResult.error) console.warn("[sync-user-neon] Instagram fetch error:", instagramResult.error.message);
    const connectedHandle = instagramResult.data?.username || null;
    const initialFollowers = instagramResult.data?.initial_followers_count || 0;
    const currentFollowers = instagramResult.data?.followers_count || 0;

    const activeAutomationsCount = automationsResult.count || 0;

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
        packageName += ' Quarterly';
        billingCycle = 'quarterly';
      } else if (planId.includes('annual')) {
        packageName += ' Annual';
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

    await neonClient.queryObject(
      `INSERT INTO users (id, username, email, status, promo_code, deleted, joining_date, last_active, instagram_handle, connected_instagram_handle, no_of_automations, insta_followers_at_joining, insta_followers_now)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, users.username),
        status = EXCLUDED.status,
        promo_code = COALESCE(EXCLUDED.promo_code, users.promo_code),
        deleted = FALSE,
        last_active = NOW() AT TIME ZONE 'Asia/Kolkata',
        instagram_handle = COALESCE(EXCLUDED.instagram_handle, users.instagram_handle),
        connected_instagram_handle = COALESCE(EXCLUDED.connected_instagram_handle, users.connected_instagram_handle),
        no_of_automations = EXCLUDED.no_of_automations,
        insta_followers_at_joining = COALESCE(EXCLUDED.insta_followers_at_joining, users.insta_followers_at_joining),
        insta_followers_now = EXCLUDED.insta_followers_now`,
      [userId, usernameValue, cleanEmail, status, promoCode, connectedHandle, connectedHandle, activeAutomationsCount, initialFollowers, currentFollowers]
    );

    // 2.2 Now check for Banned and Gifted status
    const { rows: bannedRows } = await neonClient.queryObject(`SELECT id FROM banned_users WHERE email ILIKE $1`, [cleanEmail]);

    if (bannedRows.length > 0) {
      console.log(`[sync-user-neon] User ${cleanEmail} is BANNED.`);
      await neonClient.end();
      return new Response(JSON.stringify({ success: true, isBanned: true, email: cleanEmail }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Process Gifted - Robust Lookup
    // 1. Try join via email first (most reliable)
    let giftedRows: any[] = [];
    const giftedByEmailRes = await neonClient.queryObject(`
      SELECT gp.* FROM gifted_premium gp 
      JOIN users u ON u.id = gp.user_id 
      WHERE u.email ILIKE $1
    `, [cleanEmail]);
    
    giftedRows = giftedByEmailRes.rows;

    // 2. If not found, try direct email column in gifted_premium if it exists
    if (giftedRows.length === 0) {
      const { rows: columns } = await neonClient.queryObject(`SELECT column_name FROM information_schema.columns WHERE table_name='gifted_premium' AND column_name='email'`);
      if (columns.length > 0) {
        const giftedDirectRes = await neonClient.queryObject(`SELECT * FROM gifted_premium WHERE email ILIKE $1`, [cleanEmail]);
        giftedRows = giftedDirectRes.rows;
      }
    }

    // 3. If still not found, try by user_id
    if (giftedRows.length === 0) {
      const giftedByIdRes = await neonClient.queryObject(`SELECT * FROM gifted_premium WHERE user_id = $1`, [userId]);
      giftedRows = giftedByIdRes.rows;
    }

    console.log(`[sync-user-neon] Gifted Lookup Results: Found=${giftedRows.length}`);

    let isGifted = giftedRows.length > 0;
    let giftedSettings = isGifted ? (giftedRows[0] as any) : null;

    if (isGifted) {
      console.log(`[sync-user-neon] Gifted record found. Expiry: ${giftedSettings.expiry_date}`);
      // Handle potential string vs date type for expiry_date
      const expiry = new Date(giftedSettings.expiry_date);
      if (expiry < new Date()) {
        console.log(`[sync-user-neon] Gifted subscription EXPIRED.`);
        isGifted = false;
        giftedSettings = null;
      }
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
