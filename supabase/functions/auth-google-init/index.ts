import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const redirectAfter = url.searchParams.get("redirect") || "";

    if (!userId) throw new Error("Missing userId");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured in Supabase secrets");

    const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/auth-google-callback`;

    const options = {
      redirect_uri: callbackUrl,
      client_id: clientId,
      access_type: "offline",
      response_type: "code",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email openid",
      state: JSON.stringify({ userId, redirectAfter }),
    };

    const qs = new URLSearchParams(options);
    return Response.redirect(`${rootUrl}?${qs.toString()}`, 302);
  } catch (error: any) {
    console.error("Error in auth-google-init:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
