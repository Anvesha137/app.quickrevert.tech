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
          .in('status', ['active', 'trialing', 'past_due'])
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
    if (couponCode && couponCode.trim()) {
      const code = couponCode.trim();
      console.log(`[COUPON] Validating: ${code} for user ${user.id}`);
      
      const neonDbUrl = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl) {
        const client = new Client(neonDbUrl);
        try {
          await client.connect();

          const result = await client.queryObject(`
            SELECT id, promo_code, discount_percentage,
                   max_usage, total_usage_tilldate, expiry_date, package
            FROM promo_codes
            WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
            LIMIT 1
          `, [code]);

          if (result.rows.length > 0) {
            const coupon = result.rows[0] as any;
            const now = new Date();
            const expiresAt = new Date(coupon.expiry_date);
            const usageCount = coupon.total_usage_tilldate ?? 0;
            const usageLimit = coupon.max_usage ?? 999;

            if (expiresAt < now) {
               return new Response(
                JSON.stringify({ error: `Coupon '${code}' has expired.` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }

            if (usageCount >= usageLimit) {
               return new Response(
                JSON.stringify({ error: `Coupon '${code}' has reached its usage limit.` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }

            const packType = (coupon.package || '').toLowerCase();
            if (packType) {
              const plan = (planType || '').toLowerCase();
              const tier = (planTier || '').toLowerCase();

              // 1. Check Cycle (Annual/Quarterly)
              if ((packType.includes('quarter') && plan !== 'quarterly') || (packType.includes('annual') && plan !== 'annual')) {
                return new Response(
                  JSON.stringify({ error: `Coupon is only valid for ${packType.includes('quarter') ? 'Quarterly' : 'Annual'} plans.` }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                );
              }

              // 2. Check Tier (Professional/Premium etc)
              const possibleTiers = ['try_me_out', 'premium', 'professional', 'enterprise', 'starter'];
              const restrictedRestricted = possibleTiers.find(t => 
                packType.includes(t) || 
                packType.includes(t.replace(/_/g, ' '))
              );

              if (restrictedRestricted && tier !== restrictedRestricted && !(restrictedRestricted === 'starter' && tier === 'try_me_out')) {
                return new Response(
                  JSON.stringify({ error: `Coupon is only valid for the ${restrictedRestricted.toUpperCase().replace(/_/g, ' ')} tier.` }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                );
              }
            }

            const discountPct = coupon.discount_percentage || 0;
            
            // Calculate in RUPEES first to match frontend rounding (floor)
            const baseRupees = amount / 100;
            let discountRupees = 0;
            
            if (discountPct > 0) {
              discountRupees = Math.floor(baseRupees * (discountPct / 100));
            }

            const finalRupees = Math.max(0, baseRupees - discountRupees);
            
            if (finalRupees <= 0) {
              console.log(`[COUPON] ${code}: 100% OFF realized.`);
              return new Response(
                JSON.stringify({ free: true, amount: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }

            amount = Math.max(100, finalRupees * 100); // Back to paise, min ₹1
            console.log(`[COUPON] ${code} Applied. Discount: ₹${discountRupees}. Final Amount: ₹${finalRupees} (${amount} paise)`);
          } else {
            console.warn(`[COUPON] Not found: ${code}`);
            return new Response(
              JSON.stringify({ error: `Invalid coupon code: '${code}'` }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
          }
        } catch (neonError: any) {
          console.error("[COUPON] DB Error:", neonError);
          return new Response(
            JSON.stringify({ error: "Coupon validation failed due to a database error. Please try again or remove the coupon." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        } finally {
          await client.end();
        }
      } else {
         console.error("[COUPON] NEON_DB_URL missing");
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
