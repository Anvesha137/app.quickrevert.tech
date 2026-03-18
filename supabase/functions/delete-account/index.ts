import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log("Delete Account Process Started");

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const neonDbUrl = Deno.env.get('NEON_DB_URL');

    // 2. Validate Authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Authenticate User
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Session expired. Please log in again.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Verified user ${userId}. Proceeding with clean-up...`);

    // 4. Update Neon DB (Soft Delete) - Isolated & Non-Fatal
    if (neonDbUrl) {
      try {
        const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
        const client = new Client(neonDbUrl);
        await client.connect();
        await client.queryArray(
          "UPDATE users SET deleted = TRUE, status = 'inactive' WHERE id = $1 OR email = $2",
          [userId, user.email]
        );
        await client.end();
        console.log("Neon DB sync successful.");
      } catch (neonErr: any) {
        console.warn("Neon DB failure (ignoring):", neonErr.message);
      }
    }

    // 5. Purge from Supabase Auth - Fatal Step
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server Misconfiguration: Admin key missing.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Supabase Admin error:", deleteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to purge account data', details: deleteError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("User successfully purged.");
    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error("Critical Function Failure:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Critical failure: ' + err.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
