import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Razorpay from "npm:razorpay@2.8.4";
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
    const { planTier, planType, instagramHandle, couponCode } = await req.json()

    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: Missing Razorpay keys" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const razorpay = new Razorpay({ key_id, key_secret });

    if (planTier === 'gold') {
      return new Response(
        JSON.stringify({ error: "The Gold Tier is no longer available. Please select the Premium plan." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Base amount in paise: Premium Annual = 599*12, Quarterly = 899*3
    let amount = planType === 'annual' ? (599 * 12 * 100) : (899 * 3 * 100);
    const currency = 'INR';

    // Coupon Logic — check Neon DB using actual column names
    if (couponCode) {
      const neonDbUrl = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl) {
        const client = new Client(neonDbUrl);
        try {
          await client.connect();

          const result = await client.queryObject(`
            SELECT id, promo_code, discount_percentage, max_usage,
                   total_usage_tilldate, expiry_date
            FROM promo_codes
            WHERE LOWER(promo_code) = LOWER($1)
            LIMIT 1
          `, [couponCode.trim()]);

          if (result.rows.length > 0) {
            const coupon = result.rows[0] as any;
            const now = new Date();
            const expiresAt = new Date(coupon.expiry_date);

            if (expiresAt >= now && coupon.total_usage_tilldate < coupon.max_usage) {
              const discountPct = coupon.discount_percentage || 0;
              const discountPaise = Math.floor(amount * (discountPct / 100));
              const finalAmount = amount - discountPaise;

              if (finalAmount <= 0) {
                console.log(`Coupon ${couponCode}: 100% OFF → free`);
                return new Response(
                  JSON.stringify({ free: true, amount: 0 }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }

              amount = Math.max(100, finalAmount);
              console.log(`Coupon ${couponCode}: ${discountPct}% off, final=${amount} paise`);
            } else {
              console.log(`Coupon ${couponCode}: expired or max usage reached`);
            }
          } else {
            console.log(`Coupon ${couponCode}: not found in Neon DB`);
          }
        } catch (neonError) {
          console.error("Neon DB Coupon Check Error:", neonError);
        } finally {
          await client.end();
        }
      }
    }

    const options = {
      amount,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        instagram_handle: instagramHandle,
        coupon_code: couponCode
      }
    };

    try {
      const order = await razorpay.orders.create(options);
      return new Response(
        JSON.stringify(order),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (rzpError: any) {
      console.error("Razorpay API Error:", rzpError);
      return new Response(
        JSON.stringify({ error: `Razorpay Error: ${rzpError.message || JSON.stringify(rzpError)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

  } catch (error: any) {
    console.error("General Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
