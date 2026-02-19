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

  console.log("Delete Account Function Triggered");

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const neonDbUrl = Deno.env.get('NEON_DB_URL');

    // 2. Validate Request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("No Authorization header");
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header missing' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Initialize User Client
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth verification failed:", authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication failed', details: authError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Verified user ${userId}. Proceeding with deletion...`);

    // 4. Update Neon DB (Soft Delete) - Wrapped in isolated try/catch
    if (neonDbUrl) {
      try {
        const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
        const pgClient = new Client(neonDbUrl);
        await pgClient.connect();
        await pgClient.queryArray(`
          UPDATE users 
          SET deleted = TRUE, status = 'inactive' 
          WHERE id = $1 OR email = $2
        `, [userId, user.email]);
        await pgClient.end();
        console.log("Neon DB soft-delete successful.");
      } catch (neonErr: any) {
        console.warn("Neon DB update failed (skipping):", neonErr.message);
      }
    }

    // 5. Hard Delete from Supabase Auth - The Critical Step
    if (!serviceRoleKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ success: false, error: 'Server secret missing (SERVICE_ROLE_KEY)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Supabase Admin delete error:", deleteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase deletion failed', details: deleteError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("User successfully deleted.");
    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error("Top-level function crash:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: 'Critical function error: ' + err.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
