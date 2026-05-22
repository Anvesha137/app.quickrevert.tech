import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

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
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      throw new Error("NEON_DB_URL not configured");
    }

    neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // Fetch active users with 'sales' or 'admin' role
    const { rows } = await neonClient.queryObject(`
      SELECT id, email, role 
      FROM admin_users 
      WHERE is_active = true 
      AND role IN ('sales', 'admin')
      ORDER BY email ASC
    `);

    // Extract names from emails (e.g., 'john@quickrevert.tech' -> 'John')
    const salesTeam = rows.map((user: any) => {
        const namePart = user.email.split('@')[0];
        const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        return {
            id: user.id,
            name: formattedName,
            email: user.email,
            role: user.role
        };
    });

    await neonClient.end();
    neonClient = null;

    return new Response(
      JSON.stringify(salesTeam),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err as Error;
    console.error("[get-sales-team] ❌ Error:", error.message);
    if (neonClient) {
      try { await neonClient.end(); } catch (_) { }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
