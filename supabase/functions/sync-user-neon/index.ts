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

  try {
    const { userId, instagramHandle, email, fullName } = await req.json()

    if (!userId || !email) {
      throw new Error("Missing required fields: userId, email");
    }

    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      console.warn("NEON_DB_URL not set");
      return new Response(JSON.stringify({ message: "Neon DB not configured" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Syncing user to Neon: ${email}`);
    // Initialize Supabase Client to fetch additional data
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Fetch Connected Instagram Account (Active)
    const { data: instagramData } = await supabaseClient
      .from('instagram_accounts')
      .select('username')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const connectedHandle = instagramData?.username || null;

    // Count Active Automations
    const { count: automationsCount, error: countError } = await supabaseClient
      .from('automations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Fallback to 0 if error
    const activeAutomationsCount = countError ? 0 : (automationsCount || 0);

    // --- Fetch Subscription Status to avoid overwriting Premium with Pending ---
    const { data: subData } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let status = 'Pending';
    let packageName = null;
    let billingCycle = null;
    let subscriptionEnd = null;
    let paymentStatus = 'unpaid';
    let amountPaid = 0;
    let discountAmount = 0;

    if (subData && (subData.status === 'active' || subData.status === 'trialing')) {
      status = 'PaidCustomer';
      paymentStatus = 'paid';
      subscriptionEnd = subData.current_period_end;
      amountPaid = subData.amount_paid || 0;
      discountAmount = subData.discount_amount || 0;

      const planId = (subData.plan_id || '').toLowerCase();
      if (planId.includes('gold')) {
        packageName = 'Gold';
      } else {
        packageName = 'Premium';
      }

      if (planId.includes('quarterly')) {
        packageName += ' Quarterly';
        billingCycle = 'quarterly';
      } else if (planId.includes('annual')) {
        packageName += ' Annual';
        billingCycle = 'annual';
      }
    }

    console.log(`Syncing user to Neon: ${email}. Status: ${status}, Insta: ${connectedHandle}, Automations: ${activeAutomationsCount}`);

    const neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // Check if user already exists in Neon and was deleted
    const { rows: existingNeonUsers } = await neonClient.queryObject(
      `SELECT id, deleted FROM users WHERE email = $1`,
      [email]
    );

    if (existingNeonUsers.length > 0) {
      const existingUser = existingNeonUsers[0] as any;
      if (existingUser.deleted) {
        console.log(`User ${email} was previously deleted. Removing old record for fresh start.`);
        await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [existingUser.id]);
      }
    }

    await neonClient.queryObject`
      INSERT INTO users (
        id,
        username, 
        email, 
        package,
        billing_cycle,
        status,
        subscription_end,
        payment_status,
        amount_paid,
        discount_amount,
        deleted,
        last_active,
        connected_instagram_handle,
        automations_count
      ) VALUES (
        ${userId},
        ${instagramHandle || fullName || email.split('@')[0]}, 
        ${email}, 
        ${packageName},
        ${billingCycle},
        ${status},
        ${subscriptionEnd},
        ${paymentStatus},
        ${amountPaid},
        ${discountAmount},
        FALSE,
        NOW() + INTERVAL '5 hours 30 minutes',
        ${connectedHandle},
        ${activeAutomationsCount}
      )
      ON CONFLICT (email) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, users.username),
        package = COALESCE(EXCLUDED.package, users.package),
        billing_cycle = COALESCE(EXCLUDED.billing_cycle, users.billing_cycle),
        status = EXCLUDED.status,
        subscription_end = COALESCE(EXCLUDED.subscription_end, users.subscription_end),
        payment_status = EXCLUDED.payment_status,
        amount_paid = GREATEST(EXCLUDED.amount_paid, users.amount_paid),
        discount_amount = GREATEST(EXCLUDED.discount_amount, users.discount_amount),
        deleted = FALSE,
        last_active = NOW() + INTERVAL '5 hours 30 minutes',
        connected_instagram_handle = EXCLUDED.connected_instagram_handle,
        automations_count = EXCLUDED.automations_count;
    `;

    // Also Insert into Onboardings if not exists?
    // The user schema has onboardings table too.
    // Let's stick to 'users' table as requested for "values of the users who logged in".

    await neonClient.end();
    console.log("Neon DB Sync Successful");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
