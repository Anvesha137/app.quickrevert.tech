import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSTAGRAM_CLIENT_ID = Deno.env.get("INSTAGRAM_CLIENT_ID");
const INSTAGRAM_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log("Starting OAuth init");
    
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header:", authHeader ? "present" : "missing");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Missing JWT", details: "No Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    console.log("JWT extracted, length:", jwt.length);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("Supabase URL:", supabaseUrl ? "present" : "missing");
    console.log("Supabase Anon Key:", supabaseAnonKey ? "present" : "missing");
    console.log("Supabase Service Key:", supabaseServiceKey ? "present" : "missing");

    // Use service role key to validate the JWT
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    
    console.log("Validating user with service role key...");
    const { data, error } = await supabase.auth.getUser(jwt);
    
    if (error) {
      console.error("Auth error:", error.message);
      console.error("Error code:", error.code);
      console.error("Error status:", error.status);
      console.error("JWT token (first 20 chars):", jwt.substring(0, 20));
      return new Response(JSON.stringify({ error: "Invalid JWT", details: error.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!data?.user) {
      console.error("No user data returned");
      return new Response(JSON.stringify({ error: "Invalid JWT", details: "No user found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User validated:", data.user.id);

    const stateData = JSON.stringify({
      user_id: data.user.id,
      nonce: crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''),
    });
    const encoder = new TextEncoder();
    const stateBytes = encoder.encode(stateData);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
    authUrl.searchParams.set("force_reauth", "true");
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
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
      ].join(",")
    );

    console.log("OAuth URL generated successfully");
    
    return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: String(e), details: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});