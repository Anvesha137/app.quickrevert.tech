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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planType, instagramHandle, couponCode } = await req.json()

    // 1. Verify Signature using Web Crypto API (No external deps)
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
    const message = razorpay_order_id + "|" + razorpay_payment_id;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(key_secret);
    const msgData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      msgData
    );

    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (signatureHex !== razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // 3. Upsert to Supabase
    // Calculate Period End
    const now = new Date();
    const periodEnd = new Date();
    if (planType === 'annual') {
      periodEnd.setFullYear(now.getFullYear() + 1);
    } else {
      periodEnd.setMonth(now.getMonth() + 3);
    }

    const { error: dbError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: 'active',
        plan_id: planType,
        current_period_end: periodEnd.toISOString(),
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        instagram_handle: instagramHandle,
        coupon_code: couponCode,
        updated_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Database Error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Sync to Neon DB (Internal Dashboard)
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (neonDbUrl) {
      try {
        console.log("Syncing to Neon DB...");
        const neonClient = new Client(neonDbUrl);
        await neonClient.connect();

        // Fetch user email from Supabase
        const { data: { user: userData }, error: userError } = await supabaseClient.auth.admin.getUserById(userId);
        const email = userData?.email || '';

        // Determine Package Name
        let packageName = 'Premium'; // Default
        if (planType === 'quarterly') packageName = 'Premium Quarterly';
        if (planType === 'annual') packageName = 'Premium Annual';

        // Upsert User
        // We use ON CONFLICT (email) DO UPDATE to ensure we don't duplicate if they already exist (e.g. from login sync)
        await neonClient.queryObject`
             INSERT INTO users (
               username, 
               email, 
               package, 
               promo_code, 
               amt_paid,
               status,
               joining_date
             ) VALUES (
               ${instagramHandle}, 
               ${email}, 
               ${packageName}, 
               ${couponCode || null}, 
               ${planType === 'annual' ? 7188 : 2697}, 
               'PaidCustomer',
               NOW()
             )
             ON CONFLICT (email) DO UPDATE SET
               package = EXCLUDED.package,
               promo_code = EXCLUDED.promo_code,
               amt_paid = users.amt_paid + EXCLUDED.amt_paid,
               status = 'PaidCustomer',
               username = EXCLUDED.username;
           `;

        await neonClient.end();
        console.log("Neon DB Sync Successful");

      } catch (neonError) {
        console.error("Neon Sync Failed:", neonError);
        // proper fail-safe: don't fail the request if neon sync fails
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
