import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.quickrevert.tech',
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

    // Also get gifted_premium columns for debug
    const { rows: giftedColsRows } = await neonClient.queryObject(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'gifted_premium' AND table_schema = 'public'`
    ).catch(() => ({ rows: [] }));
    const availableGiftedCols = giftedColsRows.map((c: any) => c.column_name);

    match = allUsers.find((u: any) => {
      const dbEmail = String(u.email || '').trim().toLowerCase();
      const dbUser = String(u.username || '').trim().toLowerCase();
      return dbEmail === cleanEmail || dbUser === cleanEmail;
    });

    if (match) {
      const u = match as any;
      let overrideExists = false;
      let overrideMatched = false;

      // 1. Check for gifted_premium override
      const { rows: giftedRows } = await neonClient.queryObject(
        `SELECT * FROM gifted_premium WHERE user_id = $1`, [match.id]
      ).catch(() => ({ rows: [] }));

      if (giftedRows.length > 0) {
        const g = giftedRows[0] as any;
        // Search for any password-related override columns in gifted_premium
        const gCols = Object.keys(g).filter(k => k.toLowerCase().includes('pass'));
        for (const col of gCols) {
          if (g[col] && String(g[col]).trim() !== '') {
            overrideExists = true;
            if (String(g[col]).trim() === typedPass) {
              overrideMatched = true;
              matchedCol = `gifted_premium.${col}`;
              neonUserFound = true;
              break;
            }
          }
        }
      }

      // 2. Check for users table override (if no gifted override was found)
      if (!overrideExists) {
        const uCols = Object.keys(u).filter(k => 
          k.toLowerCase().includes('pass') && !k.toLowerCase().includes('hash')
        );
        for (const col of uCols) {
          if (u[col] && String(u[col]).trim() !== '') {
            overrideExists = true;
            if (String(u[col]).trim() === typedPass) {
              overrideMatched = true;
              matchedCol = col;
              neonUserFound = true;
              break;
            }
          }
        }
      }

      // If an override is set in the DB, it acts as the ONLY valid password.
      if (overrideExists) {
        if (!overrideMatched) {
          detailMsg = "Invalid password. Updated dashboard password override is required.";
        } else {
          detailMsg = `Verified match in override column '${matchedCol}'`;
        }
      } else {
        // 3. Fallback to sha512 hash
        if (u.password_hash && String(u.password_hash).includes(':')) {
          const storedHash = String(u.password_hash).trim();
          try {
            const verifySha512Hash = async (password: string, hashWithSalt: string) => {
              const [saltHex, originalHashHex] = hashWithSalt.split(':');
              const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
              const encoder = new TextEncoder();
              const keyMaterial = await crypto.subtle.importKey(
                "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
              );
              const derivedBits = await crypto.subtle.deriveBits(
                { name: "PBKDF2", salt, iterations: 1000, hash: "SHA-512" },
                keyMaterial, 64 * 8
              );
              const derivedHex = Array.from(new Uint8Array(derivedBits))
                .map(b => b.toString(16).padStart(2, "0")).join("");
              return derivedHex === originalHashHex;
            };

            const isMatch = await verifySha512Hash(typedPass, storedHash);
            if (isMatch) {
              matchedCol = 'password_hash (sha512-salt)';
              neonUserFound = true;
            }
          } catch (shaErr) {
            console.error(`[sync-neon-auth] SHA512 check error:`, shaErr);
          }
        }

        // 4. Fallback to bcrypt hash
        if (!neonUserFound && u.password_hash) {
          const storedHash = String(u.password_hash).trim();
          if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
            try {
              const { compare } = await import("https://deno.land/x/bcrypt@v0.4.1/mod.ts");
              const isMatch = await compare(typedPass, storedHash);
              if (isMatch) {
                matchedCol = 'password_hash (bcrypt)';
                neonUserFound = true;
              }
            } catch (bcryptErr) {
              console.error(`[sync-neon-auth] bcrypt compare error:`, bcryptErr);
            }
          }
        }

        if (neonUserFound) {
          detailMsg = `Verified match in hash column '${matchedCol}'`;
        } else {
          const hashInfo = u.password_hash 
            ? `password_hash exists (len=${String(u.password_hash).length})` 
            : 'no password_hash column';
          detailMsg = `Found normal user but password does not match hashes. ${hashInfo}`;
        }
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
      
      // Revoke all existing sessions to satisfy "old password/sessions become invalid"
      console.log(`[sync-neon-auth] Revoking sessions for user: ${existingAuthUser.id}`);
      const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(existingAuthUser.id);
      if (signOutError) {
        console.warn(`[sync-neon-auth] Sign out failed (usually because no active sessions):`, signOutError.message);
      }
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
