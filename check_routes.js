
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
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// The account ID for blr.food.finds (newly connected)
const ACCOUNT_ID = '1d0e01c8-dad5-4256-8cca-71e58712758a';

(async () => {
    console.log(`Checking Routes for Account ID: ${ACCOUNT_ID}...`);

    const { data: routes, error } = await supabase
        .from('automation_routes')
        .select('*')
        .eq('account_id', ACCOUNT_ID);

    if (error) {
        console.error("Error fetching routes:", error);
    } else {
        console.log("Routes Found:", JSON.stringify(routes, null, 2));
        if (routes.length === 0) {
            console.log("❌ NO ROUTES FOUND for this account! The automation is not turned on for this user.");
        }
    }

    // Also verify automations exist
    const { data: automations } = await supabase.from('automations').select('*').limit(5);
    console.log("Sample Automations:", JSON.stringify(automations, null, 2));

})();
