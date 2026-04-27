
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSTAGRAM_CLIENT_ID = Deno.env.get("INSTAGRAM_CLIENT_ID")!;
const INSTAGRAM_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const redirectParam = url.searchParams.get("redirect") === "true";
    const tokenParam = url.searchParams.get("token");
    const authHeader = req.headers.get("Authorization");

    // Support both Header (JSON) and Query Param (Direct Redirect)
    const jwt = authHeader?.replace("Bearer ", "") || tokenParam;

    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: "Missing authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseSecretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";

    // Initialize administrative client for verification
    const supabase = createClient(supabaseUrl, supabaseSecretKey || supabaseAnonKey);
    // Use the jwt already declared above
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed", details: authError?.message || "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateData = JSON.stringify({
      user_id: user.id,
      nonce: crypto.randomUUID(),
    });
    const encoder = new TextEncoder();
    const stateBytes = encoder.encode(stateData);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Using api.instagram.com instead of www.instagram.com to bypass iOS Universal Links
    const authUrl = new URL("https://api.instagram.com/oauth/authorize");
    authUrl.searchParams.set("client_id", INSTAGRAM_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set(
      "scope",
      [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ].join(",")
    );

    if (redirectParam) {
      // 302 Redirect is the "Gold Standard" for bypassing App interception on iOS
      return Response.redirect(authUrl.toString(), 302);
    }

    return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: e instanceof Error ? e.message : "Unknown error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});