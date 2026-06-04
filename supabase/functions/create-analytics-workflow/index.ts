import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ✅ FULLY CODE-LOGIC — n8n removed.
// Previously this created an n8n analytics workflow.
// Now it simply ensures use_code_logic = true on user_limits
// and runs an immediate follower count sync via Graph API.
// No n8n dependency, no workflow creation needed.

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body = await req.json();
        const { userId, instagramAccountId } = body;

        if (!userId || !instagramAccountId) {
            throw new Error("Missing required fields: userId, instagramAccountId");
        }

        console.log(`[create-analytics-workflow] Code-logic setup for user=${userId} ig=${instagramAccountId}`);

        // 1. Fetch the Instagram account
        const { data: igAccount, error: igError } = await supabase
            .from("instagram_accounts")
            .select("id, username, instagram_user_id, access_token, initial_followers_count")
            .eq("id", instagramAccountId)
            .single();

        if (igError || !igAccount) throw new Error("Failed to fetch IG Account: " + igError?.message);

        // 2. Ensure use_code_logic = true in user_limits (enables the code-logic router in webhook-meta)
        const { error: limitsError } = await supabase
            .from("user_limits")
            .upsert(
                { user_id: userId, use_code_logic: true },
                { onConflict: "user_id", ignoreDuplicates: false }
            );

        if (limitsError) {
            console.error("[create-analytics-workflow] user_limits upsert failed:", limitsError);
            // Non-fatal — continue
        }

        // 3. Run an immediate follower count sync via Instagram Graph API
        let followersUpdated = false;
        try {
            const igRes = await fetch(
                `https://graph.instagram.com/v21.0/me?fields=followers_count,username&access_token=${igAccount.access_token}`
            );

            if (igRes.ok) {
                const igData = await igRes.json();
                const followersCount = igData.followers_count;

                if (typeof followersCount === "number") {
                    const updatePayload: any = {
                        followers_count: followersCount,
                        followers_last_updated: new Date().toISOString(),
                    };

                    if (!igAccount.initial_followers_count || igAccount.initial_followers_count === 0) {
                        updatePayload.initial_followers_count = followersCount;
                    }

                    const { error: updateErr } = await supabase
                        .from("instagram_accounts")
                        .update(updatePayload)
                        .eq("id", igAccount.id);

                    if (!updateErr) {
                        followersUpdated = true;
                        console.log(`[create-analytics-workflow] ✅ Initial follower sync: ${igAccount.username} → ${followersCount}`);
                    }
                }
            }
        } catch (syncErr: any) {
            console.warn("[create-analytics-workflow] Initial sync failed (non-fatal):", syncErr.message);
        }

        // 4. Return success — the global sync-all-followers cron handles ongoing updates every 2 days
        return new Response(
            JSON.stringify({
                success: true,
                message: "Analytics tracking enabled via code logic",
                followersUpdated,
                note: "Follower counts auto-sync every 2 days via scheduled cron — no n8n workflow needed"
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("[create-analytics-workflow] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
