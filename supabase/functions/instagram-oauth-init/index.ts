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
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: "Missing authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.auth.getUser(jwt);

    if (error || !data?.user) {
      return new Response(JSON.stringify({ error: "Authentication failed", details: error?.message || "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateData = JSON.stringify({
      user_id: data.user.id,
      nonce: crypto.randomUUID(),
    });
    const encoder = new TextEncoder();
    const stateBytes = encoder.encode(stateData);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
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