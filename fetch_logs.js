
const url = 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/debug-db';
import fs from 'fs';


(async () => {
    console.log(`--- Fetching Debug Data from ${url} ---`);
    try {
        const logRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (logRes.ok) {
            const data = await logRes.json();
            fs.writeFileSync('debug_logs.json', JSON.stringify(data, null, 2));
            console.log("Logs saved to debug_logs.json");
        } else {
            console.log("Failed to fetch data:", await logRes.text());
        }
    } catch (error) {
        console.error(`Error:`, error.message);
    }
})();
