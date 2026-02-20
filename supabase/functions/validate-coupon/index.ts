import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // planType is 'annual' or 'quarterly' (from frontend billingCycle)
        const { couponCode, planType } = await req.json();

        if (!couponCode || !couponCode.trim()) {
            return new Response(
                JSON.stringify({ valid: false, message: 'Please enter a coupon code.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const neonDbUrl = Deno.env.get('NEON_DB_URL');
        if (!neonDbUrl) {
            return new Response(
                JSON.stringify({ valid: false, message: 'Server configuration error.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
        }

        const client = new Client(neonDbUrl);
        await client.connect();

        try {
            const result = await client.queryObject(`
                SELECT id, promo_code, discount_percentage, max_usage,
                       total_usage_tilldate, expiry_date, package
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

            // Check expiry
            const now = new Date();
            const expiresAt = new Date(coupon.expiry_date);
            if (expiresAt < now) {
                return new Response(
                    JSON.stringify({ valid: false, message: 'This coupon has expired.' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Check usage limit
            if (coupon.total_usage_tilldate >= coupon.max_usage) {
                return new Response(
                    JSON.stringify({ valid: false, message: 'This coupon has reached its usage limit.' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ── Plan-specific restriction ─────────────────────────────────────
            // The `package` column stores: 'Premium', 'Premium Quarterly', 'Premium Annual'
            // - 'Premium'           → valid for ALL plans (no plan restriction)
            // - 'Premium Quarterly' → ONLY valid for quarterly billing
            // - 'Premium Annual'    → ONLY valid for annual billing
            //
            // Frontend sends planType as 'quarterly' or 'annual'
            if (coupon.package) {
                const pkgLower = coupon.package.toLowerCase().trim();
                const selectedPlan = (planType || '').toLowerCase().trim(); // 'quarterly' or 'annual'

                const isQuarterlyOnly = pkgLower.includes('quarterly');
                const isAnnualOnly = pkgLower.includes('annual');

                if (isQuarterlyOnly && selectedPlan !== 'quarterly') {
                    return new Response(
                        JSON.stringify({ valid: false, message: 'Invalid or expired coupon code.' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                if (isAnnualOnly && selectedPlan !== 'annual') {
                    return new Response(
                        JSON.stringify({ valid: false, message: 'Invalid or expired coupon code.' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }
            // ─────────────────────────────────────────────────────────────────

            // Calculate base amount in rupees
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
                        ? '🎉 100% OFF applied! You get it for free!'
                        : `✅ Coupon applied! ${discountPct}% off — ₹${discountRs} saved`,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );

        } finally {
            await client.end();
        }

    } catch (error: any) {
        console.error('validate-coupon error:', error);
        return new Response(
            JSON.stringify({ valid: false, message: 'Could not validate coupon. Please try again.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
