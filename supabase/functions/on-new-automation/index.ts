import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { sendAlert } from "../_shared/alert.ts";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  const isInternal = req.headers.get("x-quickrevert-internal") === "true";
  const expectedAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Allow internal/service role, OR standard JWT user
  if (!isInternal && authHeader !== expectedAuth) {
    // Check if it's a valid user JWT
    const { data: { user }, error } = await supabase.auth.getUser(authHeader?.replace("Bearer ", "") || "");
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  try {
    const payload = await req.json();
    const record = payload.record;

    // Only alert on INSERT
    if (payload.type !== 'INSERT' || !record) {
      return new Response("Not an INSERT event", { status: 200 });
    }

    // Get the user's instagram username
    const { data: instaData } = await supabase
      .from('instagram_accounts')
      .select('username')
      .eq('user_id', record.user_id)
      .eq('status', 'active')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const username = instaData?.username || "Unknown";

    await sendAlert({
      channel: 'automation',
      level: 'info',
      subject: `New Automation Created`,
      context: 'on-new-automation',
      details: `**@${username}** created a new automation\n**Type:** \`${record.trigger_type || 'Unknown'}\`\n**Name:** ${record.name || 'Untitled'}`,
      data: {
        userId: record.user_id,
        automationId: record.id,
        triggerType: record.trigger_type,
        username
      },
    });

    return new Response("Success", { status: 200 });
  } catch (error: any) {
    console.error("Failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
