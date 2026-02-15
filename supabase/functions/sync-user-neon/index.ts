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
    const { userId, instagramHandle, email, fullName } = await req.json()

    if (!userId || !email) {
      throw new Error("Missing required fields: userId, email");
    }

    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      console.warn("NEON_DB_URL not set");
      return new Response(JSON.stringify({ message: "Neon DB not configured" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Syncing user to Neon: ${email}`);
    const neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // Upsert User (On login, we mostly want to ensure they exist)
    // If they are new, status 'Pending', package likely NULL or 'Free' (if not specified)
    // If they exist, we do NOTHING or Update login time?
    // Let's just ensure they exist.

    // Using ON CONFLICT (email) DO NOTHING because we don't want to overwrite 
    // existing payment status or package if they are just logging in.
    // UNLESS we want to capture their latest instagram handle if it changed?
    // Let's DO NOTHING for now to be safe, or just update username.

    await neonClient.queryObject`
      INSERT INTO users (
        id,
        username, 
        email, 
        status,
        deleted,
        last_active
      ) VALUES (
        ${userId},
        ${instagramHandle || fullName || email.split('@')[0]}, 
        ${email}, 
        'Pending',
        FALSE,
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, users.username),
        deleted = FALSE,
        last_active = NOW();
    `;

    // Also Insert into Onboardings if not exists?
    // The user schema has onboardings table too.
    // Let's stick to 'users' table as requested for "values of the users who logged in".

    await neonClient.end();
    console.log("Neon DB Sync Successful");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
