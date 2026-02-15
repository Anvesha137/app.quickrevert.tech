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
    const { planType, instagramHandle, couponCode } = await req.json()

    // Initialize Razorpay
    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      console.error("Missing Razorpay keys");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: Missing Razorpay keys" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const razorpay = new Razorpay({
      key_id,
      key_secret,
    });

    // Calculate Base Amount
    // Premium Annual: 599 * 12 = 7188 INR -> 718800 paise
    // Premium Quarterly: Changed to 1 INR -> 100 paise for testing
    let amount = planType === 'annual' ? 718800 : 100;
    const currency = 'INR';

    // Coupon Logic
    if (couponCode) {
      const neonDbUrl = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl) {
        try {
          const client = new Client(neonDbUrl);
          await client.connect();

          // Check coupon in promo_codes table
          const result = await client.queryObject`
                    SELECT * FROM promo_codes 
                    WHERE promo_code = ${couponCode} 
                    AND (expiry_date >= NOW())
                    AND (max_usage > total_usage_tilldate)
                `;

          if (result.rows.length > 0) {
            const coupon = result.rows[0] as any;
            // Apply Discount (Percentage based)
            // Apply Discount (Percentage based)
            let discountPaise = 0;
            if (coupon.discount_percentage > 0) {
              discountPaise = Math.floor(amount * (coupon.discount_percentage / 100));
            }

            let finalAmount = amount - discountPaise;

            if (finalAmount <= 0) {
              console.log(`Coupon Applied: ${couponCode}, 100% OFF. Returning free status.`);
              await client.end();
              return new Response(
                JSON.stringify({ free: true, amount: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Enforce minimum ₹1 (100 paise) for Razorpay if not free
            amount = Math.max(100, finalAmount);

            console.log(`Coupon Applied: ${couponCode}, Discount: ${discountPaise}, Final: ${amount}`);
          } else {
            console.log(`Invalid or Expired Coupon: ${couponCode}`);
            // Optional: Return error or just ignore invalid coupon
          }

          await client.end();
        } catch (dbError) {
          console.error("Neon DB Error:", dbError);
          // Continue without discount on DB error (safe fail)
        }
      } else {
        console.warn("NEON_DB_URL not set, skipping coupon check");
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
    } catch (rzpError) {
      console.error("Razorpay API Error:", rzpError);
      return new Response(
        JSON.stringify({ error: `Razorpay Error: ${rzpError.message || JSON.stringify(rzpError)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

  } catch (error) {
    console.error("General Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
