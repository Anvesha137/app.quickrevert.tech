import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Always handle OPTIONS for CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
       return new Response(JSON.stringify({ exists: true, debug: 'Missing env vars' }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 200,
       });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { email } = await req.json();

    if (!email) {
       return new Response(JSON.stringify({ exists: true, debug: 'No email provided' }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 200,
       });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("DB Error:", error);
      // On DB error, we return exists: true to avoid blocking the user
      return new Response(JSON.stringify({ exists: true, debug: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ exists: !!data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Global Error:", error.message);
    // On any crash, we return exists: true so the user can at least try to reset
    return new Response(JSON.stringify({ exists: true, debug: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
