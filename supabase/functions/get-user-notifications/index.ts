import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let neonClient: Client | null = null;
  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const userEmail = user.email?.trim().toLowerCase();
    
    neonClient = new Client(Deno.env.get('NEON_DB_URL'));
    await neonClient.connect();

    // GET ALL ACTIVE NOTIFICATIONS
    // We filter by:
    // 1. Exact email match (case-insensitive)
    // 2. OR Global (both email and id are null)
    // 3. OR the user's ID matches (fallback)
    const { rows } = await neonClient.queryObject(`
        SELECT id, title, message, type, is_dismissible
        FROM user_notifications
        WHERE (
            LOWER(TRIM(user_email)) = $1 
            OR (user_email IS NULL AND user_id IS NULL)
            OR user_id::text = $2
        )
        AND (start_at <= NOW() + INTERVAL '1 hour' OR user_email IS NOT NULL)
        AND (end_at >= NOW() OR end_at IS NULL)
        ORDER BY created_at DESC
    `, [userEmail, user.id]);

    // DIAGNOSTIC: If 0 found, let's see what's in the DB briefly
    if (rows.length === 0) {
        const { rows: samples } = await neonClient.queryObject(`
            SELECT user_email, user_id FROM user_notifications LIMIT 3
        `);
        console.log(`[DEBUG] No match for ${userEmail}. DB Samples:`, JSON.stringify(samples));
    }

    await neonClient.end();
    return new Response(JSON.stringify(rows), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error("[ERROR]:", err.message);
    if (neonClient) try { await neonClient.end(); } catch (_) {}
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
    });
  }
})
