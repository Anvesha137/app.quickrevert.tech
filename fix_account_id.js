
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

// Load env vars
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
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY']; // Must use Service Key for update

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// The ID coming from the Webhook
const WEBHOOK_ID = '17841448368971574';
// The ID we likely have (Basic Display ID) - we'll find whatever is there for the user.
const USERNAME = 'quickrevert_official';

(async () => {
    console.log(`Fixing Account ID for username: ${USERNAME}...`);

    // 1. Find the account
    const { data: accounts, error: findError } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('username', USERNAME);

    if (findError || !accounts || accounts.length === 0) {
        console.error("Could not find account for user:", USERNAME);
        return;
    }

    const account = accounts[0];
    console.log(`Found account: ${account.id}`);
    console.log(`Current ID: ${account.instagram_user_id}`);
    console.log(`Target ID: ${WEBHOOK_ID}`);

    if (account.instagram_user_id === WEBHOOK_ID) {
        console.log("ID already matches. No update needed.");
        return;
    }

    // 2. Update the ID
    const { data: updated, error: updateError } = await supabase
        .from('instagram_accounts')
        .update({ instagram_user_id: WEBHOOK_ID })
        .eq('id', account.id)
        .select();

    if (updateError) {
        console.error("Update failed:", updateError);
    } else {
        console.log("✅ Successfully updated Account ID.");
        console.log("New State:", updated);
    }

})();
