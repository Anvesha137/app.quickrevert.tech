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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
    
    // Verify authentication matches exactly the working create-razorpay-order function
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication token provided" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseSecretKey || supabaseAnonKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);

    if (authError || !user) {
      console.error('Auth Error:', authError?.message || 'User not found');
      return new Response(
        JSON.stringify({ error: "Authentication failed: " + (authError?.message || "User not found") }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { couponCode, planType } = await req.json()

    // 1. Rate Limiting (using standardized created_at)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: attemptCount } = await supabaseClient
        .from('automation_activities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('activity_type', 'coupon_check')
        .gte('created_at', oneMinuteAgo);

    if ((attemptCount || 0) > 10) {
        return new Response(
            JSON.stringify({ valid: false, message: 'Too many attempts. Please try again later.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
    }

    // Log the activity
    await supabaseClient.from('automation_activities').insert({
        user_id: user.id,
        automation_id: '00000000-0000-0000-0000-000000000000',
        activity_type: 'coupon_check',
        status: 'success',
        message: `Validated coupon: ${couponCode}`,
        metadata: { coupon: couponCode, plan: planType }
    });

    if (!couponCode || !couponCode.trim()) {
        return new Response(
            JSON.stringify({ valid: false, message: 'Please enter a coupon code.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // 2. Neon DB Validation
    const neonDbUrl = Deno.env.get('NEON_DB_URL') ?? '';
    const neonClient = new Client(neonDbUrl);
    
    try {
      await neonClient.connect();
      const result = await neonClient.queryObject(`
        SELECT id, promo_code, discount_percentage, max_usage,
               total_usage_tilldate, expiry_date, pack_type
        FROM promo_codes
        WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
        LIMIT 1
      `, [couponCode.trim()]);

      if (result.rows.length === 0) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Invalid coupon code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const coupon = result.rows[0] as any;

      // Check expiry
      if (new Date(coupon.expiry_date) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon has expired' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check usage limit
      if (coupon.total_usage_tilldate >= coupon.max_usage) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon usage limit reached' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check plan restriction
      if (coupon.pack_type) {
        const pkgLower = coupon.pack_type.toLowerCase().trim();
        const selectedPlan = (planType || '').toLowerCase().trim();
        const isQuarterlyOnly = pkgLower.includes('quarterly') || pkgLower.includes('quaterly');
        const isAnnualOnly = pkgLower.includes('annual') || pkgLower.includes('anually');

        if (isQuarterlyOnly && selectedPlan !== 'quarterly') {
            return new Response(
                JSON.stringify({ valid: false, message: 'Coupon only valid for Quarterly Plan' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
        if (isAnnualOnly && selectedPlan !== 'annual') {
            return new Response(
                JSON.stringify({ valid: false, message: 'Coupon only valid for Annual Plan' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
      }

      // Calculations
      const baseAmountRs = (planType === 'annual') ? (599 * 12) : (899 * 3);
      const discountPct = coupon.discount_percentage || 0;
      const discountRs = Math.floor(baseAmountRs * (discountPct / 100));
      const finalAmountRs = Math.max(0, baseAmountRs - discountRs);
      const isFree = finalAmountRs === 0;

      return new Response(
        JSON.stringify({
          valid: true,
          couponId: coupon.id,
          discountPercentage: discountPct,
          discountAmount: discountRs,
          finalAmount: finalAmountRs,
          isFree,
          message: isFree 
            ? '🎉 100% OFF! You get it for free!' 
            : `✅ Coupon applied! ${discountPct}% off`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } finally {
      await neonClient.end();
    }

  } catch (error) {
    console.error('Validate coupon error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
