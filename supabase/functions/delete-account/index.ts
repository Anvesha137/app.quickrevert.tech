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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const neonDbUrl = Deno.env.get('NEON_DB_URL');

  try {
    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth Error:", authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = user.id;
    console.log(`Starting account deletion for user: ${userId} (${user.email})`);

    // 2. Update Neon DB (Soft Delete)
    if (!neonDbUrl) {
      console.error("Missing NEON_DB_URL environment variable");
      // Continue anyway, as Supabase deletion is more critical to stop billing/access
    } else {
      const pgClient = new Client(neonDbUrl);
      try {
        await pgClient.connect();
        // Use BOTH ID and Email to ensure we catch them in Neon
        const result = await pgClient.queryArray(`
          UPDATE users 
          SET deleted = TRUE, 
              status = 'inactive',
              last_active = NOW() + INTERVAL '5 hours 30 minutes' 
          WHERE id = $1 OR email = $2
        `, [userId, user.email]);

        console.log(`Soft deleted user in Neon DB. Rows affected: ${result.rowCount}`);
      } catch (neonError) {
        console.error('Neon DB Update Error (Non-Fatal):', neonError);
        // We continue even if Neon fails to ensure the Supabase account (source of truth) is removed
      } finally {
        try {
          await pgClient.end();
        } catch (e) {
          console.error("Error closing Neon connection:", e);
        }
      }
    }

    // 3. Delete from Supabase (Hard Delete) using Admin Client
    if (!serviceRoleKey) {
      throw new Error("Server Misconfiguration: Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Supabase Admin Deletion Error:", deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user from Supabase', details: deleteError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Successfully deleted user ${userId} from Supabase Auth`);

    return new Response(
      JSON.stringify({ message: 'Account deleted successfully', success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("Global Delete Account Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown server error",
        success: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
