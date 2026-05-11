import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) throw new Error('NEON_DB_URL is not set');

    const secret = req.headers.get("x-quickrevert-secret");
    if (secret !== Deno.env.get("QUICKREVERT_INTERNAL_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new Client(neonDbUrl);
    await client.connect();

    // Query column names for gifted_premium
    let rows = [];
    try {
      const res = await client.queryObject(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'gifted_premium'
      `);
      rows = res.rows;
    } catch (e: any) {
      console.error("Failed to query gifted_premium:", e.message);
    }

    await client.end();

    // List all env var names (keys)
    const envVars = [];
    for (const [key, _] of Deno.env.toObject()) {
      envVars.push(key);
    }

    return new Response(
      JSON.stringify({ 
        columns: rows,
        envVars: envVars
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
