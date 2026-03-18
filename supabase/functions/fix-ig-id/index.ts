import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixInstagramId() {
    console.log("🔍 Starting Automatic ID Fix...");

    // 1. Get the account and token
    const { data: accounts, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('status', 'active');

    if (error || !accounts || accounts.length === 0) {
        console.error("❌ No active accounts found.");
        return;
    }

    for (const account of accounts) {
        console.log(`\nChecking account: ${account.username}`);
        console.log(`Current DB ID: ${account.instagram_business_id}`);
        console.log(`Access Token: ${account.access_token ? 'Present' : 'Missing'}`);

        if (!account.access_token) continue;

        // 2. Try to fetch the REAL Business ID using Graph API
        // We need to find the Page connected to this user, then the IG User connected to that Page
        try {
            // A. Get User's Pages
            const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account,name&access_token=${account.access_token}`;
            console.log(`Fetching Pages from Facebook Graph API...`);

            const pagesRes = await fetch(pagesUrl);
            const pagesData = await pagesRes.json();

            if (pagesData.error) {
                console.error("❌ Graph API Error:", pagesData.error.message);

                // Fallback: Try /me on Instagram Graph API (diff endpoint)
                console.log("Trying fallback to instagram.com/me...");
                const meUrl = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${account.access_token}`;
                const meRes = await fetch(meUrl);
                const meData = await meRes.json();
                console.log("Instagram /me data:", meData);
                continue;
            }

            console.log(`Found ${pagesData.data?.length || 0} pages`);

            // B. Find the page with an Instagram Business Account
            let realIgId = null;

            for (const page of pagesData.data || []) {
                if (page.instagram_business_account) {
                    realIgId = page.instagram_business_account.id;
                    console.log(`✅ Found Linked Instagram Business ID: ${realIgId} (on page: ${page.name})`);
                    break;
                }
            }

            if (realIgId) {
                // C. Compare and Update
                if (realIgId !== account.instagram_business_id) {
                    console.log(`⚠️ MISMATCH DETECTED!`);
                    console.log(`   DB ID:   ${account.instagram_business_id}`);
                    console.log(`   Real ID: ${realIgId}`);
                    console.log(`   --> Updating database...`);

                    const { error: updateError } = await supabase
                        .from('instagram_accounts')
                        .update({ instagram_business_id: realIgId })
                        .eq('id', account.id);

                    if (updateError) console.error("❌ Update failed:", updateError);
                    else console.log("✅ Database updated successfully!");
                } else {
                    console.log("✅ IDs match. No update needed.");
                }
            } else {
                console.error("❌ No Instagram Business Account found linked to any Page.");
            }

        } catch (err: any) {
            console.error("❌ Error during fetch:", err.message);
        }
    }
}

Deno.serve(async (req) => {
    await fixInstagramId();
    return new Response("Fix complete check logs", { status: 200 });
});
