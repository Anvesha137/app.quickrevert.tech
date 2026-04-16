import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Razorpay from "npm:razorpay@2.8.4";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // Support both new and legacy key names
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication token provided" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Use Secret Key (if available) to initialize admin client
    // This is more robust for "New Keys" architecture
    const supabaseClient = createClient(supabaseUrl, supabaseSecretKey || supabaseAnonKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          error: "Authentication failed", 
          details: authError?.message || "User session invalid"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const { planTier, planType, instagramHandle, couponCode } = await req.json()

    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      console.error("Server misconfiguration: Missing Razorpay keys");
      return new Response(
        JSON.stringify({ error: "Payment service is currently unavailable. Server is missing Razorpay keys. Please contact support." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const razorpay = new Razorpay({ key_id, key_secret });

    if (planTier === 'gold') {
      return new Response(
        JSON.stringify({ error: "The Gold Tier is no longer available. Please select the Premium plan." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Base amount in paise
    let amount = 0;
    if (planTier === 'try_me_out') {
      // Check for previous purchase (One-time only per account)
      const { data: existingSub, error: subError } = await supabaseClient
          .from('subscriptions')
          .select('id')
          .ilike('plan_id', '%try_me_out%')
          .limit(1)
          .maybeSingle();

      if (existingSub) {
          return new Response(
              JSON.stringify({ error: "You have already used the 'Try Me Out' plan. This offer is available only once per unique account." }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
      }

      amount = 199 * 100;
    } else if (planTier === 'premium') {
      amount = planType === 'annual' ? (4199 * 100) : (1199 * 100);
    } else if (planTier === 'professional') {
      amount = planType === 'annual' ? (5999 * 100) : (1799 * 100);
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid plan tier selected." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const currency = 'INR';

    // Coupon Logic — check Neon DB using actual column names
    if (couponCode) {
      const neonDbUrl = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl) {
        const client = new Client(neonDbUrl);
        try {
          await client.connect();

          const result = await client.queryObject(`
            SELECT id, promo_code, discount_percentage, discount_amount,
                   max_usage, total_usage_tilldate, expiry_date, package
            FROM promo_codes
            WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
            LIMIT 1
          `, [couponCode.trim()]);

          if (result.rows.length > 0) {
            const coupon = result.rows[0] as any;
            const now = new Date();
            const expiresAt = new Date(coupon.expiry_date);
            const usageCount = coupon.total_usage_tilldate ?? 0;
            const usageLimit = coupon.max_usage ?? 999;

            if (expiresAt >= now && usageCount < usageLimit) {
              const packType = coupon.package || '';
              if (packType) {
                const pkg = packType.toLowerCase();
                const plan = (planType || '').toLowerCase();
                const tier = (planTier || '').toLowerCase();

                // 1. Check Cycle (Annual/Quarterly)
                if ((pkg.includes('quarter') && plan !== 'quarterly') || (pkg.includes('annual') && plan !== 'annual')) {
                  return new Response(
                    JSON.stringify({ error: `Coupon is only valid for ${pkg.includes('quarter') ? 'Quarterly' : 'Annual'} plans.` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                  );
                }

                // 2. Check Tier (Professional/Premium etc)
                const possibleTiers = ['try_me_out', 'premium', 'professional', 'enterprise', 'starter'];
                const restrictedTier = possibleTiers.find(t => pkg.includes(t));
                if (restrictedTier && tier !== restrictedTier && !(restrictedTier === 'starter' && tier === 'try_me_out')) {
                  return new Response(
                    JSON.stringify({ error: `Coupon is only valid for the ${restrictedTier.toUpperCase()} tier.` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                  );
                }
              }

              const discountPct = coupon.discount_percentage || 0;
              const discountAmt = coupon.discount_amount || 0;
              
              let discountPaise = 0;
              if (discountPct > 0) {
                discountPaise = Math.floor(amount * (discountPct / 100));
              } else if (discountAmt > 0) {
                discountPaise = discountAmt * 100;
              }

              const finalAmount = amount - discountPaise;

              if (finalAmount <= 0) {
                console.log(`Coupon ${couponCode}: 100% OFF → free`);
                return new Response(
                  JSON.stringify({ free: true, amount: 0 }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    } catch (rzpError: any) {
      console.error("Razorpay API Error:", rzpError);
      return new Response(
        JSON.stringify({ error: `Razorpay Error: ${rzpError.message || JSON.stringify(rzpError)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

  } catch (error: any) {
    console.error("General Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
