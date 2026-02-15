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

      // Add 'expiry_date' column
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE;
      `);

      // Backfill Existing Data: Quarterly
      await client.queryArray(`
        UPDATE users
        SET expiry_date = joining_date + INTERVAL '3 months'
        WHERE package = 'Premium Quarterly' AND expiry_date IS NULL;
      `);

      // Backfill Existing Data: Annual
      await client.queryArray(`
        UPDATE users
        SET expiry_date = joining_date + INTERVAL '1 year'
        WHERE package = 'Premium Annual' AND expiry_date IS NULL;
      `);

      // Adjust Legacy Data to IST (Shift +5.5 hours)
      // Only for records created before we computed IST (cutoff safe margin: 18:00 DB time)
      // Real UTC is ~14:45, New IST is ~20:15. So 18:00 is a safe separator.
      await client.queryArray(`
        UPDATE users
        SET joining_date = joining_date + INTERVAL '5 hours 30 minutes',
            expiry_date = expiry_date + INTERVAL '5 hours 30 minutes'
        WHERE joining_date < '2026-02-15 18:00:00';
      `);

      // Add 'subscription_start_date' column
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE;
      `);

      // Backfill subscription_start_date based on expiry_date
      await client.queryArray(`
        UPDATE users
        SET subscription_start_date = expiry_date - INTERVAL '3 months'
        WHERE package = 'Premium Quarterly' AND subscription_start_date IS NULL AND expiry_date IS NOT NULL;
      `);

      await client.queryArray(`
        UPDATE users
        SET subscription_start_date = expiry_date - INTERVAL '1 year'
        WHERE package = 'Premium Annual' AND subscription_start_date IS NULL AND expiry_date IS NOT NULL;
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
