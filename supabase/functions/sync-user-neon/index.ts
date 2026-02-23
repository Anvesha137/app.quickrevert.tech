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

    // Fetch Connected Instagram Account (Active)
    const { data: instagramData, error: igError } = await supabaseClient
      .from('instagram_accounts')
      .select('username, initial_followers_count, followers_count')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (igError) console.warn("[sync-user-neon] Instagram fetch error:", igError.message);
    const connectedHandle = instagramData?.username || null;
    const initialFollowers = instagramData?.initial_followers_count || 0;
    const currentFollowers = instagramData?.followers_count || 0;

    // Count Active Automations
    const { count: automationsCount, error: countError } = await supabaseClient
      .from('automations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (countError) console.warn("[sync-user-neon] Automations count error:", countError.message);
    const activeAutomationsCount = countError ? 0 : (automationsCount || 0);

    // Fetch Subscription Status
    const { data: subData, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (subError) console.warn("[sync-user-neon] Subscription fetch error:", subError.message);

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
    console.log(`[sync-user-neon] Upserting user: email=${email}, status=${status}, handle=${connectedHandle}, automations=${activeAutomationsCount}`);

    neonClient = new Client(neonDbUrl);
    await neonClient.connect();
    console.log("[sync-user-neon] Connected to Neon DB");

    // Check if user already exists in Neon and was soft-deleted
    const { rows: existingNeonUsers } = await neonClient.queryObject(
      `SELECT id, deleted FROM users WHERE email = $1`,
      [email]
    );

    if (existingNeonUsers.length > 0) {
      const existingUser = existingNeonUsers[0] as any;
      if (existingUser.deleted) {
        console.log(`[sync-user-neon] User ${email} was previously deleted. Removing old record for fresh start.`);
        await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [existingUser.id]);
      }
    }

    // Upsert user — covers all columns in the users table schema
    await neonClient.queryObject(
      `INSERT INTO users (
        id,
        username,
        email,
        status,
        promo_code,
        deleted,
        joining_date,
        last_active,
        instagram_handle,
        connected_instagram_handle,
        no_of_automations,
        insta_followers_at_joining,
        insta_followers_now
      ) VALUES (
        $1, $2, $3, $4, $5, FALSE,
        NOW() AT TIME ZONE 'Asia/Kolkata',
        NOW() AT TIME ZONE 'Asia/Kolkata',
        $6, $7, $8, $9, $10
      )
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
      [
        userId,            // $1 - id
        usernameValue,     // $2 - username
        email,             // $3 - email
        status,            // $4 - status
        promoCode,         // $5 - promo_code
        connectedHandle,   // $6 - instagram_handle
        connectedHandle,   // $7 - connected_instagram_handle
        activeAutomationsCount, // $8 - no_of_automations
        initialFollowers,  // $9 - insta_followers_at_joining
        currentFollowers,  // $10 - insta_followers_now
      ]
    );

    await neonClient.end();
    neonClient = null;
    console.log("[sync-user-neon] ✅ Neon DB Sync Successful for", email);

    return new Response(
      JSON.stringify({ success: true, email }),
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
