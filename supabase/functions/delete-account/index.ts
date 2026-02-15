import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const userId = user.id;

    // 2. Update Neon DB (Soft Delete)
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (!neonDbUrl) {
      throw new Error('NEON_DB_URL is not set');
    }

    const pgClient = new Client(neonDbUrl);
    await pgClient.connect();

    try {
      // Assuming 'email' is the key based on previous sync logic, but usually IDs are better.
      // However, sync-user-neon used email. Let's try to update by email if possible, or we need to know the Neon ID.
      // Since we synced ID as well, we should use ID if that column exists in Neon, but sync-user-neon inserted 'id' as well.
      // Let's check sync-user-neon logic: 
      //    INSERT INTO users (id, email, ...) VALUES ('${id}', ...)
      // So we can use ID.

      await pgClient.queryArray(`
        UPDATE users 
        SET deleted = TRUE, last_active = NOW() + INTERVAL '5 hours 30 minutes' 
        WHERE id = $1
      `, [userId]);

      console.log(`Soft deleted user ${userId} in Neon DB`);

    } catch (neonError) {
      console.error('Neon DB Update Error:', neonError);
      // We might want to continue even if Neon fails, or abort. 
      // Let's log but continue to ensure Supabase account is deleted.
    } finally {
      await pgClient.end();
    }

    // 3. Delete from Supabase (Hard Delete) using Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ message: 'Account deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
