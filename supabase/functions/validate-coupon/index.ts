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
    const { couponCode, planType } = await req.json()

    // Connect to Neon DB
    const neonDbUrl = Deno.env.get('NEON_DB_URL') ?? '';
    if (!neonDbUrl) {
      return new Response(
        JSON.stringify({ valid: false, message: 'NEON_DB_URL not configured', debug: 'NO_NEON_URL' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const neonClient = new Client(neonDbUrl);
    
    try {
      await neonClient.connect();

      // STEP 1: Get the actual column names from the table
      const schemaResult = await neonClient.queryObject(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'promo_codes'
        ORDER BY ordinal_position
      `);
      const columns = schemaResult.rows.map((r: any) => r.column_name);
      console.log('[DEBUG] promo_codes columns:', JSON.stringify(columns));

      // STEP 2: Get ALL rows to see what data exists
      const allRows = await neonClient.queryObject(`SELECT * FROM promo_codes LIMIT 10`);
      console.log('[DEBUG] promo_codes data:', JSON.stringify(allRows.rows));

      // STEP 3: Try to find the coupon using whatever column names exist
      let coupon = null;
      let matchColumn = '';

      // Try 'code' column first
      if (columns.includes('code')) {
        const r = await neonClient.queryObject(
          `SELECT * FROM promo_codes WHERE LOWER(TRIM(code)) = LOWER(TRIM($1)) LIMIT 1`,
          [couponCode.trim()]
        );
        if (r.rows.length > 0) {
          coupon = r.rows[0] as any;
          matchColumn = 'code';
        }
      }

      // Try 'promo_code' column
      if (!coupon && columns.includes('promo_code')) {
        const r = await neonClient.queryObject(
          `SELECT * FROM promo_codes WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1)) LIMIT 1`,
          [couponCode.trim()]
        );
        if (r.rows.length > 0) {
          coupon = r.rows[0] as any;
          matchColumn = 'promo_code';
        }
      }

      if (!coupon) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            message: 'Invalid coupon code',
            debug: {
              columns,
              searchedFor: couponCode.trim(),
              totalRowsInTable: allRows.rows.length,
              sampleData: allRows.rows.slice(0, 3)
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Found the coupon - figure out correct field names dynamically
      const expiryField = coupon.expires_at || coupon.expiry_date;
      const usageCount = coupon.used_count ?? coupon.total_usage_tilldate ?? 0;
      const usageLimit = coupon.usage_limit ?? coupon.max_usage ?? 999;
      const discountPct = coupon.discount_percentage || 0;
      const packType = coupon.pack_type || coupon.package || null;
      const couponStatus = coupon.status || 'active';

      // Check status
      if (couponStatus !== 'active') {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon is no longer active' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check expiry
      if (expiryField && new Date(expiryField) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon has expired' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check usage limit
      if (usageCount >= usageLimit) {
        return new Response(
          JSON.stringify({ valid: false, message: 'Coupon usage limit reached' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Plan restriction
      if (packType) {
        const pkg = packType.toLowerCase();
        const plan = (planType || '').toLowerCase();
        if (pkg.includes('quarter') && plan !== 'quarterly') {
          return new Response(
            JSON.stringify({ valid: false, message: 'Coupon only valid for Quarterly Plan' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (pkg.includes('annual') && plan !== 'annual') {
          return new Response(
            JSON.stringify({ valid: false, message: 'Coupon only valid for Annual Plan' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Calculations
      const baseAmountRs = (planType === 'annual') ? (599 * 12) : (899 * 3);
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
            : `✅ Coupon applied! ${discountPct}% off`,
          debug: { matchColumn, columns }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } finally {
      await neonClient.end();
    }

  } catch (error) {
    console.error('Validate coupon error:', error);
    return new Response(
      JSON.stringify({ valid: false, message: 'Server error: ' + error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
