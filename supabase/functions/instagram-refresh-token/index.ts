import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { syncN8nCredential } from "../_shared/n8n.ts";
import { sendAlert } from "../_shared/alert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let isCron = false;
    let userId: string | null = null;

    if (jwt === serviceRoleKey) {
      isCron = true;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Authentication failed" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    let accountIdToRefresh: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.account_id) accountIdToRefresh = body.account_id;
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    let query = supabase
      .from("instagram_accounts")
      .select("*")
      .eq("status", "active");

    if (isCron) {
      query = query.lt("token_expires_at", sevenDaysFromNow);
    } else {
      query = query.eq("user_id", userId);
      if (accountIdToRefresh) {
        query = query.eq("id", accountIdToRefresh);
      } else {
        query = query.lt("token_expires_at", sevenDaysFromNow);
      }
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError || !accounts || accounts.length === 0) {
      if (!isCron) {
        return new Response(JSON.stringify({ message: "No tokens need refreshing" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const results = [];
    const failedAccountIds: string[] = [];

    for (const account of (accounts || [])) {
      try {
        // Refresh the long-lived token
        const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
        refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
        refreshUrl.searchParams.set('access_token', account.access_token);

        const refreshResponse = await fetch(refreshUrl.toString());
        const refreshData = await refreshResponse.json();

        if (!refreshData.access_token) {
          results.push({
            instagram_user_id: account.instagram_user_id,
            username: account.username,
            success: false,
            error: refreshData.error?.message || 'Token refresh failed',
          });
          continue;
        }

        const newAccessToken = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 5184000) * 1000).toISOString();

        // Update the token in the database
        let { error: updateError } = await supabase
          .from("instagram_accounts")
          .update({
            access_token: newAccessToken,
            token_expires_at: newExpiresAt,
            last_synced_at: new Date().toISOString(),
            expiration_notified: false
          })
          .eq("id", account.id);

        // Fallback: If expiration_notified column is missing, try updating without it
        if (updateError && updateError.message.includes("expiration_notified")) {
          console.warn(`[instagram-refresh-token] Column 'expiration_notified' missing, retrying update without it.`);
          const { error: retryError } = await supabase
            .from("instagram_accounts")
            .update({
              access_token: newAccessToken,
              token_expires_at: newExpiresAt,
              last_synced_at: new Date().toISOString()
            })
            .eq("id", account.id);
          updateError = retryError;
        }

        if (updateError) {
          results.push({
            instagram_user_id: account.instagram_user_id,
            username: account.username,
            success: false,
            error: updateError.message,
          });
        } else {
          // --- SYNC TO N8N ---
          try {
            const { data: refreshedAccount } = await supabase
              .from("instagram_accounts")
              .select("*")
              .eq("id", account.id)
              .single();
            if (refreshedAccount) {
              await syncN8nCredential(supabase, refreshedAccount);
            }
          } catch (n8nError) {
            console.error(`[n8n-sync] Failed to sync ${account.username}:`, n8nError);
          }

          results.push({
            instagram_user_id: account.instagram_user_id,
            username: account.username,
            success: true,
            expires_at: newExpiresAt,
          });
        }
      } catch (error: any) {
        results.push({
          instagram_user_id: account.instagram_user_id,
          username: account.username,
          success: false,
          error: error.message,
        });
        // Alert admin when a token refresh fails — this means automations may break
        sendAlert({
          level: "error",
          subject: `Token Refresh Failed — @${account.username}`,
          context: "instagram-refresh-token",
          details: `Failed to refresh Instagram access token for @${account.username}.\nIf this account expires without a successful refresh, all automations for this account will stop.\nError: ${error.message}`,
          data: { username: account.username, instagram_user_id: account.instagram_user_id, user_id: account.user_id, error: error.message }
        }).catch(() => {});
      }
    }

    // --- 55-Day Notification System (Cron Only) ---
    if (isCron) {
      const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      
      // Try to fetch with expiration_notified, fallback if missing
      let expiringQuery = supabase
        .from("instagram_accounts")
        .select("id, user_id, username, expiration_notified")
        .eq("status", "active")
        .lt("token_expires_at", fiveDaysFromNow);
      
      let { data: expiringAccounts, error: expiringError } = await expiringQuery.eq("expiration_notified", false);

      if (expiringError && expiringError.message.includes("expiration_notified")) {
        console.warn("[instagram-refresh-token] Skipping notification system as 'expiration_notified' column is missing.");
        expiringAccounts = null;
      }

      if (expiringAccounts && expiringAccounts.length > 0) {
        const neonDbUrl = Deno.env.get("NEON_DB_URL");
        if (neonDbUrl) {
          const neonClient = new Client(neonDbUrl);
          try {
            await neonClient.connect();
            for (const expAccount of expiringAccounts) {
              const { data: userData } = await supabase.auth.admin.getUserById(expAccount.user_id);
              const email = userData?.user?.email?.trim().toLowerCase();
              if (email) {
                await neonClient.queryObject(`
                  INSERT INTO user_notifications (user_email, user_id, title, message, type, is_dismissible, start_at)
                  VALUES ($1, $2, $3, $4, 'warning', true, NOW())
                `, [
                  email,
                  expAccount.user_id,
                  "⚠️ Instagram Connection Expiring",
                  `Your connection for @${expAccount.username} expires in less than 5 days. Please visit the Account Manager and click Refresh Token to prevent your automations from pausing.`
                ]);
              }
              // Mark as notified so we don't spam them daily
              await supabase
                .from("instagram_accounts")
                .update({ expiration_notified: true })
                .eq("id", expAccount.id);
            }
          } catch (e: any) {
            console.error("Failed to insert expiration notifications to Neon:", e);
            sendAlert({
              level: "warning",
              subject: "Token Expiry Notification System Failed",
              context: "instagram-refresh-token (cron)",
              details: `Could not write expiration warnings to Neon DB. Users with expiring tokens will NOT see the in-app warning.\nError: ${e.message}`,
              data: { error: e.message }
            }).catch(() => {});
          } finally {
            await neonClient.end();
          }
        }
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    sendAlert({
      level: "error",
      subject: "Token Refresh Function Crashed",
      context: "instagram-refresh-token",
      details: `The instagram-refresh-token function threw an unhandled error.\nError: ${error.message}`,
      data: { error: error.message }
    }).catch(() => {});
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
