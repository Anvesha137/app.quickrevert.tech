import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

  let neonClient: Client | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user || !user.email) {
      throw new Error('Unauthorized or email missing');
    }

    const userEmail = user.email;

    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      throw new Error("NEON_DB_URL not configured");
    }

    neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // 1. Fetch promo codes assigned to this user
    const { rows: promoCodes } = await neonClient.queryObject(`
      SELECT promo_code, discount_percentage, discount_amount, discount_type, package, expiry_date
      FROM promo_codes 
      WHERE assigned_to_customer = $1
    `, [userEmail]);

    if (promoCodes.length === 0) {
      await neonClient.end();
      return new Response(
        JSON.stringify({ promoCodes: [], usages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract promo code strings
    const codes = promoCodes.map((pc: any) => pc.promo_code);

    // 2. Fetch usages from payments table and join with users to get email
    const { rows: usages } = await neonClient.queryObject(`
      SELECT p.promo_code, u.email as user_email, p.paid_at, u.plan_name as package_name
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.promo_code = ANY($1) 
      AND p.payment_status IN ('paid', 'free')
      ORDER BY p.paid_at DESC
    `, [codes]);

    await neonClient.end();
    neonClient = null;

    return new Response(
      JSON.stringify({ promoCodes, usages }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err as Error;
    console.error("[get-referral-stats] ❌ Error:", error.message);
    if (neonClient) {
      try { await neonClient.end(); } catch (_) { }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
