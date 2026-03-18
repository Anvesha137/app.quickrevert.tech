
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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ACCOUNT_ID = '256b1404-f6fa-45da-894c-da707102caa7';
const AUTOMATION_ID = '266aa48a-ab6b-4348-abff-4421f0458d9d';

(async () => {
    console.log("Fetching n8n_workflow_id...");
    const { data: n8nWf, error: wfError } = await supabase
        .from('n8n_workflows')
        .select('*')
        .eq('automation_id', AUTOMATION_ID)
        .maybeSingle();

    if (wfError || !n8nWf) {
        console.error("Could not find n8n workflow for automation:", AUTOMATION_ID, wfError);
        return;
    }

    const n8nWorkflowId = n8nWf.n8n_workflow_id;
    const userId = n8nWf.user_id;
    console.log(`Found n8n Workflow ID: ${n8nWorkflowId}, User ID: ${userId}`);

    // Insert into automation_routes
    const { data: route, error: routeError } = await supabase
        .from('automation_routes')
        .insert({
            user_id: userId,
            account_id: ACCOUNT_ID,
            n8n_workflow_id: n8nWorkflowId,
            event_type: 'messaging',
            sub_type: 'message', // Handle messages
            is_active: true
        })
        .select();

    if (routeError) {
        console.error("Failed to insert route:", routeError);
    } else {
        console.log("✅ Successfully inserted route:", route);
    }

})();
