// REPAIR SCRIPT: sync_routes.js
// 1. Run "npm install node-fetch @supabase/supabase-js"
// 2. Fill in the 4 CONSTANTS below.
// 3. Run "node sync_routes.js"

// --- CONFIGURATION ---
const N8N_BASE_URL = "https://n8n.quickrevert.tech";
const N8N_API_KEY = "PUT_YOUR_N8N_API_KEY_HERE";
const SUPABASE_URL = "https://unwijhqoqvwztpbahlly.supabase.co";
const SUPABASE_SERVICE_KEY = "PUT_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE";
// ---------------------

const { createClient } = require('@supabase/supabase-js');

async function run() {
    console.log("Starting Repair...");

    // 1. Fetch All Workflows from n8n
    const n8nRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
        headers: { "X-N8N-API-KEY": N8N_API_KEY }
    });

    if (!n8nRes.ok) throw new Error(`n8n Error: ${n8nRes.status} ${n8nRes.statusText}`);
    const n8nData = await n8nRes.json();
    const workflows = n8nData.data;

    console.log(`Found ${workflows.length} workflows in n8n.`);

    // 2. Connect to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 3. Update Database
    let synced = 0;

    for (const wf of workflows) {
        if (!wf.nodes) continue;

        // Find Webhook Path
        const webhookNode = wf.nodes.find(n => n.type.includes('webhook') || n.type.includes('Webhook'));

        if (webhookNode && webhookNode.parameters && webhookNode.parameters.path) {
            const path = webhookNode.parameters.path;

            // A. Update n8n_workflows table
            const { error: wfError } = await supabase
                .from('n8n_workflows')
                .update({ webhook_path: path })
                .eq('n8n_workflow_id', wf.id);

            if (wfError) console.error(`Failed to update WF ${wf.id}:`, wfError);

            // B. Ensure Route Exists
            // We need to know who owns it. For this bulk fix, we assume existing owner is correct if row exists.
            // Or we just update the path. The Router reads from n8n_workflows table? 
            // WAIT - The Router reads from `automation_routes`, using `n8n_workflow_id`.
            // Does Router assume the path is in `n8n_workflows`? YES.
            // See webhook-meta code: `pathMap.set(w.n8n_workflow_id, w.webhook_path)`

            // So updating `n8n_workflows` IS ENOUGH if the route exists.
            // If the route DOES NOT exist (ghost workflow), we need to create it.
            // But we don't know the User ID easily here without querying.

            // Let's assume most exist but have WRONG path.
            // Those that don't exist -> The user must toggle them in dashboard.
            // For now, let's fix the Broken Links (active in DB, wrong path).

            if (!wfError) synced++;
        }
    }

    console.log(`✅ Synced ${synced} workflows.`);
}

run().catch(console.error);
