import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ✅ FULLY CODE-LOGIC — n8n removed.
// This function directly hits the Instagram Graph API for the requesting user's
// connected accounts and updates instagram_accounts in Supabase.
// No n8n dependency, no analytics workflow needed.

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Validate the calling user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Missing authorization header");

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) throw new Error("Invalid user token");

        // Fetch all active Instagram accounts for this user
        const { data: accounts, error: fetchError } = await supabase
            .from("instagram_accounts")
            .select("id, instagram_user_id, access_token, initial_followers_count, username")
            .eq("user_id", user.id)
            .eq("status", "active")
            .not("access_token", "is", null);

        if (fetchError) throw fetchError;
        if (!accounts || accounts.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: "No active Instagram accounts found" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let successCount = 0;
        let failCount = 0;
        const results: any[] = [];

        // Hit Graph API directly for each account — same as sync-all-followers
        for (const account of accounts) {
            try {
                const igRes = await fetch(
                    `https://graph.instagram.com/v21.0/me?fields=followers_count,username,media_count&access_token=${account.access_token}`
                );

                if (!igRes.ok) {
                    const errText = await igRes.text();
                    console.error(`[refresh-analytics] Graph API failed for ${account.username}:`, errText);
                    failCount++;
                    results.push({ username: account.username, status: "failed", error: errText });
                    continue;
                }

                const igData = await igRes.json();
                const followersCount = igData.followers_count;

                if (typeof followersCount !== "number") {
                    console.warn(`[refresh-analytics] No followers_count for ${account.username}`);
                    failCount++;
                    continue;
                }

                const updatePayload: any = {
                    followers_count: followersCount,
                    followers_last_updated: new Date().toISOString(),
                };

                // Lock in baseline if never set
                if (!account.initial_followers_count || account.initial_followers_count === 0) {
                    updatePayload.initial_followers_count = followersCount;
                }

                const { error: updateError } = await supabase
                    .from("instagram_accounts")
                    .update(updatePayload)
                    .eq("id", account.id);

                if (updateError) {
                    console.error(`[refresh-analytics] DB update failed for ${account.username}:`, updateError);
                    failCount++;
                    results.push({ username: account.username, status: "db_error" });
                } else {
                    successCount++;
                    results.push({ username: account.username, status: "updated", followers: followersCount });
                    console.log(`[refresh-analytics] ✅ ${account.username} → ${followersCount} followers`);
                }
            } catch (err: any) {
                console.error(`[refresh-analytics] Exception for ${account.username}:`, err.message);
                failCount++;
                results.push({ username: account.username, status: "exception", error: err.message });
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Updated ${successCount} account(s). Failed: ${failCount}.`,
                results,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("[refresh-analytics] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
