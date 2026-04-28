import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { couponCode, planType, planTier } = await req.json();

    // 2. Validate Environment
    const neonDbUrl = Deno.env.get('NEON_DB_URL') || '';
    if (!neonDbUrl) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Payment gateway configuration missing.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const neonClient = new Client(neonDbUrl);
    
    try {
      await neonClient.connect();

      // 3. Simple, Hardcoded Column Query
      const result = await neonClient.queryObject(`
        SELECT id, promo_code, discount_percentage, package, 
               max_usage, total_usage_tilldate, expiry_date
        FROM promo_codes 
        WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
        LIMIT 1
      `, [couponCode.trim()]);

      if (result.rows.length === 0) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Invalid coupon code.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const coupon = result.rows[0] as any;
      const now = new Date();
      const expiresAt = new Date(coupon.expiry_date);
      const usageCount = coupon.total_usage_tilldate ?? 0;
      const usageLimit = coupon.max_usage ?? 999;

      // 4. Verification Logic
      if ((expiresAt < now) || (usageCount >= usageLimit)) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon has expired or reached its usage limit.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 5. Tier & Cycle Restrictions
      const packType = (coupon.package || '').toLowerCase();
      const selectedPlan = (planType || '').toLowerCase();
      const selectedTier = (planTier || '').toLowerCase();

      if (packType) {
        // Cycle Check
        if ((packType.includes('quarter') && selectedPlan !== 'quarterly') || (packType.includes('annual') && selectedPlan !== 'annual')) {
           return new Response(
            JSON.stringify({ valid: false, message: `Only valid for ${packType.includes('quarter') ? 'Quarterly' : 'Annual'} Plan.` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Tier Check
        const tiers = ['try_me_out', 'premium', 'professional', 'enterprise', 'starter'];
        const restrictedTo = tiers.find(t => 
          packType.includes(t) || 
          packType.includes(t.replace(/_/g, ' '))
        );

        if (restrictedTo && selectedTier !== restrictedTo && !(restrictedTo === 'starter' && selectedTier === 'try_me_out')) {
           return new Response(
            JSON.stringify({ valid: false, message: `Only valid for ${restrictedTo.toUpperCase().replace(/_/g, ' ')} tier.` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 6. Final Calculations
      let baseAmount = 0;
      if (selectedTier === 'try_me_out') {
        baseAmount = 199;
      } else if (selectedTier === 'premium') {
        baseAmount = selectedPlan === 'annual' ? 4199 : 1199;
      } else if (selectedTier === 'professional') {
        baseAmount = selectedPlan === 'annual' ? 5999 : 1799;
      } else {
        baseAmount = (selectedPlan === 'annual') ? (599 * 12) : (899 * 3);
      }

      const pct = coupon.discount_percentage || 0;
      const amt = coupon.discount_amount || 0; // Keeping as fallback if added later
      
      let discountVal = 0;
      if (pct > 0) {
        discountVal = Math.floor(baseAmount * (pct / 100));
      } else if (amt > 0) {
        discountVal = amt;
      }

      const finalAmount = Math.max(0, baseAmount - discountVal);
      const isFree = finalAmount === 0;
      const label = pct > 0 ? `${pct}% OFF` : `₹${amt} OFF`;

      return new Response(
        JSON.stringify({
          valid: true,
          couponId: coupon.id,
          discountPercentage: pct,
          discountAmount: discountVal,
          finalAmount: finalAmount,
          isFree,
          message: isFree ? '🎉 100% OFF!' : `✅ Applied: ${label}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      await neonClient.end();
    }

  } catch (error: any) {
    console.error('[CRITICAL] validate-coupon error:', error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        message: 'Server error: ' + (error.message || 'Unknown error'),
        debug: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})
