import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password) throw new Error('Email and password are required');

    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    
    // Try multiple names for the secret key based on user feedback
    const keyNames = ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SECRET_KEY'];
    let supabaseServiceRoleKey = null;
    let foundKeyName = null;

    for (const name of keyNames) {
      const val = Deno.env.get(name);
      if (val) {
        supabaseServiceRoleKey = val;
        foundKeyName = name;
        break;
      }
    }

    if (!neonDbUrl || !supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(`Config missing: NEON_DB_URL, SUPABASE_URL, or SECRET_KEY`);
    }

    const neonClient = new Client(neonDbUrl);
    await neonClient.connect();

    // 1. Exploratory Search and Match in Neon
    const cleanEmail = email.trim().toLowerCase();
    const typedPass = String(password).trim();
    
    let neonUserFound = false;
    let detailMsg = "Searching...";
    let matchedCol = null;
    let match = null;
    let emailSample = [];

    // Fetch all users for foolproof JS-side matching (handles encoding/whitespace issues)
    const { rows: allUsers } = await neonClient.queryObject(`SELECT * FROM users`);
    
    // Get ALL columns to see what's available for debug
    const { rows: userColsRows } = await neonClient.queryObject(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public'`
    );
    const availableUserCols = userColsRows.map((c: any) => c.column_name);

    match = allUsers.find((u: any) => {
      const dbEmail = String(u.email || '').trim().toLowerCase();
      const dbUser = String(u.username || '').trim().toLowerCase();
      return dbEmail === cleanEmail || dbUser === cleanEmail;
    });

    if (match) {
      const u = match as any;
      // Universal Match: Check EVERY column in the row for the typed password
      for (const col of Object.keys(u)) {
        if (u[col] && String(u[col]).trim() === typedPass) {
          matchedCol = col;
          neonUserFound = true;
          break;
        }
      }

      if (neonUserFound) {
        detailMsg = `Verified match in column '${matchedCol}'`;
      } else {
        detailMsg = "Found user record but password does not match any column";
      }
    } else {
      detailMsg = "No user found with that email/username";
      emailSample = allUsers.slice(0, 5).map((u: any) => u.email);
    }

    // Check gifted_premium as a fallback for the password
    const { rows: giftedColsRows } = await neonClient.queryObject(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'gifted_premium' AND table_schema = 'public'`
    ).catch(() => ({ rows: [] }));
    const availableGiftedCols = giftedColsRows.map((c: any) => (c as any).column_name);

    if (match && !neonUserFound) {
      const { rows: giftedRows } = await neonClient.queryObject(
        `SELECT * FROM gifted_premium WHERE user_id = $1`, [match.id]
      ).catch(() => ({ rows: [] }));

      if (giftedRows.length > 0) {
        const g = giftedRows[0] as any;
        for (const col of Object.keys(g)) {
          if (g[col] && String(g[col]).trim() === typedPass) {
            matchedCol = `gifted_premium.${col}`;
            neonUserFound = true;
            break;
          }
        }
        if (neonUserFound) detailMsg = `Verified match in column '${matchedCol}'`;
      }
    }

    await neonClient.end();

    if (!neonUserFound) {
      console.log(`[sync-neon-auth] Sync failed for ${cleanEmail}: ${detailMsg}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Invalid credentials or user not found',
          debug: { 
            detailMsg, 
            searchedFor: cleanEmail,
            availableUserCols,
            availableGiftedCols,
            emailSample,
            matchFound: !!match
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // 2. Sync to Supabase Auth
    console.log("[sync-neon-auth] Verification successful. Syncing to Supabase...");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Use listUsers and filter to find the existing auth user (more stable)
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const existingAuthUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingAuthUser) {
      console.log(`[sync-neon-auth] Updating existing auth user: ${existingAuthUser.id}`);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: password, email_confirm: true }
      );
      if (updateError) throw updateError;
    } else {
      console.log(`[sync-neon-auth] Creating new auth user: ${email}`);
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: 'neon_gifted_sync' }
      });
      if (createError) throw createError;
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Synced to Supabase Auth' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[sync-neon-auth] error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
