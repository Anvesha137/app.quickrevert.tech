
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

const ACCOUNT_ID = '256b1404-f6fa-45da-894c-da707102caa7';

(async () => {
    console.log(`Checking Routes for Account UUID: ${ACCOUNT_ID}...`);

    const { data: routes, error } = await supabase
        .from('automation_routes')
        .select('*')
        .eq('account_id', ACCOUNT_ID);

    if (error) {
        console.log("Error:", error);
    } else {
        console.log(`Found ${routes.length} routes.`);
        console.log(JSON.stringify(routes, null, 2));
    }
})();
