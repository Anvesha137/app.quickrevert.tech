import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) throw new Error("NEON_DB_URL missing");

    const secret = req.headers.get("x-quickrevert-secret");
    if (secret !== Deno.env.get("QUICKREVERT_INTERNAL_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new Client(neonDbUrl);
    await client.connect();

    const cleanEmail = email.trim().toLowerCase();
    
    // 1. Check users table
    const { rows: userRows } = await client.queryObject(
      `SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1`,
      [cleanEmail]
    );

    // 2. Check gifted_premium table
    const { rows: giftedRows } = await client.queryObject(`SELECT * FROM gifted_premium`);
    
    // 3. Check specific join
    const { rows: joinRows } = await client.queryObject(
      `SELECT u.email, gp.user_id as gp_uid, u.id as u_id
       FROM gifted_premium gp
       JOIN users u ON u.id = gp.user_id
       WHERE LOWER(u.email) = $1`,
      [cleanEmail]
    );

    await client.end();

    return new Response(
      JSON.stringify({ 
        email: cleanEmail,
        userRecords: userRows,
        giftedPremiumSample: giftedRows.slice(0, 5),
        joinResult: joinRows
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
