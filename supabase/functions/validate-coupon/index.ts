import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ⚠️  RATE LIMIT LIMITATION: The Map below is in-memory and resets on every cold
// start (Supabase Edge Functions are ephemeral). This is acceptable for the current
// user scale (~30 users). For production hardening, replace with a Neon-backed
// approach using:
//   CREATE TABLE coupon_rate_limits (
//     ip TEXT, window_start TIMESTAMPTZ,
//     request_count INT DEFAULT 1,
//     PRIMARY KEY (ip, window_start)
//   );
//   INSERT INTO coupon_rate_limits (ip, window_start, request_count)
//   VALUES ($1, date_trunc('minute', NOW()), 1)
//   ON CONFLICT (ip, window_start)
//   DO UPDATE SET request_count = coupon_rate_limits.request_count + 1
//   RETURNING request_count;
// Then reject if returned request_count > 5.
const rateLimitMap = new Map<string, { count: number, lastReset: number }>();

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2. Simple Rate Limiting (per IP)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const now = Date.now();
  const limitWindow = 60 * 1000; // 1 minute
  const maxRequests = 5;

  const usage = rateLimitMap.get(clientIp) || { count: 0, lastReset: now };
  if (now - usage.lastReset > limitWindow) {
    usage.count = 1;
    usage.lastReset = now;
  } else {
    usage.count++;
  }
  rateLimitMap.set(clientIp, usage);

  if (usage.count > maxRequests) {
    return new Response(
      JSON.stringify({ valid: false, message: 'Too many attempts. Please wait 1 minute.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
        SELECT id, promo_code, discount_percentage, discount_amount, discount_type, package, 
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
      const amt = coupon.discount_amount || 0;
      const type = coupon.discount_type || 'percentage';
      
      let discountVal = 0;
      if (type === 'flat') {
        discountVal = amt;
      } else if (pct > 0) {
        discountVal = Math.floor(baseAmount * (pct / 100));
      }

      const finalAmount = Math.max(0, baseAmount - discountVal);
      const isFree = finalAmount === 0;
      const label = type === 'flat' ? `₹${amt} OFF` : `${pct}% OFF`;

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
