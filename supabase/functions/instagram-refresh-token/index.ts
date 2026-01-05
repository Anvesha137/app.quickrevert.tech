import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all Instagram accounts for this user that need refreshing (expiring within 7 days)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: accounts, error: accountsError } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lt("token_expires_at", sevenDaysFromNow);

    if (accountsError || !accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No tokens need refreshing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const account of accounts) {
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
        const { error: updateError } = await supabase
          .from("instagram_accounts")
          .update({
            access_token: newAccessToken,
            token_expires_at: newExpiresAt,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        if (updateError) {
          results.push({
            instagram_user_id: account.instagram_user_id,
            username: account.username,
            success: false,
            error: updateError.message,
          });
        } else {
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
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});