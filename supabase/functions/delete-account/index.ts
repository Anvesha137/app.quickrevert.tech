import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const neonDbUrl = Deno.env.get('NEON_DB_URL');

  // Helper to return error information inside a 200 response to ensure frontend can read the body
  const returnError = (msg: string, details: any = null, status = 200) => {
    return new Response(
      JSON.stringify({ success: false, error: msg, details }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
    );
  };

  try {
    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return returnError('Missing Authorization header');
    }

    if (!supabaseUrl || !anonKey) {
      return returnError('Internal configuration error: Missing platform keys (SUPABASE_URL/ANON_KEY)');
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return returnError('Unauthorized: User not found or session expired', authError);
    }

    const userId = user.id;
    const userEmail = user.email;
    console.log(`Authenticated request for user: ${userId} (${userEmail})`);

    // 2. Update Neon DB (Soft Delete) - Non-fatal
    if (!neonDbUrl) {
      console.warn("NEON_DB_URL is missing. Skipping external database update.");
    } else {
      const pgClient = new Client(neonDbUrl);
      try {
        await pgClient.connect();
        await pgClient.queryArray(`
          UPDATE users 
          SET deleted = TRUE, 
              status = 'inactive',
              last_active = NOW() + INTERVAL '5 hours 30 minutes' 
          WHERE id = $1 OR email = $2
        `, [userId, userEmail || 'no-email-provided']);
        console.log("Neon DB soft delete completed.");
      } catch (neonError: any) {
        console.error('Neon DB Update Error (Non-Fatal):', neonError.message);
        // We continue, but we can log this for debugging
      } finally {
        try {
          await pgClient.end();
        } catch (e) { }
      }
    }

    // 3. Delete from Supabase Auth (Hard Delete) - FATAL
    if (!serviceRoleKey) {
      return returnError('Server Misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing on the server.');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      return returnError('Supabase Auth purge failed', deleteError);
    }

    console.log(`Account ${userId} successfully purged from Supabase.`);

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("Global Catch-All Error:", error.message);
    return returnError('A critical server error occurred during deletion', error.message);
  }
});
