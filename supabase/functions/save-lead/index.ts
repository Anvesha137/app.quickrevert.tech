import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    console.log("--- SAVE LEAD FUNCTION INVOKED ---");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const secret = req.headers.get("x-quickrevert-secret");
    if (secret !== Deno.env.get("QUICKREVERT_INTERNAL_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { automation_id, instagram_username, full_name, email, phone, metadata, custom_data, custom_label } = body;

    console.log(`Processing lead for automation: ${automation_id}, user: ${instagram_username}`);

    if (!automation_id || !instagram_username) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Strict validation for email and phone
    if (email && !email.includes('@')) {
        return new Response(JSON.stringify({ error: "Invalid email format: must contain '@'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (phone && !/^[0-9+]+$/.test(phone)) {
        return new Response(JSON.stringify({ error: "Invalid phone format: must be numeric" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Validate automation and extract user_id + name
    const { data: automation, error: autoError } = await supabase
      .from("automations")
      .select("user_id, name")
      .eq("id", automation_id)
      .single();

    if (autoError || !automation) {
        console.error("Automation lookup error:", autoError);
        return new Response(JSON.stringify({ error: "Invalid automation ID" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Insert lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        user_id: automation.user_id,
        instagram_username,
        full_name,
        email,
        phone,
        automation_id,
        automation_name: automation.name,
        custom_data: custom_data || metadata?.custom_field || '',
        custom_label: custom_label || metadata?.custom_label || '',
        metadata: metadata || {}
      })
      .select()
      .single();

    if (leadError) {
        console.error("Lead insert error:", leadError);
        throw leadError;
    }

    console.log(`Successfully saved lead: ${lead.id}`);

    return new Response(JSON.stringify({ success: true, id: lead.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Save lead error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
