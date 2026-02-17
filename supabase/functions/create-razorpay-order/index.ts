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

    // Calculate Base Amount (in paise)
    // PREMIUM: Q: 899/mo (3 months), Y: 599/mo (12 months)
    // GOLD: Q: 4999/mo (3 months), Y: 3499/mo (12 months)
    let amount = 0;
    if (planTier === 'gold') {
      amount = planType === 'annual' ? (3499 * 12 * 100) : (4999 * 3 * 100);
    } else {
      // Default to Premium
      amount = planType === 'annual' ? (599 * 12 * 100) : (899 * 3 * 100);
    }
    const currency = 'INR';

    // Coupon Logic
    if (couponCode) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      if (supabaseUrl && supabaseKey) {
        try {
          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
          const supabaseClient = createClient(supabaseUrl, supabaseKey);

          // Check coupon in Supabase promo_codes table
          const { data: coupon, error: couponError } = await supabaseClient
            .from('promo_codes')
            .select('*')
            .ilike('code', couponCode.trim())
            .eq('status', 'active')
            .maybeSingle();

          if (couponError) throw couponError;

          if (coupon) {
            const now = new Date();
            const expiresAt = new Date(coupon.expires_at);

            if (expiresAt >= now && coupon.used_count < coupon.usage_limit) {
              let discountPaise = 0;

              // Apply Discount
              if (coupon.pack_type === 'starter') {
                // Starter pack is treated as 100% OFF (Free)
                discountPaise = amount;
              } else if (coupon.discount_amount > 0) {
                // Flat discount in rupees
                discountPaise = coupon.discount_amount * 100;
              } else if (coupon.discount_percentage > 0) {
                // Percentage based
                discountPaise = Math.floor(amount * (coupon.discount_percentage / 100));
              }

              let finalAmount = amount - discountPaise;

              if (finalAmount <= 0) {
                console.log(`Coupon Applied: ${couponCode}, 100% OFF. Returning free status.`);
                return new Response(
                  JSON.stringify({ free: true, amount: 0 }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }

              // Enforce minimum ₹1 (100 paise) for Razorpay if not free
              amount = Math.max(100, finalAmount);
              console.log(`Coupon Applied: ${couponCode}, Discount: ${discountPaise}, Final: ${amount}`);
            } else {
              console.log(`Coupon Expired or Max Usage Reached: ${couponCode}`);
            }
          } else {
            console.log(`Invalid Coupon: ${couponCode}`);
          }
        } catch (supaError) {
          console.error("Supabase Promo Check Error:", supaError);
        }
      } else {
        console.warn("Supabase credentials not set, skipping coupon check");
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
