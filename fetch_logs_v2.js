
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

// Load env vars from .env file manually
let envVars = {};
try {
    const envText = fs.readFileSync('.env', 'utf-8');
    envText.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;

        // Split on first '=' only
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            // join back the rest in case value contains '='
            let val = parts.slice(1).join('=').trim();
            // Remove surrounding quotes if present
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
                val = val.slice(1, -1);
            }
            envVars[key] = val;
        }
    });
} catch (e) {
    console.error('Failed to read .env file:', e.message);
    // Fallback to process.env if available
    envVars = process.env;
}

const supabaseUrl = envVars['SUPABASE_URL'] || envVars['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
    try {
        console.log('--- FAILED EVENTS (Last 10) ---');
        const { data: failed, error: failedError } = await supabase
            .from('failed_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (failedError) console.error(failedError);
        else console.log(JSON.stringify(failed, null, 2));

        console.log('\n--- AUTOMATION ACTIVITIES (Last 10) ---');
        const { data: activities, error: actError } = await supabase
            .from('automation_activities')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (actError) console.error(actError);
        else console.log(JSON.stringify(activities, null, 2));

        console.log('\n--- N8N WORKFLOWS ---');
        const { data: workflows, error: wfError } = await supabase
            .from('n8n_workflows')
            .select('*');
        if (wfError) console.error(wfError);
        else console.log(JSON.stringify(workflows, null, 2));
    } catch (err) {
        console.error('Unexpected error:', err);
    }
})();
