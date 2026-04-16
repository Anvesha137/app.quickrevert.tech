import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateStr = url.searchParams.get("state");
    if (!stateStr) throw new Error("Missing state parameter");
    
    const state = JSON.parse(stateStr);
    const { userId, redirectAfter } = state;

    if (!code || !userId) throw new Error("Invalid callback parameters");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured in Supabase secrets");

    const tokenUrl = "https://oauth2.googleapis.com/token";
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/auth-google-callback`;

    const tokenOptions = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    };

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenOptions).toString(),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    const { refresh_token, access_token } = tokenData;
    
    // Note: refresh_token is only returned on the first authorization or if prompt=consent is used.
    if (!refresh_token) {
       console.warn("No refresh token received for user", userId);
       // We might already have one, but for a clean flow we should have received it.
    }

    // Get user email for display
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userData = await userResponse.json();
    const googleEmail = userData.email;

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const upsertData: any = {
      user_id: userId,
      google_email: googleEmail,
      is_connected: true,
      updated_at: new Date().toISOString(),
    };
    
    // Only update refresh token if we got a new one
    if (refresh_token) {
      upsertData.google_refresh_token = refresh_token;
    }

    const { error: dbError } = await supabase
      .from('user_google_configs')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (dbError) throw dbError;

    // Redirect back to app
    const finalRedirect = redirectAfter || "https://app.quickrevert.tech/dashboard/automations";
    return Response.redirect(finalRedirect, 302);
  } catch (error: any) {
    console.error("Error in auth-google-callback:", error);
    return new Response(`Error: ${error.message}. Please try again.`, { 
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "text/plain" }
    });
  }
});
