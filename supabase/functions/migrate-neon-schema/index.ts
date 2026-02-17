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

      // Add 'amount_paid' and 'discount_amount' columns
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;
      `);

      // Add 'package' and 'billing_cycle' columns
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS package TEXT,
        ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
      `);

      // Add 'status' and 'payment_status' columns
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS payment_status TEXT;
      `);

      // Add 'subscription_end' and 'subscription_start' columns
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP WITH TIME ZONE;
      `);

      // Add 'instagram_handle' and 'automations_count' columns
      await client.queryArray(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
        ADD COLUMN IF NOT EXISTS connected_instagram_handle TEXT,
        ADD COLUMN IF NOT EXISTS automations_count INTEGER DEFAULT 0;
      `);

      // Seed last_active from joining_date if it's NULL (initial setup)
      await client.queryArray(`
        UPDATE users
        SET last_active = joining_date
        WHERE last_active IS NULL AND joining_date IS NOT NULL;
      `);

      // Update 'status' column to be activity-based (active/inactive)
      // Active if last_active is within the last 1 month, else inactive
      await client.queryArray(`
        UPDATE users
        SET status = 'active'
        WHERE last_active >= NOW() - INTERVAL '30 days';
      `);

      await client.queryArray(`
        UPDATE users
        SET status = 'inactive'
        WHERE last_active < NOW() - INTERVAL '30 days' OR last_active IS NULL;
      `);

      // Sync amt_paid to amount_paid for consistency if needed
      await client.queryArray(`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='amt_paid') THEN
            UPDATE users SET amount_paid = amt_paid::integer WHERE amount_paid = 0 AND amt_paid > 0;
          END IF;
        END $$;
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
