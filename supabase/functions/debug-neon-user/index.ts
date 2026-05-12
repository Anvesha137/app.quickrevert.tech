import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email } = await req.json();
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) throw new Error("NEON_DB_URL not set");

    const client = new Client(neonDbUrl);
    await client.connect();

    const results: any = {};

    const userRes = await client.queryObject(`SELECT * FROM users WHERE email = $1`, [email]);
    results.user = userRes.rows;

    if (userRes.rows.length > 0) {
        const userId = (userRes.rows[0] as any).id;
        const subRes = await client.queryObject(`SELECT * FROM subscriptions WHERE user_id = $1`, [userId]);
        results.subscriptions = subRes.rows;

        const payRes = await client.queryObject(`SELECT * FROM payments WHERE user_id = $1`, [userId]);
        results.payments = payRes.rows;
    }

    const plansRes = await client.queryObject(`SELECT * FROM plans`);
    results.plans = plansRes.rows;

    await client.end();

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
