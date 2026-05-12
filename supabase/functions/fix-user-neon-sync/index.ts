import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, assistedBy } = await req.json();
    if (!email) throw new Error("Email is required");
    console.log(`[FixSync] Processing email: ${email}`);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseSecretKey);

    // 1. Get data from Supabase
    console.log("[FixSync] Fetching user from Supabase...");
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw new Error(`Supabase Auth Error: ${userError.message}`);
    
    const targetUser = userData.users.find(u => u.email === email);
    if (!targetUser) throw new Error(`User ${email} not found in Supabase Auth`);
    console.log(`[FixSync] Found User ID: ${targetUser.id}`);

    console.log("[FixSync] Fetching subscription from Supabase...");
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', targetUser.id)
      .maybeSingle();

    if (subError) throw new Error(`Supabase DB Error: ${subError.message}`);
    if (!sub) throw new Error(`No subscription found in Supabase for user ${targetUser.id}`);
    console.log(`[FixSync] Found Subscription: ${sub.plan_id}`);

    // 2. Connect to Neon
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) throw new Error("NEON_DB_URL not set");
    const neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    try {
      const planIdStr = sub.plan_id || '';
      const planTier = planIdStr.startsWith('try_me_out') ? 'try_me_out' : planIdStr.split('_')[0];
      const planType = planIdStr.startsWith('try_me_out') ? 'monthly' : (planIdStr.split('_')[1] || 'monthly');
      
      let packageName = planTier === 'try_me_out' ? 'Monthly Sampler' : planTier.charAt(0).toUpperCase() + planTier.slice(1);
      if (planType === 'quarterly') packageName += ' (Quarterly)';
      if (planType === 'annual') packageName += ' (Annual)';

      const price = sub.amount_paid || 199;

      // Update or Insert User
      let targetId = targetUser.id;
      const updateResult = await neonClient.queryObject(`
        UPDATE users SET 
          plan_name = $1, 
          plan_status = 'active',
          assisted_by = $2,
          promo_code = COALESCE($3, promo_code),
          deleted = FALSE
        WHERE TRIM(email) ILIKE TRIM($4)
        RETURNING id;
      `, [packageName, assistedBy || null, sub.coupon_code || null, email]);

      if (updateResult.rows.length === 0) {
        console.log(`[FixSync] User ${email} not found in Neon. Creating with Supabase ID: ${targetId}`);
        await neonClient.queryObject(`
          INSERT INTO users (id, username, email, status, joining_date, assisted_by, plan_name, plan_status)
          VALUES ($1, $2, $3, 'active', NOW(), $4, $5, 'active')
        `, [targetId, email.split('@')[0], email, assistedBy || null, packageName]);
      } else {
        targetId = (updateResult.rows[0] as any).id;
      }

      console.log(`[FixSync] Target Neon User ID: ${targetId}`);
      
      // Upsert Plan
      const planResult = await neonClient.queryObject(`
        INSERT INTO plans (name, billing_cycle, price, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (name) DO UPDATE SET is_active = true
        RETURNING id;
      `, [packageName, planType, price]);
      const planId = (planResult.rows[0] as any).id;

      // Manual Upsert for Subscription
      const { rows: existingSubs } = await neonClient.queryObject(`
        SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active'
      `, [targetId]);

      if (existingSubs.length > 0) {
        await neonClient.queryObject(`
          UPDATE subscriptions SET plan_id = $1, subscription_end = $2 
          WHERE user_id = $3 AND status = 'active'
        `, [planId, sub.current_period_end, targetId]);
      } else {
        await neonClient.queryObject(`
          INSERT INTO subscriptions (user_id, plan_id, subscription_start, subscription_end, status)
          VALUES ($1, $2, NOW(), $3, 'active')
        `, [targetId, planId, sub.current_period_end]);
      }

      // Insert Payment (Skip promo code check for repair)
      await neonClient.queryObject(`
        INSERT INTO payments (user_id, amount, discount_amount, promo_code, payment_status, paid_at)
        VALUES ($1, $2, $3, NULL, 'paid', NOW())
      `, [targetId, sub.amount_paid, sub.discount_amount]);

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Repaired sync for ${email}`,
        rowsUpdated: updateResult.rows.length 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } finally {
      await neonClient.end();
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
})
