
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

const AUTOMATION_ID = '266aa48a-ab6b-4348-abff-4421f0458d9d';

(async () => {
    console.log(`Updating Automation ${AUTOMATION_ID} to trigger on ALL messages...`);

    const { data, error } = await supabase
        .from('automations')
        .update({
            trigger_config: { messageType: "all" }
        })
        .eq('id', AUTOMATION_ID)
        .select();

    if (error) {
        console.error("Update failed:", error);
    } else {
        console.log("✅ Successfully updated Automation Trigger.");
        console.log("New State:", JSON.stringify(data, null, 2));
    }
})();
