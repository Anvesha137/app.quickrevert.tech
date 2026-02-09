
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

// Load env vars from .env file manually
const envText = fs.readFileSync('.env', 'utf-8');
const envVars = Object.fromEntries(
    envText.split('\n').map(line => {
        const [key, ...val] = line.split('=');
        return [key, val.join('=').trim()];
    })
);

const supabaseUrl = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL;
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('--- FAILED EVENTS (Last 5) ---');
const { data: failed, error: failedError } = await supabase
    .from('failed_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
if (failedError) console.error(failedError);
else console.log(JSON.stringify(failed, null, 2));

console.log('\n--- AUTOMATION ACTIVITIES (Last 5) ---');
const { data: activities, error: actError } = await supabase
    .from('automation_activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
if (actError) console.error(actError);
else console.log(JSON.stringify(activities, null, 2));

console.log('\n--- N8N WORKFLOWS ---');
const { data: workflows, error: wfError } = await supabase
    .from('n8n_workflows')
    .select('*');
if (wfError) console.error(wfError);
else console.log(JSON.stringify(workflows, null, 2));
