
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Fetch a real user to test with
async function getTestUser() {
    try {
        const res = await fetch(`${url}/rest/v1/instagram_accounts?select=id,user_id&limit=1`, {
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`
            }
        });
        const data = await res.json();
        return data[0];
    } catch (e) {
        console.error("Failed to get user:", e);
        return null;
    }
}

(async () => {
    const account = await getTestUser();

    if (account) {
        const { id: instagramAccountId, user_id: userId } = account;
        console.log(`\nTriggering Analytics Workflow for User: ${userId}, IG: ${instagramAccountId}`);

        try {
            const response = await fetch(`${url}/functions/v1/create-analytics-workflow`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                    userId: userId,
                    instagramAccountId: instagramAccountId
                }),
            });

            console.log(`Function Response: ${response.status}`);
            console.log(await response.text());
        } catch (e) {
            console.error("Function call failed:", e);
        }
    } else {
        console.log("No accounts found to test.");
    }

})();
