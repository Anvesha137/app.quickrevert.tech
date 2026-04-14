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
    neonClient = new Client(neonDbUrl);
    await neonClient.connect();
    
    // Combined Banned and Gifted Check
    const [{ rows: bannedRows }, { rows: giftedRows }, { rows: existingNeonUsers }] = await Promise.all([
      neonClient.queryObject(`SELECT id FROM banned_users WHERE LOWER(email) = $1`, [cleanEmail]),
      neonClient.queryObject(`SELECT gp.dm_limit, gp.automation_limit, gp.ask_to_follow_enabled, gp.expiry_date FROM gifted_premium gp LEFT JOIN users u ON u.id = gp.user_id WHERE LOWER(u.email) = $1 OR LOWER(u.username) = $1 OR gp.user_id = $2`, [cleanEmail, userId]),
      neonClient.queryObject(`SELECT id, deleted FROM users WHERE email = $1`, [email])
    ]);

    if (bannedRows.length > 0) {
      console.log(`[sync-user-neon] User ${cleanEmail} is BANNED. Kicking out.`);
      await neonClient.end();
      return new Response(JSON.stringify({ success: true, isBanned: true, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Process Gifted
    let isGifted = giftedRows.length > 0;
    let giftedSettings = isGifted ? (giftedRows[0] as any) : null;

    if (isGifted && giftedSettings?.expiry_date) {
      if (new Date(giftedSettings.expiry_date) < new Date()) {
        isGifted = false;
        giftedSettings = null;
      }
    }

    // 3. Smart Limit Sync (Only update Supabase if values changed)
    let syncDmLimit, syncAutoLimit;
    if (isGifted) {
      status = 'active';
      packageName = 'Gifted Premium';
      subscriptionEnd = giftedSettings.expiry_date || null;
      syncDmLimit = giftedSettings?.dm_limit ?? null;
      syncAutoLimit = giftedSettings?.automation_limit ?? null;
    } else {
      const hasPaidPremium = subData && (subData.status === 'active' || subData.status === 'trialing') && subData.plan_id && subData.plan_id.toLowerCase() !== 'basic';
      syncDmLimit = hasPaidPremium ? null : 1000;
      syncAutoLimit = hasPaidPremium ? null : 3;
    }

    // Only update Supabase if limit settings mismatch current state
    const currentLimits = limitResult.data;
    if (!currentLimits || currentLimits.dm_limit !== syncDmLimit || currentLimits.automation_limit !== syncAutoLimit || currentLimits.is_gifted !== isGifted) {
      await supabaseClient.from('user_limits').upsert({ user_id: userId, is_gifted: isGifted, dm_limit: syncDmLimit, automation_limit: syncAutoLimit, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }

    // 4. Neon User Upsert
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
      [userId, usernameValue, email, status, promoCode, connectedHandle, connectedHandle, activeAutomationsCount, initialFollowers, currentFollowers]
    );

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
