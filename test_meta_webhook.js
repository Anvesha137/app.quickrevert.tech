
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
if (!supabaseUrl) {
    console.error("No SUPABASE_URL found");
    process.exit(1);
}

const webhookUrl = `${supabaseUrl}/functions/v1/webhook-meta`;

console.log(`Sending test request to ${webhookUrl}...`);

fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        object: 'instagram',
        entry: [{
            id: 'test_meta_id',
            messaging: [{
                sender: { id: 'manual_test_sender' },
                recipient: { id: 'manual_test_recipient' },
                message: { text: "Manual Test for Meta Webhook" }
            }]
        }]
    })
}).then(async res => {
    console.log(`Response status: ${res.status}`);
    console.log(`Response text: ${await res.text()}`);
}).catch(err => console.error("Fetch failed:", err));
