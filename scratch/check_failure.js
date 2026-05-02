
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://unwijhqoqvwztpbahlly.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkRecentActivities() {
    console.log("--- Fetching Recent Activities ---");
    const { data: activities, error } = await supabase
        .from('automation_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching activities:", error);
    } else {
        console.table(activities.map(a => ({
            id: a.id,
            type: a.activity_type,
            user: a.target_username,
            msg: a.message?.substring(0, 50),
            status: a.status,
            time: a.created_at
        })));
    }

    console.log("\n--- Fetching Failed Events ---");
    const { data: failed, error: failedError } = await supabase
        .from('failed_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (failedError) {
        console.error("Error fetching failed events:", failedError);
    } else {
        console.table(failed.map(f => ({
            id: f.id,
            error: f.error_message,
            time: f.created_at
        })));
    }

    console.log("\n--- Fetching Recent Processed Events (Idempotency) ---");
    const { data: processed, error: procError } = await supabase
        .from('processed_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (procError) {
        console.error("Error fetching processed events:", procError);
    } else {
        console.table(processed.map(p => ({
            id: p.event_id,
            account: p.account_id,
            time: p.created_at
        })));
    }
}

checkRecentActivities();
