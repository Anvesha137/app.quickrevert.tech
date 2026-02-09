
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

let envVars = {};
try {
    const envText = fs.readFileSync('.env', 'utf-8');
    envText.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            let val = parts.slice(1).join('=').trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            envVars[key] = val;
        }
    });
} catch (e) { }

const supabaseUrl = envVars['SUPABASE_URL'] || envVars['VITE_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
    // Fetch the token from DB
    const { data: accounts, error } = await supabase
        .from('instagram_accounts')
        .select('*');

    if (error || !accounts || accounts.length === 0) {
        console.error("No accounts found in DB");
        return;
    }

    const account = accounts[0];
    console.log(`Checking Token for stored ID: ${account.instagram_user_id} (${account.username})`);

    const accessToken = account.access_token;
    if (!accessToken) {
        console.error("No access token found for this account.");
        return;
    }

    // Check "Me"
    console.log("Fetching /me ...");
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,username&access_token=${accessToken}`);
    const meData = await meRes.json();
    console.log("/me result:", JSON.stringify(meData, null, 2));

    // Check "v21.0/[stored_id]"
    console.log(`Fetching /${account.instagram_user_id} ...`);
    const storedRes = await fetch(`https://graph.facebook.com/v21.0/${account.instagram_user_id}?fields=id,name,username&access_token=${accessToken}`);
    const storedData = await storedRes.json();
    console.log(`/${account.instagram_user_id} result:`, JSON.stringify(storedData, null, 2));

    // Check "v21.0/[webhook_id]"
    const webhookId = '17841448368971574';
    console.log(`Fetching /${webhookId} ...`);
    const whRes = await fetch(`https://graph.facebook.com/v21.0/${webhookId}?fields=id,name,username&access_token=${accessToken}`);
    const whData = await whRes.json();
    console.log(`/${webhookId} result:`, JSON.stringify(whData, null, 2));

})();
