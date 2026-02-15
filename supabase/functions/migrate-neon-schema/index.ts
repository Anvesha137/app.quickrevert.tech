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
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      throw new Error('NEON_DB_URL is not set');
    }

    const client = new Client(neonDbUrl);
    await client.connect();

    try {
      // Add 'deleted' column
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
      `);

      // Add 'last_active' column
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE;
      `);

      return new Response(
        JSON.stringify({ message: 'Migration successful: Columns added.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      await client.end();
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
