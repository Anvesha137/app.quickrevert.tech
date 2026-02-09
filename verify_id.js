
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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const WEBHOOK_ID = '17841477169708943';

(async () => {
    console.log(`Checking DB for Instagram ID: ${WEBHOOK_ID}...`);

    const { data: accounts, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('instagram_user_id', WEBHOOK_ID);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Found ${accounts.length} accounts.`);
        console.log(JSON.stringify(accounts, null, 2));
    }
})();
