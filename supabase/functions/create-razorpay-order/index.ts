import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Razorpay from "npm:razorpay@2.8.4";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { planType, instagramHandle, couponCode } = await req.json()

    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization');
    console.log(`Auth Header present: ${!!authHeader}, Length: ${authHeader?.length}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error("Auth Error:", userError);
      return new Response(
        JSON.stringify({ error: `Unauthorized: ${userError?.message || 'No user found'}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const email = user.email;

    // Initialize Razorpay
    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      throw new Error("Missing Razorpay keys");
    }

    const razorpay = new Razorpay({
      key_id,
      key_secret,
    });

    // Calculate Base Amount
    let amount = planType === 'annual' ? 718800 : 100;
    const currency = 'INR';

    // Coupon Logic
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) throw new Error("Missing NEON_DB_URL");

    let isFree = false;

    // Connect DB for Coupon & Potential Activation
    const client = new Client(neonDbUrl);
    await client.connect();

    try {
      if (couponCode) {
        // Check coupon in promo_codes table
        const result = await client.queryObject`
                    SELECT * FROM promo_codes 
                    WHERE promo_code = ${couponCode} 
                    AND (expiry_date >= NOW())
                    AND (max_usage > total_usage_tilldate)
                `;

        if (result.rows.length > 0) {
          const coupon = result.rows[0] as any;

          // Increment usage
          // Note: We ideally increment only on success, but for check/create flow we calculate first.
          // For robust system, usage increment should happen on payment success/webhook. 
          // Here we just calculate price.

          // Apply Discount (Percentage based)
          let discountPaise = 0;
          if (coupon.discount_percentage > 0) {
            discountPaise = Math.floor(amount * (coupon.discount_percentage / 100));
          }

          amount = Math.max(0, amount - discountPaise);
          console.log(`Coupon Applied: ${couponCode}, Discount: ${discountPaise}, Final: ${amount}`);
        }
      }

      // Check if Free (0 Amount)
      if (amount <= 0) {
        console.log("Amount is 0. Activating Plan Directly.");

        // Calculate Dates (IST)
        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffsetMs);

        const expiryDate = new Date(istDate);
        if (planType === 'annual') {
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else {
          expiryDate.setMonth(expiryDate.getMonth() + 3);
        }

        const packageName = planType === 'annual' ? 'Premium Annual' : 'Premium Quarterly';

        // Upsert User Activation directly
        await client.queryObject`
             INSERT INTO users (
               username, 
               email, 
               package, 
               promo_code, 
               amt_paid,
               status,
               joining_date,
               subscription_start_date,
               expiry_date
             ) VALUES (
               ${instagramHandle}, 
               ${email}, 
               ${packageName}, 
               ${couponCode || null}, 
               0, 
               'PaidCustomer',
               ${istDate},
               ${istDate},
               ${expiryDate}
             )
             ON CONFLICT (email) DO UPDATE SET
               package = EXCLUDED.package,
               promo_code = EXCLUDED.promo_code,
               amt_paid = users.amt_paid + EXCLUDED.amt_paid,
               status = 'PaidCustomer',
               username = EXCLUDED.username,
               subscription_start_date = ${istDate},
               expiry_date = ${expiryDate};
           `;

        // Also increment coupon usage if used
        if (couponCode) {
          await client.queryObject`
               UPDATE promo_codes 
               SET total_usage_tilldate = total_usage_tilldate + 1 
               WHERE promo_code = ${couponCode}
             `;
        }

        isFree = true;
      }

    } finally {
      await client.end();
    }

    if (isFree) {
      return new Response(
        JSON.stringify({ status: 'success', free: true, amount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Standard Razorpay Flow for > 0
    const options = {
      amount, // Enforce minimum 100 paise if not free is done inside Razorpay API? No we handled 0 check.
      // If discount made it < 100 but > 0, Razorpay might fail. 
      // Let's enforce min 100 paise if NOT free.
      // But we already set amount = 0 if discount covers it.
      // If discount is 99%, amount might be 7188 - 7116 = 72 paise.
      // Razorpay needs min 1 INR.
      amount: Math.max(100, amount),

      currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        instagram_handle: instagramHandle,
        coupon_code: couponCode
      }
    };

    const order = await razorpay.orders.create(options);
    return new Response(
      JSON.stringify(order),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("General Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
