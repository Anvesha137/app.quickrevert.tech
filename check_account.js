
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

// Load env vars from .env file manually
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
const targetId = '17841448368971574';

console.log(`Checking for Instagram Account ID: ${targetId}`);

(async () => {
    const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('instagram_user_id', targetId);

    if (error) console.error(error);
    else {
        console.log('Result:', JSON.stringify(data, null, 2));
        if (data.length === 0) console.log('❌ Account NOT found in database.');
        else console.log('✅ Account found.');
    }

    // Also check all accounts to see what we DO have
    const { data: all_accounts } = await supabase.from('instagram_accounts').select('instagram_user_id, username, id');
    console.log('\nAll Accounts:', JSON.stringify(all_accounts, null, 2));


    // Check routes for this account
    if (data.length > 0) {
        const { data: routes } = await supabase.from('automation_routes').select('*').eq('account_id', targetId);
        console.log('\nRoutes for this account:', JSON.stringify(routes, null, 2));
    }
})();
