import { createClient } from "npm:@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
    // 1. Handle CORS Preflight (PERMISSIVE)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Get Auth Header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing Auth Header" }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '1' }, status: 401 }
            );
        }

        const token = authHeader.replace('Bearer ', '');

        // Use the SERVICE KEY to verify the token for maximum authority
        // If this fails, we log exactly why.
        const supabase = createClient(url, serviceKey);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error('[AUTH ERROR]:', authError?.message || 'Token invalid');
            return new Response(
                JSON.stringify({ error: "Unauthorized access", detail: authError?.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '2' }, status: 401 }
            );
        }

        // 2. Parse Body
        const { couponCode, planType } = await req.json();

        // 3. Rate Limiting (Using Service Key to bypass RLS on logs)
        const { count: attemptCount } = await supabase
            .from('automation_activities')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('activity_type', 'coupon_check')
            .gte('created_at', new Date(Date.now() - 60000).toISOString());

        if ((attemptCount || 0) > 10) {
             return new Response(
                JSON.stringify({ valid: false, message: 'Too many attempts.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '3' }, status: 429 }
            );
        }

        // 4. Validate Coupon in Neon
        const neonDbUrl = Deno.env.get('NEON_DB_URL')!;
        const client = new Client(neonDbUrl);
        try {
            await client.connect();
            const result = await client.queryObject(`
                SELECT id, promo_code, discount_percentage, max_usage,
                       total_usage_tilldate, expiry_date, pack_type
                FROM promo_codes
                WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
                LIMIT 1
            `, [couponCode.trim()]);

            if (result.rows.length === 0) {
                return new Response(
                    JSON.stringify({ valid: false, message: 'Invalid coupon code.' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '4' } }
                );
            }

            const coupon = result.rows[0] as any;
            const now = new Date();

            if (new Date(coupon.expiry_date) < now) {
                return new Response(JSON.stringify({ valid: false, message: 'Coupon expired.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (coupon.total_usage_tilldate >= coupon.max_usage) {
                 return new Response(JSON.stringify({ valid: false, message: 'Usage limit reached.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // Plan Type restriction
            if (coupon.pack_type) {
                const pkg = coupon.pack_type.toLowerCase();
                const plan = (planType || '').toLowerCase();
                const isQ = pkg.includes('quarter');
                const isA = pkg.includes('annual');

                if (isQ && plan !== 'quarterly') return new Response(JSON.stringify({ valid: false, message: 'Invalid for this plan.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                if (isA && plan !== 'annual') return new Response(JSON.stringify({ valid: false, message: 'Invalid for this plan.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            const base = (planType === 'annual') ? (599 * 12) : (899 * 3);
            const discount = Math.floor(base * ((coupon.discount_percentage || 0) / 100));
            const final = Math.max(0, base - discount);

            return new Response(
                JSON.stringify({
                    valid: true,
                    couponId: coupon.id,
                    discountPercentage: coupon.discount_percentage,
                    discountAmount: discount,
                    finalAmount: final,
                    isFree: final === 0,
                    message: '✅ Success',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '5' } }
            );

        } finally {
            await client.end();
        }

    } catch (e: any) {
        return new Response(
            JSON.stringify({ error: e.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Point': '6' }, status: 500 }
        );
    }
});
